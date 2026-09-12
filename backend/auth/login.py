from datetime import datetime, timedelta
from flask import request, session
from werkzeug.security import check_password_hash
import database as db
from auth.utils import success, error, utc_now
from auth.session import start_pending_session, start_setup_session
import auth.attempts as attempts

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
ALLOWED_METHODS = ("TOTP", "PUSH", "BIOMETRIC", "QR")


def login_user():
    """
    POST /api/login
    Step 1 of Authentication: Validates username & password.
    Transitions user to State 2 (Pending 2FA) or Setup Required.
    """
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return error("Username and password are required.", 400)

    user = db.get_user_by_username(username)
    if not user:
        db.log_event(username, "login_password", False)
        return error("Invalid username or password.", 401)

    # Check lockout
    if user["locked_until"]:
        try:
            locked_until = datetime.fromisoformat(user["locked_until"])
            if utc_now() < locked_until:
                db.log_event(username, "login_blocked_lockout", False)
                return error("Account temporarily locked. Please try again later.", 423)
        except (ValueError, TypeError):
            pass

    # Verify password hash
    if not check_password_hash(user["password_hash"], password):
        db.record_failed_attempt(username)
        refreshed_user = db.get_user_by_username(username)

        if refreshed_user["failed_attempts"] >= MAX_FAILED_ATTEMPTS:
            locked_until = (utc_now() + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            db.lock_account(username, locked_until)
            db.log_event(username, "account_locked", False)
            return error(f"Too many failed attempts. Account locked for {LOCKOUT_MINUTES} minutes.", 423)

        db.log_event(username, "login_password", False)
        return error("Invalid username or password.", 401)

    # Password correct -> reset failed attempts
    db.reset_failed_attempts(username)
    db.log_event(username, "login_password", True)

    # Check enrolled & enabled 2FA methods
    enabled_methods = db.get_user_enabled_methods(user["id"])

    # Fallback compatibility: if legacy user has totp_secret and is_2fa_enabled=1 but no methods in auth_methods
    if not enabled_methods and user["is_2fa_enabled"] and user["totp_secret"]:
        db.enable_auth_method(user["id"], "TOTP")
        enabled_methods = ["TOTP"]

    if not enabled_methods:
        start_setup_session(user["id"])
        return success(
            "Please set up two-factor authentication.",
            {
                "next": "setup-2fa",
                "methods": [],
                "enabled_methods": [],
            }
        )

    # Create common authentication attempt
    attempt_id = attempts.create_attempt(user["id"])
    start_pending_session(user["id"], attempt_id)

    # Return all genuinely enrolled methods for that account
    return success(
        "Password verified. Please select a two-factor authentication method.",
        {
            "next": "choose-2fa",
            "attempt_id": attempt_id,
            "methods": enabled_methods,
            "enabled_methods": enabled_methods,
        }
    )


def select_2fa_method():
    """
    POST /api/2fa/select
    Select a 2FA method for the current pending authentication attempt.
    """
    data = request.get_json() or {}
    attempt_id = data.get("attempt_id") or session.get("auth_attempt_id")
    method = data.get("method", "").strip().upper()

    if not attempt_id:
        return error("Attempt ID is required.", 400)

    if method not in ALLOWED_METHODS:
        return error(f"Invalid method '{method}'. Allowed methods: {', '.join(ALLOWED_METHODS)}", 400)

    pending_user_id = session.get("pending_user_id")
    attempt, err = attempts.get_valid_pending_attempt(attempt_id, pending_user_id)
    if err:
        return error(err, 401 if "expired" in err else 400)

    user_id = attempt["user_id"]
    enabled_methods = db.get_user_enabled_methods(user_id)
    if method not in enabled_methods:
        return error(f"Method '{method}' is not enrolled or enabled for this account.", 403)

    attempts.set_attempt_selected_method(attempt_id, method)

    user = db.get_user_by_id(user_id)
    if user:
        db.log_event(user["username"], "2fa_method_selected", True)

    return success(
        f"Selected 2FA method: {method}",
        {
            "attempt_id": attempt_id,
            "method": method,
            "next": f"verify-{method.lower().replace('_', '-')}"
        }
    )

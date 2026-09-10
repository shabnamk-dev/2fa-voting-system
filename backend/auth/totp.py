import base64
import io
import time
import pyotp
import qrcode
from flask import request, session
import database as db
from auth.utils import success, error
from auth.session import finalize_authenticated_session
import auth.attempts as attempts

ISSUER_NAME = "SecureVotingSystem"


def get_totp_setup():
    """
    GET /api/setup-2fa or GET /api/2fa/totp/setup
    Generates or retrieves TOTP secret and provisioning QR code.
    """
    user_id = session.get("setup_user_id") or session.get("user_id") or session.get("pending_user_id")
    if not user_id:
        return error("2FA setup session not found. Please log in first.", 401)

    user = db.get_user_by_id(user_id)
    if not user:
        return error("User not found.", 404)

    cred = db.get_totp_credential(user_id)
    if cred and cred["secret"]:
        secret = cred["secret"]
    elif user["totp_secret"]:
        secret = user["totp_secret"]
        db.create_or_update_totp_credential(user_id, secret)
    else:
        secret = pyotp.random_base32()
        db.create_or_update_totp_credential(user_id, secret)

    # Provisioning URI
    uri = pyotp.TOTP(secret).provisioning_uri(
        name=user["username"],
        issuer_name=ISSUER_NAME
    )

    # Generate QR Code image
    qr = qrcode.make(uri)
    buffer = io.BytesIO()
    qr.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return success(
        "2FA setup information.",
        {
            "username": user["username"],
            "qr_code": f"data:image/png;base64,{qr_base64}",
            "secret": secret,
        }
    )


def confirm_totp_setup():
    """
    POST /api/setup-2fa or POST /api/2fa/totp/enable
    Confirms TOTP setup with a valid 6-digit token and enables the method.
    """
    user_id = session.get("setup_user_id") or session.get("user_id")
    if not user_id:
        return error("2FA setup session not found.", 401)

    data = request.get_json() or {}
    token = str(data.get("token", "")).strip()

    if not token.isdigit() or len(token) != 6:
        return error("OTP must be a 6-digit code.", 400)

    user = db.get_user_by_id(user_id)
    if not user:
        return error("User not found.", 404)

    cred = db.get_totp_credential(user_id)
    secret = cred["secret"] if cred else user["totp_secret"]

    if not secret:
        return error("TOTP secret not initialized. Please request setup first.", 400)

    totp = pyotp.TOTP(secret)
    if not totp.verify(token, valid_window=1):
        db.log_event(user["username"], "2fa_setup_confirmed", False)
        return error("Invalid or expired code.", 401)

    # Enable TOTP method
    db.enable_auth_method(user_id, "TOTP")
    db.log_event(user["username"], "totp_setup", True)
    db.log_event(user["username"], "2fa_setup_confirmed", True)

    # If this was during registration/initial setup, clear setup session so user logs in cleanly
    if "setup_user_id" in session:
        session.clear()

    return success("Two-factor authentication (TOTP) enabled successfully.")


def verify_totp():
    """
    POST /api/verify-totp or POST /api/2fa/verify/totp
    Step 2 of Authentication: Verifies TOTP code against pending attempt.
    """
    data = request.get_json() or {}
    token = str(data.get("token", "")).strip()
    attempt_id = data.get("attempt_id") or session.get("auth_attempt_id")

    if not token.isdigit() or len(token) != 6:
        return error("OTP must be a 6-digit code.", 400)

    pending_user_id = session.get("pending_user_id")
    attempt, err = attempts.get_valid_pending_attempt(attempt_id, pending_user_id)
    if err:
        return error(err, 401 if "expired" in err else 400)

    user_id = attempt["user_id"]
    user = db.get_user_by_id(user_id)
    if not user:
        return error("User not found.", 404)

    cred = db.get_totp_credential(user_id)
    secret = cred["secret"] if cred else user["totp_secret"]
    if not secret:
        return error("TOTP is not configured for this user.", 400)

    totp = pyotp.TOTP(secret)

    # Verify code
    if not totp.verify(token, valid_window=1):
        is_locked, lock_msg = attempts.record_attempt_failure(attempt_id)
        db.log_event(user["username"], "totp_failed", False)
        db.log_event(user["username"], "login_totp", False)
        if is_locked:
            return error(lock_msg, 423)
        return error("Invalid or expired authenticator code.", 401)

    # Replay protection: verify that this timestep hasn't been used before
    current_step = int(time.time() // 30)
    if not db.check_and_update_totp_step(user_id, current_step):
        db.log_event(user["username"], "replay_attack_blocked", False)
        is_locked, lock_msg = attempts.record_attempt_failure(attempt_id)
        if is_locked:
            return error(lock_msg, 423)
        return error("Replayed code detected. Please wait for the next token code.", 401)

    # Authentication successful! Mark attempt verified and transition to State 3
    attempts.mark_attempt_verified(attempt_id)
    db.log_event(user["username"], "login_totp", True)
    db.log_event(user["username"], "authentication_success", True)

    finalize_authenticated_session(user)

    return success(
        "Login successful.",
        {
            "user_id": user["id"],
            "username": user["username"],
            "role": user["role"],
        }
    )

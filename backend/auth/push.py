import secrets
from datetime import datetime, timedelta
from flask import request, session
import database as db
from auth.utils import success, error, utc_now
from auth.session import finalize_authenticated_session
import auth.attempts as attempts

PUSH_TIMEOUT_SECONDS = 120


def enroll_push_device():
    """
    POST /api/2fa/push/enroll
    Registers a trusted device for push notification approvals.
    """
    user_id = session.get("user_id") or session.get("setup_user_id")
    if not user_id:
        return error("Authentication or setup session required.", 401)

    data = request.get_json() or {}
    device_name = data.get("device_name", "Trusted Device").strip()
    device_identifier = data.get("device_identifier") or f"push_{secrets.token_hex(12)}"

    device_id = db.create_push_device(user_id, device_name, device_identifier)
    user = db.get_user_by_id(user_id)
    if user:
        db.log_event(user["username"], "push_device_registered", True)

    if "setup_user_id" in session:
        session.clear()

    return success(
        "Push device enrolled successfully.",
        {
            "device_id": device_id,
            "device_name": device_name,
            "device_identifier": device_identifier,
        },
        201
    )


def create_push_request():
    """
    POST /api/2fa/push/request
    Initiates a new push approval challenge.
    """
    data = request.get_json() or {}
    attempt_id = data.get("attempt_id") or session.get("auth_attempt_id")

    pending_user_id = session.get("pending_user_id")
    attempt, err = attempts.get_valid_pending_attempt(attempt_id, pending_user_id)
    if err:
        return error(err, 401 if "expired" in err else 400)

    user_id = attempt["user_id"]
    user = db.get_user_by_id(user_id)
    if not user:
        return error("User not found.", 404)

    # Verify user has PUSH enabled
    if not db.has_enabled_auth_method(user_id, "PUSH"):
        return error("Push authentication is not enabled for this account.", 403)

    request_id = secrets.token_urlsafe(24)
    expires_at = (utc_now() + timedelta(seconds=PUSH_TIMEOUT_SECONDS)).isoformat()

    db.create_push_request(attempt_id, user_id, request_id, expires_at)
    attempts.set_attempt_selected_method(attempt_id, "PUSH")
    db.log_event(user["username"], "push_requested", True)

    return success(
        "Push approval requested. Please approve on your trusted device.",
        {
            "request_id": request_id,
            "attempt_id": attempt_id,
            "expires_in_seconds": PUSH_TIMEOUT_SECONDS,
            "status": "PENDING",
        }
    )


def get_push_status():
    """
    GET /api/2fa/push/status?request_id=...
    Polling endpoint for Computer A waiting for approval.
    """
    request_id = request.args.get("request_id")
    if not request_id:
        return error("Missing request_id.", 400)

    push_req = db.get_push_request_by_request_id(request_id)
    if not push_req:
        return error("Push request not found.", 404)

    attempt_id = push_req["attempt_id"]
    user_id = push_req["user_id"]
    user = db.get_user_by_id(user_id)

    # Check expiration
    if push_req["status"] == "PENDING":
        expires_at = datetime.fromisoformat(push_req["expires_at"])
        if utc_now() > expires_at:
            db.update_push_request_status(request_id, "EXPIRED")
            attempts.mark_attempt_failed(attempt_id)
            if user:
                db.log_event(user["username"], "push_expired", False)
            return success("Push request expired.", {"status": "EXPIRED"})

    if push_req["status"] == "APPROVED":
        # Finalize the session on Computer A
        attempt = db.get_auth_attempt(attempt_id)
        if attempt and attempt["status"] == "PENDING":
            attempts.mark_attempt_verified(attempt_id)
            if user:
                db.log_event(user["username"], "authentication_success", True)
                if session.get("auth_attempt_id") == attempt_id or session.get("pending_user_id") == user_id:
                    finalize_authenticated_session(user)

        return success(
            "Login approved!",
            {
                "status": "APPROVED",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "role": user["role"],
                } if user else None
            }
        )

    if push_req["status"] == "DENIED":
        attempts.mark_attempt_failed(attempt_id)
        return success("Login request was denied.", {"status": "DENIED"})

    if push_req["status"] == "EXPIRED":
        return success("Push request expired.", {"status": "EXPIRED"})

    return success("Waiting for approval on trusted device...", {"status": "PENDING"})


def get_pending_push_requests():
    """
    GET /api/2fa/push/pending
    Retrieves pending push requests for the authenticated user or trusted device.
    """
    user_id = session.get("user_id")
    device_identifier = request.args.get("device_identifier")

    if not user_id and device_identifier:
        dev = db.get_push_device_by_identifier(device_identifier)
        if dev and dev["is_enabled"]:
            user_id = dev["user_id"]

    if not user_id:
        return error("Authentication required to view pending push requests.", 401)

    pending_list = db.get_pending_push_requests_for_user(user_id)
    return success(
        "Pending push requests.",
        [
            {
                "request_id": r["request_id"],
                "created_at": r["created_at"],
                "expires_at": r["expires_at"],
                "status": r["status"],
            }
            for r in pending_list
        ]
    )


def respond_to_push():
    """
    POST /api/2fa/push/respond
    Called by Trusted Device B to approve or deny a login attempt.
    """
    data = request.get_json() or {}
    request_id = data.get("request_id")
    action = str(data.get("action", "")).strip().lower()

    if not request_id:
        return error("Missing request_id.", 400)

    if action not in ("approve", "deny"):
        return error("Action must be 'approve' or 'deny'.", 400)

    push_req = db.get_push_request_by_request_id(request_id)
    if not push_req:
        return error("Push request not found.", 404)

    if push_req["status"] != "PENDING":
        return error(f"Push request is already {push_req['status'].lower()}.", 409)

    # Check expiration
    expires_at = datetime.fromisoformat(push_req["expires_at"])
    if utc_now() > expires_at:
        db.update_push_request_status(request_id, "EXPIRED")
        attempts.mark_attempt_failed(push_req["attempt_id"])
        return error("Push request has expired.", 410)

    # Verify authorization: responder must be authenticated as the same user (State 3)
    # or present an enrolled trusted-device identifier for that user
    current_user_id = session.get("user_id") if session.get("auth_state") == "AUTHENTICATED" else None
    device_identifier = data.get("device_identifier")

    authorized = False
    if current_user_id:
        if current_user_id == push_req["user_id"]:
            authorized = True
        else:
            return error("Unauthorized to respond to another user's push request.", 403)
    elif device_identifier:
        dev = db.get_push_device_by_identifier(device_identifier)
        if dev and dev["user_id"] == push_req["user_id"] and dev["is_enabled"]:
            authorized = True
        else:
            return error("Invalid or unauthorized trusted device identifier.", 403)

    if not authorized:
        return error("Authentication required to respond to push request.", 401)

    user = db.get_user_by_id(push_req["user_id"])
    username = user["username"] if user else "unknown"

    if action == "approve":
        db.update_push_request_status(request_id, "APPROVED")
        db.log_event(username, "push_approved", True)
        return success("Login approved successfully.")
    else:
        db.update_push_request_status(request_id, "DENIED")
        attempts.mark_attempt_failed(push_req["attempt_id"])
        db.log_event(username, "push_denied", False)
        return success("Login denied.")

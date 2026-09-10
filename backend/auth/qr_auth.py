import base64
import io
import json
import secrets
from datetime import datetime, timedelta
import qrcode
from flask import request, session
import database as db
from auth.utils import success, error, utc_now
from auth.session import finalize_authenticated_session
import auth.attempts as attempts

QR_TIMEOUT_SECONDS = 120


def enroll_qr():
    """
    POST /api/2fa/qr/enroll
    Enables QR challenge-based authentication for the user.
    """
    user_id = session.get("user_id") or session.get("setup_user_id")
    if not user_id:
        return error("Authentication or setup session required.", 401)

    db.enable_auth_method(user_id, "QR")
    user = db.get_user_by_id(user_id)
    if user:
        db.log_event(user["username"], "qr_method_enrolled", True)

    if "setup_user_id" in session:
        session.clear()

    return success("QR code authentication enabled successfully.", {"method": "QR"})


def create_qr_challenge():
    """
    POST /api/2fa/qr/request
    Creates a temporary, single-use, cryptographically random QR challenge.
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

    if not db.has_enabled_auth_method(user_id, "QR"):
        return error("QR authentication is not enabled for this account.", 403)

    request_id = secrets.token_urlsafe(24)
    challenge = secrets.token_urlsafe(32)
    expires_at = (utc_now() + timedelta(seconds=QR_TIMEOUT_SECONDS)).isoformat()

    db.create_qr_request(attempt_id, user_id, request_id, challenge, expires_at)
    attempts.set_attempt_selected_method(attempt_id, "QR")
    db.log_event(user["username"], "qr_auth_requested", True)

    # Encode minimal challenge payload in the QR (never secrets or passwords)
    qr_payload = json.dumps({
        "type": "voting_qr_auth",
        "request_id": request_id,
        "challenge": challenge,
    })

    qr_img = qrcode.make(qr_payload)
    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return success(
        "QR challenge generated. Scan with your trusted device.",
        {
            "request_id": request_id,
            "challenge": challenge,
            "attempt_id": attempt_id,
            "qr_code": f"data:image/png;base64,{qr_base64}",
            "expires_in_seconds": QR_TIMEOUT_SECONDS,
            "status": "PENDING",
        }
    )


def get_qr_status():
    """
    GET /api/2fa/qr/status?request_id=...
    Polling endpoint for Computer A waiting for the QR scan/approval.
    """
    request_id = request.args.get("request_id")
    if not request_id:
        return error("Missing request_id.", 400)

    qr_req = db.get_qr_request_by_request_id(request_id)
    if not qr_req:
        return error("QR request not found.", 404)

    attempt_id = qr_req["attempt_id"]
    user_id = qr_req["user_id"]
    user = db.get_user_by_id(user_id)

    # Check expiration
    if qr_req["status"] == "PENDING":
        expires_at = datetime.fromisoformat(qr_req["expires_at"])
        if utc_now() > expires_at:
            db.update_qr_request_status(request_id, "EXPIRED")
            attempts.mark_attempt_failed(attempt_id)
            if user:
                db.log_event(user["username"], "qr_auth_expired", False)
            return success("QR request expired.", {"status": "EXPIRED"})

    if qr_req["status"] == "APPROVED":
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

    if qr_req["status"] == "DENIED":
        attempts.mark_attempt_failed(attempt_id)
        return success("QR authentication was denied.", {"status": "DENIED"})

    if qr_req["status"] == "EXPIRED":
        return success("QR request expired.", {"status": "EXPIRED"})

    return success("Waiting for QR scan and approval...", {"status": "PENDING"})


def respond_to_qr():
    """
    POST /api/2fa/qr/respond or POST /api/2fa/qr/scan
    Called by mobile device when QR challenge is scanned and approved/denied.
    """
    data = request.get_json() or {}
    challenge = data.get("challenge")
    request_id = data.get("request_id")
    action = str(data.get("action", "approve")).strip().lower()

    if not challenge and not request_id:
        return error("Missing challenge or request_id.", 400)

    if action not in ("approve", "deny"):
        return error("Action must be 'approve' or 'deny'.", 400)

    qr_req = None
    if challenge:
        qr_req = db.get_qr_request_by_challenge(challenge)
    elif request_id:
        qr_req = db.get_qr_request_by_request_id(request_id)

    if not qr_req:
        return error("Invalid or unrecognized QR challenge.", 404)

    if qr_req["status"] != "PENDING":
        return error(f"QR challenge is already {qr_req['status'].lower()}.", 409)

    # Check expiration
    expires_at = datetime.fromisoformat(qr_req["expires_at"])
    if utc_now() > expires_at:
        db.update_qr_request_status(qr_req["request_id"], "EXPIRED")
        attempts.mark_attempt_failed(qr_req["attempt_id"])
        return error("QR challenge has expired.", 410)

    # Authorization check: approving device must be authenticated as the same user (State 3)
    # or supply an enrolled trusted-device identifier for that user
    current_user_id = session.get("user_id") if session.get("auth_state") == "AUTHENTICATED" else None
    device_identifier = data.get("device_identifier")

    authorized = False
    if current_user_id:
        if current_user_id == qr_req["user_id"]:
            authorized = True
        else:
            return error("Unauthorized to approve another user's QR challenge.", 403)
    elif device_identifier:
        dev = db.get_push_device_by_identifier(device_identifier)
        if dev and dev["user_id"] == qr_req["user_id"] and dev["is_enabled"]:
            authorized = True
        else:
            return error("Invalid or unauthorized trusted device identifier.", 403)

    if not authorized:
        return error("Authentication required to scan and approve QR challenge.", 401)

    user = db.get_user_by_id(qr_req["user_id"])
    username = user["username"] if user else "unknown"

    if action == "approve":
        db.update_qr_request_status(qr_req["request_id"], "APPROVED")
        db.log_event(username, "qr_auth_approved", True)
        return success("QR challenge approved successfully.")
    else:
        db.update_qr_request_status(qr_req["request_id"], "DENIED")
        attempts.mark_attempt_failed(qr_req["attempt_id"])
        db.log_event(username, "qr_auth_denied", False)
        return success("QR challenge denied.")

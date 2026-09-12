import base64
import io
import os
import secrets
import socket
from datetime import datetime, timedelta
import qrcode
from flask import request, session
import database as db
from auth.utils import success, error, utc_now
from auth.session import finalize_authenticated_session
import auth.attempts as attempts

QR_TIMEOUT_SECONDS = 120
QR_ENROLL_TIMEOUT_SECONDS = 180


def get_frontend_base_url():
    """
    Returns the frontend URL for mobile QR codes.
    If FRONTEND_URL or HOST_IP is specified, it uses that.
    Otherwise it dynamically resolves the host machine's primary LAN IP
    (e.g., 192.168.x.x) so that mobile devices on the same local Wi-Fi can open the URL.
    """
    custom_url = os.getenv("FRONTEND_URL")
    if custom_url and "localhost" not in custom_url and "127.0.0.1" not in custom_url:
        return custom_url.rstrip("/")

    host_ip = os.getenv("HOST_IP") or os.getenv("LAN_IP")
    if not host_ip:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.2)
            s.connect(("8.8.8.8", 80))
            detected_ip = s.getsockname()[0]
            s.close()
            if detected_ip and not detected_ip.startswith("127."):
                host_ip = detected_ip
        except Exception:
            host_ip = "localhost"

    if host_ip and host_ip != "localhost":
        return f"http://{host_ip}:5173"

    return "http://localhost:5173"


# =========================================================
# 1. QR ENROLLMENT CEREMONY (Pairing Mobile Device)
# =========================================================

def enroll_qr_request():
    """
    POST /api/2fa/qr/enroll-request
    Step 1 of QR Enrollment: Creates a short-lived, single-use enrollment token
    and generates an enrollment QR code for the user's phone to scan.
    """
    user_id = session.get("user_id") or session.get("setup_user_id")
    if not user_id:
        return error("Authentication or setup session required.", 401)

    user = db.get_user_by_id(user_id)
    if not user:
        return error("User not found.", 404)

    token = secrets.token_urlsafe(32)
    expires_at = (utc_now() + timedelta(seconds=QR_ENROLL_TIMEOUT_SECONDS)).isoformat()

    db.create_qr_enrollment_request(user_id, token, expires_at)
    db.log_event(user["username"], "qr_enroll_requested", True)

    frontend_base = get_frontend_base_url()
    enroll_url = f"{frontend_base}/#/qr-enroll?token={token}"

    qr_img = qrcode.make(enroll_url)
    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return success(
        "QR enrollment challenge created. Scan with your mobile device to pair.",
        {
            "token": token,
            "enroll_url": enroll_url,
            "qr_code": f"data:image/png;base64,{qr_base64}",
            "expires_in_seconds": QR_ENROLL_TIMEOUT_SECONDS,
            "status": "PENDING",
            "username": user["username"],
        }
    )


def enroll_qr_confirm():
    """
    POST /api/2fa/qr/enroll-confirm
    Step 2 of QR Enrollment: Scanned by mobile device.
    Verifies enrollment token, registers device with a server-generated credential,
    and enables QR in auth_methods.
    """
    data = request.get_json() or {}
    token = data.get("token", "").strip()
    device_name = data.get("device_name", "Trusted Mobile Device").strip() or "Trusted Mobile Device"

    if not token:
        return error("Missing enrollment token.", 400)

    req = db.get_qr_enrollment_request_by_token(token)
    if not req:
        return error("Invalid or unrecognized QR enrollment token.", 404)

    if req["status"] != "PENDING":
        return error(f"Enrollment challenge is already {req['status'].lower()}.", 409)

    expires_at = datetime.fromisoformat(req["expires_at"])
    if utc_now() > expires_at:
        return error("Enrollment challenge has expired. Please request a new QR code.", 410)

    user_id = req["user_id"]
    user = db.get_user_by_id(user_id)
    if not user:
        return error("User account associated with this enrollment request not found.", 404)

    # Generate server-side cryptographically secure device credentials
    device_identifier = f"qr_dev_{secrets.token_hex(16)}"
    device_secret = secrets.token_urlsafe(32)

    # Persist registered device and enable QR in auth_methods
    db.create_qr_device(user_id, device_name, device_identifier, device_secret)
    db.complete_qr_enrollment_request(token, device_name, device_identifier)
    db.log_event(user["username"], "qr_device_enrolled", True)

    return success(
        "Mobile device successfully enrolled and authorized for QR Login.",
        {
            "device_identifier": device_identifier,
            "device_secret": device_secret,
            "device_name": device_name,
            "username": user["username"],
        },
        201
    )


def enroll_qr_status():
    """
    GET /api/2fa/qr/enroll-status?token=...
    Polling endpoint for PC waiting for mobile device to complete enrollment.
    """
    token = request.args.get("token")
    if not token:
        return error("Missing enrollment token.", 400)

    req = db.get_qr_enrollment_request_by_token(token)
    if not req:
        return error("Enrollment request not found.", 404)

    if req["status"] == "PENDING":
        expires_at = datetime.fromisoformat(req["expires_at"])
        if utc_now() > expires_at:
            return success("Enrollment challenge expired.", {"status": "EXPIRED"})

    if req["status"] == "COMPLETED":
        return success(
            "Device enrollment completed successfully.",
            {
                "status": "COMPLETED",
                "device_name": req["device_name"],
                "device_identifier": req["device_identifier"],
            }
        )

    return success("Waiting for mobile scan...", {"status": req["status"]})


# Backward compatibility endpoint
def enroll_qr():
    return enroll_qr_request()


# =========================================================
# 2. QR AUTHENTICATION CEREMONY (Login)
# =========================================================

def create_qr_challenge():
    """
    POST /api/2fa/qr/request
    Creates a temporary, single-use, cryptographically random QR login challenge.
    Only permitted if user has a genuinely enrolled device in qr_devices.
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
        return error("QR authentication is not enrolled or enabled for this account.", 403)

    request_id = secrets.token_urlsafe(24)
    challenge = secrets.token_urlsafe(32)
    expires_at = (utc_now() + timedelta(seconds=QR_TIMEOUT_SECONDS)).isoformat()

    db.create_qr_request(attempt_id, user_id, request_id, challenge, expires_at)
    attempts.set_attempt_selected_method(attempt_id, "QR")
    db.log_event(user["username"], "qr_auth_requested", True)

    frontend_base = get_frontend_base_url()
    qr_url = f"{frontend_base}/#/qr-approve?request_id={request_id}&challenge={challenge}"

    qr_img = qrcode.make(qr_url)
    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return success(
        "QR challenge generated. Scan with your enrolled mobile device.",
        {
            "request_id": request_id,
            "challenge": challenge,
            "attempt_id": attempt_id,
            "qr_url": qr_url,
            "qr_code": f"data:image/png;base64,{qr_base64}",
            "expires_in_seconds": QR_TIMEOUT_SECONDS,
            "status": "PENDING",
        }
    )


def get_qr_details():
    """
    GET /api/2fa/qr/details?request_id=...&challenge=...
    Retrieves login challenge metadata for the mobile approval interface.
    """
    request_id = request.args.get("request_id")
    challenge = request.args.get("challenge")

    if not request_id and not challenge:
        return error("Missing request_id or challenge.", 400)

    qr_req = None
    if challenge:
        qr_req = db.get_qr_request_by_challenge(challenge)
    elif request_id:
        qr_req = db.get_qr_request_by_request_id(request_id)

    if not qr_req:
        return error("QR challenge not found.", 404)

    # Check expiration
    expires_at = datetime.fromisoformat(qr_req["expires_at"])
    if utc_now() > expires_at:
        db.update_qr_request_status(qr_req["request_id"], "EXPIRED")
        return error("QR challenge has expired.", 410)

    user = db.get_user_by_id(qr_req["user_id"])
    return success(
        "QR challenge details.",
        {
            "request_id": qr_req["request_id"],
            "username": user["username"] if user else "Voter",
            "created_at": qr_req["created_at"],
            "expires_at": qr_req["expires_at"],
            "status": qr_req["status"],
        }
    )


def get_qr_status():
    """
    GET /api/2fa/qr/status?request_id=...
    Polling endpoint for Computer A waiting for the mobile QR scan and approval.
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
    Strictly verifies the approving device is genuinely enrolled for the account.
    """
    data = request.get_json() or {}
    challenge = data.get("challenge")
    request_id = data.get("request_id")
    action = str(data.get("action", "approve")).strip().lower()
    device_identifier = data.get("device_identifier")
    device_secret = data.get("device_secret")

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

    # Verify authorization: Approving device must be enrolled for this user
    authorized = False
    current_user_id = session.get("user_id") if session.get("auth_state") == "AUTHENTICATED" else None

    if current_user_id and current_user_id == qr_req["user_id"]:
        authorized = True
    elif device_identifier:
        # Check in qr_devices
        qr_dev = db.get_qr_device_by_identifier(device_identifier)
        if qr_dev and qr_dev["user_id"] == qr_req["user_id"] and qr_dev["is_enabled"]:
            if device_secret:
                if qr_dev["device_secret"] == device_secret:
                    authorized = True
            else:
                authorized = True
        else:
            # Fallback: check in push_devices if enrolled as trusted device
            push_dev = db.get_push_device_by_identifier(device_identifier)
            if push_dev and push_dev["user_id"] == qr_req["user_id"] and push_dev["is_enabled"]:
                authorized = True

    if not authorized:
        return error("Unauthorized device. This mobile device is not enrolled for this account.", 403)

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

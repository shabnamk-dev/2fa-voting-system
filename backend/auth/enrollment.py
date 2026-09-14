from flask import session
import database as db
from auth.utils import success, error
from auth.session import login_required

ALL_METHOD_METADATA = [
    {"method": "TOTP", "name": "Authenticator App (TOTP)", "description": "Time-based One-Time Password using Google Authenticator, Authy, etc."},
    {"method": "QR", "name": "QR Code Login", "description": "Scan dynamic challenge QR with your enrolled mobile device to approve"},
    {"method": "PUSH", "name": "Trusted Device Approval", "description": "Approve login prompt from a registered trusted device"},
    {"method": "BIOMETRIC", "name": "Platform Biometrics", "description": "Fingerprint, Face ID, or Windows Hello via WebAuthn"},
]


def list_user_methods():
    """
    GET /api/2fa/methods
    Returns all 2FA methods and their enrollment status for the current user.
    """
    user_id = session.get("user_id") or session.get("setup_user_id")
    if not user_id:
        return error("Authentication or setup session required.", 401)

    enabled_methods = set(db.get_user_enabled_methods(user_id))
    enrolled_records = {row["method_type"]: row for row in db.get_user_auth_methods(user_id)}

    method_list = []
    for meta in ALL_METHOD_METADATA:
        m_type = meta["method"]
        is_enrolled = m_type in enrolled_records
        is_enabled = m_type in enabled_methods
        method_list.append({
            "method": m_type,
            "name": meta["name"],
            "description": meta["description"],
            "is_enrolled": is_enrolled,
            "is_enabled": is_enabled,
        })

    return success(
        "User 2FA methods retrieved.",
        {
            "methods": method_list,
            "enabled_methods": list(enabled_methods),
        }
    )


@login_required
def disable_method(method_type):
    """
    DELETE /api/2fa/methods/<method_type>
    Disables/removes a 2FA method. Ensures the user does not remove their last enabled method.
    """
    method_type = method_type.strip().upper()
    user_id = session.get("user_id")

    enabled_methods = db.get_user_enabled_methods(user_id)
    if method_type not in enabled_methods:
        return error(f"Method '{method_type}' is not active.", 404)

    if len(enabled_methods) <= 1:
        return error("Cannot remove your only active two-factor authentication method.", 400)

    db.delete_auth_method(user_id, method_type)

    user = db.get_user_by_id(user_id)
    if user:
        db.log_event(user["username"], f"2fa_method_removed_{method_type.lower()}", True)

    return success(f"Method '{method_type}' has been disabled.")

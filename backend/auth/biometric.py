from flask import request, session
import database as db
from auth.utils import success, error
from auth.session import finalize_authenticated_session
import auth.attempts as attempts
import auth.webauthn as webauthn_core


def get_biometric_register_options():
    """
    POST /api/2fa/biometric/register-options
    Generates WebAuthn registration options for platform authenticators (Biometrics).
    """
    user_id = session.get("user_id") or session.get("setup_user_id")
    if not user_id:
        return error("Authentication or setup session required.", 401)

    options, err = webauthn_core.generate_reg_options(
        user_id=user_id,
        ceremony_type="BIOMETRIC",
        attachment="platform",
    )
    if err:
        return error(err, 400)

    return success("Biometric registration options generated.", options)


def verify_biometric_registration():
    """
    POST /api/2fa/biometric/register-verify
    Verifies the browser WebAuthn attestation response and saves the platform biometric credential.
    """
    user_id = session.get("user_id") or session.get("setup_user_id")
    if not user_id:
        return error("Authentication or setup session required.", 401)

    data = request.get_json() or {}
    credential_payload = data.get("credential") or data

    cred_id, err = webauthn_core.verify_reg_response(
        user_id=user_id,
        ceremony_type="BIOMETRIC",
        credential_payload=credential_payload,
    )

    user = db.get_user_by_id(user_id)
    username = user["username"] if user else "unknown"

    if err:
        db.log_event(username, "biometric_registration", False)
        return error(err, 400)

    db.log_event(username, "biometric_registration", True)

    return success(
        "Biometric authenticator registered successfully.",
        {"credential_id": cred_id, "method": "BIOMETRIC"},
        201
    )


def get_biometric_auth_options():
    """
    POST /api/2fa/biometric/auth-options
    Generates WebAuthn assertion options for authenticating via biometric.
    """
    data = request.get_json() or {}
    attempt_id = data.get("attempt_id") or session.get("auth_attempt_id")

    pending_user_id = session.get("pending_user_id")
    attempt, err = attempts.get_valid_pending_attempt(attempt_id, pending_user_id)
    if err:
        return error(err, 401 if "expired" in err else 400)

    user_id = attempt["user_id"]
    options, err = webauthn_core.generate_auth_options(
        user_id=user_id,
        ceremony_type="BIOMETRIC",
        attempt_id=attempt_id,
    )
    if err:
        return error(err, 400)

    attempts.set_attempt_selected_method(attempt_id, "BIOMETRIC")
    return success("Biometric authentication options generated.", options)


def verify_biometric_auth():
    """
    POST /api/2fa/biometric/auth-verify
    Verifies the WebAuthn assertion response from the biometric authenticator.
    """
    data = request.get_json() or {}
    attempt_id = data.get("attempt_id") or session.get("auth_attempt_id")
    credential_payload = data.get("credential") or data

    pending_user_id = session.get("pending_user_id")
    attempt, err = attempts.get_valid_pending_attempt(attempt_id, pending_user_id)
    if err:
        return error(err, 401 if "expired" in err else 400)

    user_id = attempt["user_id"]
    user = db.get_user_by_id(user_id)
    if not user:
        return error("User not found.", 404)

    is_verified, err = webauthn_core.verify_auth_response(
        user_id=user_id,
        ceremony_type="BIOMETRIC",
        attempt_id=attempt_id,
        credential_payload=credential_payload,
    )

    if not is_verified or err:
        is_locked, lock_msg = attempts.record_attempt_failure(attempt_id)
        db.log_event(user["username"], "biometric_failed", False)
        if is_locked:
            return error(lock_msg, 423)
        return error(err or "Biometric verification failed.", 401)

    # Verification successful!
    attempts.mark_attempt_verified(attempt_id)
    db.log_event(user["username"], "biometric_success", True)
    db.log_event(user["username"], "authentication_success", True)

    finalize_authenticated_session(user)

    return success(
        "Biometric authentication successful.",
        {
            "user_id": user["id"],
            "username": user["username"],
            "role": user["role"],
        }
    )

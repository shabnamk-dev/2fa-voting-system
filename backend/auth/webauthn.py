import json
import os
import secrets
from datetime import datetime, timedelta
import webauthn
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorAttachment,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AttestationConveyancePreference,
)
import database as db
from auth.utils import bytes_to_b64url, b64url_to_bytes, utc_now

CHALLENGE_TIMEOUT_SECONDS = 300


def get_rp_config():
    """
    Returns Relying Party ID, Name, and allowed origins.
    """
    rp_id = os.getenv("WEBAUTHN_RP_ID", "localhost")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    origins = list({
        frontend_url.rstrip("/"),
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
    })
    return rp_id, "Secure Voting System", origins


def generate_reg_options(user_id, ceremony_type, attachment=None):
    """
    Generates WebAuthn registration (attestation) options for a user.
    ceremony_type: 'BIOMETRIC' or 'SECURITY_KEY'
    attachment: 'platform' or 'cross-platform'
    """
    user = db.get_user_by_id(user_id)
    if not user:
        return None, "User not found."

    rp_id, rp_name, _ = get_rp_config()

    auth_attachment = None
    if attachment == "platform":
        auth_attachment = AuthenticatorAttachment.PLATFORM
    elif attachment == "cross-platform":
        auth_attachment = AuthenticatorAttachment.CROSS_PLATFORM

    # Fetch existing credentials to exclude
    existing_creds = db.get_webauthn_credentials_by_user(user_id)
    exclude_descriptors = [
        PublicKeyCredentialDescriptor(id=b64url_to_bytes(c["credential_id"]))
        for c in existing_creds
    ]

    options = webauthn.generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=str(user["id"]).encode("utf-8"),
        user_name=user["username"],
        user_display_name=user["username"],
        attestation=AttestationConveyancePreference.NONE,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=auth_attachment,
            user_verification=UserVerificationRequirement.PREFERRED,
            require_resident_key=False,
        ),
        exclude_credentials=exclude_descriptors,
    )

    challenge_b64 = bytes_to_b64url(options.challenge)
    challenge_id = secrets.token_urlsafe(24)
    expires_at = (utc_now() + timedelta(seconds=CHALLENGE_TIMEOUT_SECONDS)).isoformat()

    db.create_webauthn_challenge(
        challenge_id=challenge_id,
        user_id=user_id,
        ceremony_type=f"{ceremony_type}_REG",
        challenge=challenge_b64,
        expires_at=expires_at,
    )

    return json.loads(webauthn.options_to_json(options)), None


def verify_reg_response(user_id, ceremony_type, credential_payload):
    """
    Verifies the WebAuthn attestation response and stores the resulting public key credential.
    """
    challenge_row = db.get_valid_webauthn_challenge(user_id, f"{ceremony_type}_REG")
    if not challenge_row:
        return None, "Invalid or expired WebAuthn registration challenge."

    rp_id, _, origins = get_rp_config()
    expected_challenge = b64url_to_bytes(challenge_row["challenge"])

    try:
        verified_reg = webauthn.verify_registration_response(
            credential=credential_payload,
            expected_challenge=expected_challenge,
            expected_rp_id=rp_id,
            expected_origin=origins,
            require_user_verification=False,
        )
    except Exception as exc:
        return None, f"WebAuthn registration verification failed: {str(exc)}"

    db.consume_webauthn_challenge(challenge_row["id"])

    cred_id_b64 = bytes_to_b64url(verified_reg.credential_id)
    public_key_b64 = bytes_to_b64url(verified_reg.credential_public_key)
    aaguid_str = str(verified_reg.aaguid) if verified_reg.aaguid else None

    db.create_webauthn_credential(
        user_id=user_id,
        credential_id=cred_id_b64,
        public_key=public_key_b64,
        sign_count=verified_reg.sign_count,
        credential_type=ceremony_type,
        aaguid=aaguid_str,
    )

    return cred_id_b64, None


def generate_auth_options(user_id, ceremony_type, attempt_id):
    """
    Generates WebAuthn authentication (assertion) options for a pending login attempt.
    """
    creds = db.get_webauthn_credentials_by_user(user_id, ceremony_type)
    if not creds:
        return None, f"No {ceremony_type} credentials enrolled for this user."

    rp_id, _, _ = get_rp_config()
    allowed_descriptors = [
        PublicKeyCredentialDescriptor(id=b64url_to_bytes(c["credential_id"]))
        for c in creds
    ]

    options = webauthn.generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allowed_descriptors,
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    challenge_b64 = bytes_to_b64url(options.challenge)
    challenge_id = secrets.token_urlsafe(24)
    expires_at = (utc_now() + timedelta(seconds=CHALLENGE_TIMEOUT_SECONDS)).isoformat()

    db.create_webauthn_challenge(
        challenge_id=challenge_id,
        user_id=user_id,
        ceremony_type=f"{ceremony_type}_AUTH",
        challenge=challenge_b64,
        expires_at=expires_at,
        attempt_id=attempt_id,
    )

    return json.loads(webauthn.options_to_json(options)), None


def verify_auth_response(user_id, ceremony_type, attempt_id, credential_payload):
    """
    Verifies the WebAuthn assertion response against stored public key & sign count.
    """
    challenge_row = db.get_valid_webauthn_challenge(user_id, f"{ceremony_type}_AUTH", attempt_id=attempt_id)
    if not challenge_row:
        return False, "Invalid or expired WebAuthn authentication challenge."

    # Extract credential ID from payload
    if isinstance(credential_payload, dict):
        raw_cred_id = credential_payload.get("id") or credential_payload.get("rawId")
    else:
        raw_cred_id = getattr(credential_payload, "id", None)

    if not raw_cred_id:
        return False, "Missing credential ID in WebAuthn response."

    # Normalize credential ID string
    if isinstance(raw_cred_id, bytes):
        cred_id_str = bytes_to_b64url(raw_cred_id)
    else:
        # Standardize b64url without padding
        cred_id_str = str(raw_cred_id).rstrip("=")

    cred = db.get_webauthn_credential_by_id(cred_id_str)
    if not cred:
        # Try matching with padding
        for c in db.get_webauthn_credentials_by_user(user_id, ceremony_type):
            if c["credential_id"].rstrip("=") == cred_id_str:
                cred = c
                break

    if not cred or cred["user_id"] != user_id:
        return False, f"WebAuthn credential not found for this account."

    if cred["credential_type"] != ceremony_type:
        return False, f"Credential type mismatch: Expected {ceremony_type}, got {cred['credential_type']}."

    rp_id, _, origins = get_rp_config()
    expected_challenge = b64url_to_bytes(challenge_row["challenge"])
    public_key_bytes = b64url_to_bytes(cred["public_key"])
    current_sign_count = cred["sign_count"]

    try:
        verified_auth = webauthn.verify_authentication_response(
            credential=credential_payload,
            expected_challenge=expected_challenge,
            expected_rp_id=rp_id,
            expected_origin=origins,
            credential_public_key=public_key_bytes,
            credential_current_sign_count=current_sign_count,
            require_user_verification=False,
        )
    except Exception as exc:
        return False, f"WebAuthn assertion verification failed: {str(exc)}"

    # Invalidate single-use challenge and update sign count
    db.consume_webauthn_challenge(challenge_row["id"])
    db.update_webauthn_sign_count(cred["credential_id"], verified_auth.new_sign_count)

    return True, None

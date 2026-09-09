from flask import Blueprint

from auth.utils import success, error
from auth.session import (
    login_required,
    admin_required,
    voter_required,
    start_pending_session,
    start_setup_session,
    finalize_authenticated_session,
    clear_session,
)

from auth.registration import register_user
from auth.login import login_user, select_2fa_method
from auth.enrollment import list_user_methods, disable_method
from auth.totp import get_totp_setup, confirm_totp_setup, verify_totp
from auth.push import (
    enroll_push_device,
    create_push_request,
    get_push_status,
    get_pending_push_requests,
    respond_to_push,
)
from auth.qr_auth import enroll_qr, create_qr_challenge, get_qr_status, respond_to_qr
from auth.biometric import (
    get_biometric_register_options,
    verify_biometric_registration,
    get_biometric_auth_options,
    verify_biometric_auth,
)
from auth.security_key import (
    get_security_key_register_options,
    verify_security_key_registration,
    get_security_key_auth_options,
    verify_security_key_auth,
)

auth_bp = Blueprint("auth", __name__)

# --- Registration & Login ---
auth_bp.add_url_rule("/register", view_func=register_user, methods=["POST"])
auth_bp.add_url_rule("/login", view_func=login_user, methods=["POST"])
auth_bp.add_url_rule("/2fa/select", view_func=select_2fa_method, methods=["POST"])

# --- 2FA Methods Enrollment Management ---
auth_bp.add_url_rule("/2fa/methods", view_func=list_user_methods, methods=["GET"])
auth_bp.add_url_rule("/2fa/methods/<method_type>", view_func=disable_method, methods=["DELETE"])

# --- TOTP Routes ---
auth_bp.add_url_rule("/setup-2fa", view_func=get_totp_setup, methods=["GET"])
auth_bp.add_url_rule("/setup-2fa", view_func=confirm_totp_setup, methods=["POST"])
auth_bp.add_url_rule("/2fa/totp/setup", view_func=get_totp_setup, methods=["GET"])
auth_bp.add_url_rule("/2fa/totp/enable", view_func=confirm_totp_setup, methods=["POST"])
auth_bp.add_url_rule("/verify-totp", view_func=verify_totp, methods=["POST"])
auth_bp.add_url_rule("/2fa/verify/totp", view_func=verify_totp, methods=["POST"])

# --- Push Authentication Routes ---
auth_bp.add_url_rule("/2fa/push/enroll", view_func=enroll_push_device, methods=["POST"])
auth_bp.add_url_rule("/2fa/push/request", view_func=create_push_request, methods=["POST"])
auth_bp.add_url_rule("/2fa/push/status", view_func=get_push_status, methods=["GET"])
auth_bp.add_url_rule("/2fa/push/pending", view_func=get_pending_push_requests, methods=["GET"])
auth_bp.add_url_rule("/2fa/push/respond", view_func=respond_to_push, methods=["POST"])

# --- QR Challenge Authentication Routes ---
auth_bp.add_url_rule("/2fa/qr/enroll", view_func=enroll_qr, methods=["POST"])
auth_bp.add_url_rule("/2fa/qr/request", view_func=create_qr_challenge, methods=["POST"])
auth_bp.add_url_rule("/2fa/qr/status", view_func=get_qr_status, methods=["GET"])
auth_bp.add_url_rule("/2fa/qr/respond", view_func=respond_to_qr, methods=["POST"])
auth_bp.add_url_rule("/2fa/qr/scan", view_func=respond_to_qr, methods=["POST"])

# --- Biometric WebAuthn Routes ---
auth_bp.add_url_rule("/2fa/biometric/register-options", view_func=get_biometric_register_options, methods=["POST"])
auth_bp.add_url_rule("/2fa/biometric/register-verify", view_func=verify_biometric_registration, methods=["POST"])
auth_bp.add_url_rule("/2fa/biometric/auth-options", view_func=get_biometric_auth_options, methods=["POST"])
auth_bp.add_url_rule("/2fa/biometric/auth-verify", view_func=verify_biometric_auth, methods=["POST"])

# --- Security Key WebAuthn Routes ---
auth_bp.add_url_rule("/2fa/security-key/register-options", view_func=get_security_key_register_options, methods=["POST"])
auth_bp.add_url_rule("/2fa/security-key/register-verify", view_func=verify_security_key_registration, methods=["POST"])
auth_bp.add_url_rule("/2fa/security-key/auth-options", view_func=get_security_key_auth_options, methods=["POST"])
auth_bp.add_url_rule("/2fa/security-key/auth-verify", view_func=verify_security_key_auth, methods=["POST"])

__all__ = [
    "auth_bp",
    "login_required",
    "admin_required",
    "voter_required",
    "success",
    "error",
    "start_pending_session",
    "start_setup_session",
    "finalize_authenticated_session",
    "clear_session",
]

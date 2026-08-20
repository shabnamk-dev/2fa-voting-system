import base64
import io
import os
import secrets
from datetime import datetime, timedelta
from functools import wraps

import pyotp
import qrcode
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

import database as db


app = Flask(__name__)

# Secret key for Flask sessions
app.secret_key = os.getenv("SECRET_KEY", secrets.token_hex(32))

# Allow React frontend to communicate with Flask
CORS(app, supports_credentials=True)

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
ISSUER_NAME = "SecureVotingSystem"


# ---------------------------------------------------------
# Database
# ---------------------------------------------------------

db.init_db()


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def success(message, data=None, status=200):
    response = {
        "success": True,
        "message": message
    }

    if data is not None:
        response["data"] = data

    return jsonify(response), status


def error(message, status=400):
    return jsonify({
        "success": False,
        "message": message
    }), status


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):

        if "user_id" not in session:
            return error("Authentication required.", 401)

        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):

        if "user_id" not in session:
            return error("Authentication required.", 401)

        if session.get("role") != "admin":

            db.log_event(
                session.get("username"),
                "unauthorized_admin_access",
                False
            )

            return error("Administrator access required.", 403)

        return view(*args, **kwargs)

    return wrapped


# =========================================================
# 1. REGISTER
# POST /api/register
# =========================================================

@app.route("/api/register", methods=["POST"])
def register():

    data = request.get_json() or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if len(username) < 3:
        return error("Username must be at least 3 characters.")

    if len(password) < 8:
        return error("Password must be at least 8 characters.")

    if db.get_user_by_username(username):
        return error("Username already exists.", 409)

    password_hash = generate_password_hash(password)

    user_id = db.create_user(
        username,
        password_hash,
        "voter"
    )

    db.log_event(
        username,
        "register",
        True
    )

    return success(
        "Registration successful.",
        {
            "user_id": user_id,
            "username": username,
            "role": "voter"
        },
        201
    )


# =========================================================
# 2. LOGIN
# POST /api/login
# =========================================================

@app.route("/api/login", methods=["POST"])
def login():

    data = request.get_json() or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    user = db.get_user_by_username(username)

    if not user:

        db.log_event(
            username,
            "login_password",
            False
        )

        return error("Invalid username or password.", 401)

    # Check lockout
    if user["locked_until"]:

        locked_until = datetime.fromisoformat(
            user["locked_until"]
        )

        if datetime.utcnow() < locked_until:

            db.log_event(
                username,
                "login_blocked_lockout",
                False
            )

            return error(
                "Account temporarily locked.",
                423
            )

    # Check password
    if not check_password_hash(
        user["password_hash"],
        password
    ):

        db.record_failed_attempt(username)

        user = db.get_user_by_username(username)

        if user["failed_attempts"] >= MAX_FAILED_ATTEMPTS:

            locked_until = (
                datetime.utcnow()
                + timedelta(minutes=LOCKOUT_MINUTES)
            ).isoformat()

            db.lock_account(
                username,
                locked_until
            )

            db.log_event(
                username,
                "account_locked",
                False
            )

            return error(
                "Too many failed attempts. "
                "Account locked for 15 minutes.",
                423
            )

        db.log_event(
            username,
            "login_password",
            False
        )

        return error(
            "Invalid username or password.",
            401
        )

    # Password is correct
    db.reset_failed_attempts(username)

    db.log_event(
        username,
        "login_password",
        True
    )

    # First login → setup 2FA
    if not user["is_2fa_enabled"]:

        session.clear()

        session["setup_user_id"] = user["id"]

        return success(
            "Please set up two-factor authentication.",
            {
                "next": "setup-2fa"
            }
        )

    # Existing 2FA → verify TOTP
    session.clear()

    session["pending_user_id"] = user["id"]

    return success(
        "Enter your authenticator code.",
        {
            "next": "verify-totp"
        }
    )


# =========================================================
# 3. GET 2FA SETUP
# GET /api/setup-2fa
# =========================================================

@app.route("/api/setup-2fa", methods=["GET"])
def setup_2fa():

    user_id = session.get("setup_user_id")

    if not user_id:
        return error(
            "2FA setup session not found.",
            401
        )

    user = db.get_user_by_id(user_id)

    if not user:
        return error("User not found.", 404)

    # Create TOTP secret if needed
    if not user["totp_secret"]:

        secret = pyotp.random_base32()

        db.set_totp_secret(
            user_id,
            secret
        )

        user = db.get_user_by_id(user_id)

    # Create Google Authenticator URI
    uri = pyotp.TOTP(
        user["totp_secret"]
    ).provisioning_uri(
        name=user["username"],
        issuer_name=ISSUER_NAME
    )

    # Create QR code
    qr = qrcode.make(uri)

    buffer = io.BytesIO()

    qr.save(
        buffer,
        format="PNG"
    )

    qr_base64 = base64.b64encode(
        buffer.getvalue()
    ).decode()

    return success(
        "2FA setup information.",
        {
            "username": user["username"],
            "qr_code": f"data:image/png;base64,{qr_base64}"
        }
    )


# =========================================================
# 4. CONFIRM 2FA SETUP
# POST /api/setup-2fa
# =========================================================

@app.route("/api/setup-2fa", methods=["POST"])
def confirm_2fa():

    user_id = session.get("setup_user_id")

    if not user_id:
        return error(
            "2FA setup session not found.",
            401
        )

    data = request.get_json() or {}

    token = data.get("token", "").strip()

    user = db.get_user_by_id(user_id)

    if not user:
        return error("User not found.", 404)

    totp = pyotp.TOTP(
        user["totp_secret"]
    )

    if not totp.verify(
        token,
        valid_window=1
    ):

        db.log_event(
            user["username"],
            "2fa_setup_confirmed",
            False
        )

        return error(
            "Invalid or expired code.",
            401
        )

    db.enable_2fa(user_id)

    db.log_event(
        user["username"],
        "2fa_setup_confirmed",
        True
    )

    session.clear()

    return success(
        "Two-factor authentication enabled."
    )


# =========================================================
# 5. VERIFY TOTP
# POST /api/verify-totp
# =========================================================

@app.route("/api/verify-totp", methods=["POST"])
def verify_totp():

    user_id = session.get("pending_user_id")

    if not user_id:
        return error(
            "TOTP verification session not found.",
            401
        )

    data = request.get_json() or {}

    token = data.get("token", "").strip()

    user = db.get_user_by_id(user_id)

    if not user:
        return error("User not found.", 404)

    totp = pyotp.TOTP(
        user["totp_secret"]
    )

    if not totp.verify(
        token,
        valid_window=1
    ):

        db.log_event(
            user["username"],
            "login_totp",
            False
        )

        return error(
            "Invalid or expired code.",
            401
        )

    # Fully authenticated
    db.log_event(
        user["username"],
        "login_totp",
        True
    )

    session.clear()

    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["role"] = user["role"]

    return success(
        "Login successful.",
        {
            "user_id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    )


# =========================================================
# 6. CURRENT USER
# GET /api/me
# =========================================================

@app.route("/api/me", methods=["GET"])
@login_required
def current_user():

    user = db.get_user_by_id(
        session["user_id"]
    )

    return success(
        "Current user.",
        {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "has_voted": bool(user["has_voted"])
        }
    )


# =========================================================
# 7. LOGOUT
# POST /api/logout
# =========================================================

@app.route("/api/logout", methods=["POST"])
def logout():

    username = session.get("username")

    session.clear()

    if username:

        db.log_event(
            username,
            "logout",
            True
        )

    return success(
        "Logged out successfully."
    )


# =========================================================
# 8. DASHBOARD
# GET /api/dashboard
# =========================================================

@app.route("/api/dashboard", methods=["GET"])
@login_required
def dashboard():

    user = db.get_user_by_id(
        session["user_id"]
    )

    return success(
        "Dashboard information.",
        {
            "username": user["username"],
            "role": user["role"],
            "has_voted": bool(user["has_voted"])
        }
    )


# =========================================================
# 9. ADMIN ACCESS TEST
# GET /api/admin
# =========================================================

@app.route("/api/admin", methods=["GET"])
@admin_required
def admin_dashboard():

    return success(
        "Admin access granted."
    )

@app.route("/")
def home():
    return "Secure voting system backend is running!"
# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":
    app.run(
        host = "0.0.0.0",
        port=5000,
        debug = False
    )


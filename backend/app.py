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

app.config.update(
    SESSION_COOKIE_HTTPONLY = True,
    SESSION_COOKIE_SAMESITE = "Lax",

    SESSION_COOKIE_SECURE = False
)

# Allow React frontend to communicate with Flask
CORS(app, supports_credentials=True)

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
ISSUER_NAME = "SecureVotingSystem"


# Database

db.init_db()


# Helpers

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


def voter_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):

        if "user_id" not in session:
            return error("Authentication required.", 401)

        if session.get("role") != "voter":
            return error("This action is only available to voters.", 403)

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
            "qr_code": f"data:image/png;base64,{qr_base64}",
            "secret": user["totp_secret"]
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

    token = str(data.get("token", "")).strip()

    if not token.isdigit() or len(token)!=6:
        return error(
            "OTP must be a 6-digit code.", 400
        )

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

    token = str(data.get("token", "")).strip()
    
    if not token.isdigit() or len(token)!=6:
        return error(
            "OTP must be a 6-digit code.", 400
        )

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

    if not user:
        session.clear()

        return error(
            "User session is no longer valid.", 401
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
    if not user:
        session.clear()

        return error(
            "User session is no longer valid.", 401
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
# 10. GET CANDIDATES
# GET /api/candidates
# =========================================================

@app.route("/api/candidates", methods=["GET"])
@login_required
def candidates():

    candidates = db.get_candidates()

    return success(
        "Candidates retrieved successfully.",
        [
            {
                "id": candidate["id"],
                "name": candidate["name"],
                "party": candidate["party"],
                "description": candidate["description"],
                "image_url": candidate["image_url"],
                "position": candidate["position"]
            }
            for candidate in candidates
        ]
    )

# =========================================================
# 11. CREATE CANDIDATE
# POST /api/candidates
# =========================================================

@app.route("/api/candidates", methods=["POST"])
@admin_required
def create_candidate():

    data = request.get_json() or {}

    name = data.get("name", "").strip()
    party = data.get("party")
    description = data.get("description")
    position = data.get("position", "President")

    if not name:
        return error("Candidate name is required.")

    candidate_id = db.create_candidate(
        name,
        party,
        description,
        None,
        position
    )

    return success(
        "Candidate created successfully.",
        {
            "id": candidate_id,
            "name": name,
            "party": party,
            "description": description,
            "position": position
        },
        201
    )


# =========================================================
# 12. UPDATE CANDIDATE
# PUT /api/candidates/<id>
# =========================================================

@app.route("/api/candidates/<int:candidate_id>", methods=["PUT"])
@admin_required
def update_candidate(candidate_id):

    data = request.get_json() or {}

    name = data.get("name", "").strip()
    party = data.get("party")
    description = data.get("description")
    image_url = data.get("image_url")
    position = data.get("position", "President")

    if not name:
        return error("Candidate name is required.")

    updated = db.update_candidate(
        candidate_id,
        name,
        party,
        description,
        image_url,
        position
    )

    if not updated:
        return error("Candidate not found.", 404)

    return success(
        "Candidate updated successfully."
    )


# =========================================================
# 13. DELETE CANDIDATE
# DELETE /api/candidates/<id>
# =========================================================

@app.route("/api/candidates/<int:candidate_id>", methods=["DELETE"])
@admin_required
def remove_candidate(candidate_id):

    deleted = db.delete_candidate(candidate_id)

    if not deleted:
        return error("Candidate not found.", 404)

    return success(
        "Candidate deleted successfully."
    )


# =========================================================
# 14. RESULTS
# GET /api/results
# =========================================================

@app.route("/api/results", methods=["GET"])
@login_required
def results():

    return success(
        "Election results retrieved successfully.",
        db.get_results()
    )


# =========================================================
# 15. ELECTION STATUS (read-only, any logged-in user)
# GET /api/election
# =========================================================

@app.route("/api/election", methods=["GET"])
@login_required
def election_status():

    election = db.get_election()

    if not election:
        return success(
            "No election configured yet.",
            {"status": "UPCOMING", "name": None}
        )

    return success(
        "Election status.",
        {
            "id": election["id"],
            "name": election["name"],
            "status": election["status"]
        }
    )


# =========================================================
# 16. CAST VOTE
# POST /api/vote
# Body: { "candidate_id": <int|null> }  (null / omitted = abstain)
# =========================================================

@app.route("/api/vote", methods=["POST"])
@voter_required
def cast_vote():

    user_id = session["user_id"]
    username = session.get("username")

    data = request.get_json() or {}
    raw_candidate_id = data.get("candidate_id")

    candidate_id = None
    if raw_candidate_id not in (None, "", "nota"):
        try:
            candidate_id = int(raw_candidate_id)
        except (TypeError, ValueError):
            return error("Invalid candidate selection.", 400)

    result = db.cast_vote(user_id, candidate_id)

    db.log_event(
        username,
        "vote_cast",
        result["success"]
    )

    if not result["success"]:
        return error(result["message"], 409)

    return success(
        result["message"],
        result["receipt"],
        201
    )


# =========================================================
# 17. MY VOTE RECEIPT
# GET /api/my-vote
# =========================================================

@app.route("/api/my-vote", methods=["GET"])
@voter_required
def my_vote():

    receipt = db.get_vote_receipt(session["user_id"])

    if not receipt:
        return error("No vote has been cast yet.", 404)

    return success(
        "Vote receipt retrieved.",
        dict(receipt)
    )


# =========================================================
# 18. ADMIN: LOGIN ACTIVITY STATS
# GET /api/admin/security-stats
# =========================================================

@app.route("/api/admin/security-stats", methods=["GET"])
@admin_required
def admin_security_stats():

    return success(
        "Security statistics retrieved.",
        db.get_security_stats()
    )


# =========================================================
# 19. ADMIN: LOGIN ACTIVITY LOG
# GET /api/admin/security-events
# =========================================================

@app.route("/api/admin/security-events", methods=["GET"])
@admin_required
def admin_security_events():

    limit = request.args.get("limit", 50, type=int)
    events = db.get_security_events(limit=limit)

    return success(
        "Security events retrieved.",
        [dict(event) for event in events]
    )


# =========================================================
# 20. ADMIN: OPEN / CLOSE VOTING
# POST /api/admin/election
# Body: { "status": "UPCOMING" | "OPEN" | "CLOSED" }
# =========================================================

@app.route("/api/admin/election", methods=["POST"])
@admin_required
def admin_update_election():

    data = request.get_json() or {}
    status = data.get("status", "").strip().upper()

    if status not in ("UPCOMING", "OPEN", "CLOSED"):
        return error("Status must be one of UPCOMING, OPEN, CLOSED.", 400)

    db.update_election_status(status)

    db.log_event(
        session.get("username"),
        "election_status_changed",
        True
    )

    return success(
        "Election status updated.",
        {"status": status}
    )


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":
    app.run(
        host = "0.0.0.0",
        port=5000,
        debug = False
    )


import os
import secrets
from flask import Flask, request, session
from flask_cors import CORS

import database as db
from auth import (
    auth_bp,
    login_required,
    admin_required,
    voter_required,
    success,
    error,
    clear_session,
)


def create_app():
    """
    Application factory for the Secure Voting System.
    """
    app = Flask(__name__)

    # Session & Secret Key Configuration
    secret_key = os.getenv("SECRET_KEY")
    if not secret_key:
        if os.getenv("APP_ENV", "development") == "production":
            raise RuntimeError("SECRET_KEY environment variable is required in production.")
        secret_key = secrets.token_hex(32)

    app.secret_key = secret_key
    is_production = os.getenv("FLASK_ENV") == "production"

    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="None" if is_production else "Lax",
        SESSION_COOKIE_SECURE=is_production,
    )

    # CORS Configuration
    frontend_url = os.getenv("FRONTEND_URL")
    if is_production:
        if not frontend_url:
            raise RuntimeError("FRONTEND_URL environment variable is required in production.")
        CORS(app, origins=[frontend_url], supports_credentials=True)
    else:
        CORS(app, supports_credentials=True)

    # Initialize Database & Run Migrations
    db.init_db()

    # Register Modular Authentication Blueprint (/api/...)
    app.register_blueprint(auth_bp, url_prefix="/api")

    # =========================================================
    # GENERAL / HEALTH
    # =========================================================

    @app.route("/")
    def home():
        return "Secure voting system backend is running!"

    # =========================================================
    # USER SESSION & IDENTITY
    # =========================================================

    @app.route("/api/me", methods=["GET"])
    @login_required
    def current_user():
        user = db.get_user_by_id(session["user_id"])
        if not user:
            clear_session()
            return error("User session is no longer valid.", 401)

        return success(
            "Current user.",
            {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "has_voted": bool(user["has_voted"]),
            }
        )

    @app.route("/api/logout", methods=["POST"])
    def logout():
        username = session.get("username")
        clear_session()
        if username:
            db.log_event(username, "logout", True)
        return success("Logged out successfully.")

    @app.route("/api/dashboard", methods=["GET"])
    @login_required
    def dashboard():
        user = db.get_user_by_id(session["user_id"])
        if not user:
            clear_session()
            return error("User session is no longer valid.", 401)

        return success(
            "Dashboard information.",
            {
                "username": user["username"],
                "role": user["role"],
                "has_voted": bool(user["has_voted"]),
            }
        )

    # =========================================================
    # CANDIDATE MANAGEMENT
    # =========================================================

    @app.route("/api/candidates", methods=["GET"])
    @login_required
    def candidates():
        candidate_list = db.get_candidates()
        return success(
            "Candidates retrieved successfully.",
            [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "party": c["party"],
                    "description": c["description"],
                    "image_url": c["image_url"],
                    "position": c["position"],
                }
                for c in candidate_list
            ]
        )

    @app.route("/api/candidates", methods=["POST"])
    @admin_required
    def create_candidate():
        data = request.get_json() or {}
        name = data.get("name", "").strip()
        party = data.get("party")
        description = data.get("description")
        image_url = data.get("image_url")
        position = data.get("position", "President")

        if not name:
            return error("Candidate name is required.", 400)

        candidate_id = db.create_candidate(
            name=name,
            party=party,
            description=description,
            image_url=image_url,
            position=position,
        )

        return success(
            "Candidate created successfully.",
            {
                "id": candidate_id,
                "name": name,
                "party": party,
                "description": description,
                "position": position,
            },
            201
        )

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
            return error("Candidate name is required.", 400)

        updated = db.update_candidate(
            candidate_id=candidate_id,
            name=name,
            party=party,
            description=description,
            image_url=image_url,
            position=position,
        )

        if not updated:
            return error("Candidate not found.", 404)

        return success("Candidate updated successfully.")

    @app.route("/api/candidates/<int:candidate_id>", methods=["DELETE"])
    @admin_required
    def remove_candidate(candidate_id):
        deleted = db.delete_candidate(candidate_id)
        if not deleted:
            return error("Candidate not found.", 404)
        return success("Candidate deleted successfully.")

    # =========================================================
    # ELECTION & VOTING
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
                "status": election["status"],
            }
        )

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
        db.log_event(username, "vote_cast", result["success"])

        if not result["success"]:
            return error(result["message"], 409)

        return success(result["message"], result["receipt"], 201)

    @app.route("/api/my-vote", methods=["GET"])
    @voter_required
    def my_vote():
        receipt = db.get_vote_receipt(session["user_id"])
        if not receipt:
            return error("No vote has been cast yet.", 404)
        return success("Vote receipt retrieved.", dict(receipt))

    @app.route("/api/results", methods=["GET"])
    @login_required
    def results():
        return success("Election results retrieved successfully.", db.get_results())

    # =========================================================
    # ADMIN PORTAL
    # =========================================================

    @app.route("/api/admin", methods=["GET"])
    @admin_required
    def admin_dashboard():
        return success("Admin access granted.")

    @app.route("/api/admin/security-stats", methods=["GET"])
    @admin_required
    def admin_security_stats():
        return success("Security statistics retrieved.", db.get_security_stats())

    @app.route("/api/admin/security-events", methods=["GET"])
    @admin_required
    def admin_security_events():
        limit = request.args.get("limit", 50, type=int)
        events = db.get_security_events(limit=limit)
        return success("Security events retrieved.", [dict(event) for event in events])

    @app.route("/api/admin/election", methods=["POST"])
    @admin_required
    def admin_update_election():
        data = request.get_json() or {}
        status = data.get("status", "").strip().upper()

        if status not in ("UPCOMING", "OPEN", "CLOSED"):
            return error("Status must be one of UPCOMING, OPEN, CLOSED.", 400)

        db.update_election_status(status)
        db.log_event(session.get("username"), "election_status_changed", True)
        return success("Election status updated.", {"status": status})

    return app


app = create_app()

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
    )

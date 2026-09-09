from flask import request
from werkzeug.security import generate_password_hash
import database as db
from auth.utils import success, error
from auth.session import start_setup_session


def register_user():
    """
    POST /api/register
    Creates a new voter account. Does NOT grant a fully authenticated session.
    """
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
    user_id = db.create_user(username, password_hash, "voter")

    db.log_event(username, "register", True)

    # Establish setup session so the user can enroll their first 2FA method
    start_setup_session(user_id)

    return success(
        "Registration successful. Please set up two-factor authentication.",
        {
            "user_id": user_id,
            "username": username,
            "role": "voter",
            "next": "setup-2fa",
        },
        201
    )

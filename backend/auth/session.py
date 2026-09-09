from functools import wraps
from flask import session
import database as db
from auth.utils import error


def login_required(view):
    """
    Ensures that the client has a FULLY AUTHENTICATED session (State 3).
    A pending 2FA session (State 2) will be rejected with 401.
    """
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return error("Authentication required.", 401)
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    """
    Ensures that the client is fully authenticated and has the 'admin' role.
    """
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
    """
    Ensures that the client is fully authenticated and has the 'voter' role.
    """
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return error("Authentication required.", 401)

        if session.get("role") != "voter":
            return error("This action is only available to voters.", 403)

        return view(*args, **kwargs)
    return wrapped


def start_pending_session(user_id, attempt_id):
    """
    Transition to State 2: Password Verified, 2FA Pending.
    Guarantees no 'user_id' is stored in the session.
    """
    session.clear()
    session["pending_user_id"] = user_id
    session["auth_attempt_id"] = attempt_id


def start_setup_session(user_id):
    """
    Session for completing 2FA setup when no methods are currently enrolled.
    """
    session.clear()
    session["setup_user_id"] = user_id


def finalize_authenticated_session(user):
    """
    Transition to State 3: Fully Authenticated.
    Wipes all temporary pending keys and establishes user_id, username, role.
    """
    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["role"] = user["role"]


def clear_session():
    """
    Completely clear the session.
    """
    session.clear()

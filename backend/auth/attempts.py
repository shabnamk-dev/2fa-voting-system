import secrets
from datetime import datetime, timedelta
import database as db
from auth.utils import utc_now

ATTEMPT_TTL_MINUTES = 5
MAX_SECOND_FACTOR_FAILURES = 3


def create_attempt(user_id):
    """
    Create a new single-use authentication attempt with a 5-minute TTL.
    """
    attempt_id = secrets.token_urlsafe(32)
    expires_at = (utc_now() + timedelta(minutes=ATTEMPT_TTL_MINUTES)).isoformat()
    db.create_auth_attempt(attempt_id, user_id, expires_at)
    return attempt_id


def get_valid_pending_attempt(attempt_id, user_id=None):
    """
    Validate that an authentication attempt exists, belongs to the pending user,
    is in PENDING status, and has not expired.
    """
    if not attempt_id:
        return None, "Missing attempt ID."

    attempt = db.get_auth_attempt(attempt_id)
    if not attempt:
        return None, "Authentication attempt not found."

    if user_id is not None and attempt["user_id"] != user_id:
        return None, "Authentication attempt does not belong to the current session."

    if attempt["status"] != "PENDING":
        return None, f"Authentication attempt is already {attempt['status'].lower()}."

    # Check expiration
    expires_at = datetime.fromisoformat(attempt["expires_at"])
    if utc_now() > expires_at:
        db.update_attempt_status(attempt_id, "EXPIRED")
        return None, "Authentication attempt has expired. Please log in again."

    return attempt, None


def record_attempt_failure(attempt_id, max_failures=MAX_SECOND_FACTOR_FAILURES):
    """
    Record a second-factor verification failure on the attempt.
    If failures exceed max_failures, transition attempt to FAILED.
    """
    new_count = db.increment_attempt_failed_count(attempt_id)
    if new_count >= max_failures:
        db.update_attempt_status(attempt_id, "FAILED")
        return True, "Too many failed attempts. This authentication attempt has been invalidated."
    return False, None


def mark_attempt_verified(attempt_id):
    """
    Mark the attempt as VERIFIED. Once verified, it can never be reused.
    """
    db.update_attempt_status(attempt_id, "VERIFIED")


def mark_attempt_failed(attempt_id):
    """
    Mark the attempt as FAILED.
    """
    db.update_attempt_status(attempt_id, "FAILED")


def set_attempt_selected_method(attempt_id, method):
    """
    Record the method selected for this authentication attempt.
    """
    db.update_attempt_method(attempt_id, method)

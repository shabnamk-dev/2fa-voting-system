import base64
import secrets
from datetime import datetime, timezone
from flask import jsonify


def utc_now() -> datetime:
    """
    Returns timezone-naive UTC datetime for consistent ISO formatting and comparisons.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def success(message, data=None, status=200):
    """
    Standard JSON success response envelope.
    """
    response = {
        "success": True,
        "message": message,
    }
    if data is not None:
        response["data"] = data
    return jsonify(response), status


def error(message, status=400):
    """
    Standard JSON error response envelope.
    """
    return jsonify({
        "success": False,
        "message": message,
    }), status


def generate_token(length=32):
    """
    Generate a cryptographically secure random url-safe token.
    """
    return secrets.token_urlsafe(length)


def generate_hex_token(nbytes=16):
    """
    Generate a cryptographically secure hex token.
    """
    return secrets.token_hex(nbytes)


def bytes_to_b64url(data: bytes) -> str:
    """
    Encode bytes to base64url string without trailing '=' padding.
    """
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def b64url_to_bytes(data: str) -> bytes:
    """
    Decode base64url string (with or without padding) to bytes.
    """
    if isinstance(data, str):
        # Add padding if needed
        padding = 4 - (len(data) % 4)
        if padding != 4:
            data += "=" * padding
        return base64.urlsafe_b64decode(data.encode("utf-8"))
    return data

"""
database.py
-----------
Minimal SQLite data layer for the authentication & security module.

NOTE FOR SWARNAL: This defines the `users` table only, since that's what
authentication owns. Your `candidates` and `votes` tables can live in the
same SQLite file (voting_system.db) — just add your own CREATE TABLE
statements to init_db() here, or run your own migration against this file.
The schema below matches what's in the project doc:
    id, username, password_hash, role, totp_secret, is_2fa_enabled, has_voted

    (remove this comment once you are done with making changes)
"""

import sqlite3
from contextlib import contextmanager

DB_PATH = "voting_system.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_cursor(commit=False):
    """Context manager so routes don't have to manage connections by hand."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


def init_db():
    """Create tables if they don't already exist. Safe to call on every startup."""
    with db_cursor(commit=True) as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                username          TEXT UNIQUE NOT NULL,
                password_hash     TEXT NOT NULL,
                role              TEXT NOT NULL DEFAULT 'voter' CHECK(role IN ('voter', 'admin')),
                totp_secret       TEXT,
                is_2fa_enabled    INTEGER NOT NULL DEFAULT 0,
                has_voted         INTEGER NOT NULL DEFAULT 0,
                failed_attempts   INTEGER NOT NULL DEFAULT 0,
                locked_until      TEXT,
                created_at        TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Simple audit log — useful for the "Security Testing" section of the report
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auth_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                username    TEXT,
                event_type  TEXT NOT NULL,
                success     INTEGER NOT NULL,
                timestamp   TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        print("Database.py loaded")


    print("INIT_DB STARTED!")

    with db_cursor(commit=True) as cur:
        print("DATABASE CONNECTION OPENED!")

    print("INIT_DB FINISHED")
print("DATABSE.py loaded!")


def log_event(username, event_type, success):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO auth_events (username, event_type, success) VALUES (?, ?, ?)",
            (username, event_type, int(success)),
        )


def get_user_by_username(username):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE username = ?", (username,))
        return cur.fetchone()


def get_user_by_id(user_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cur.fetchone()


def create_user(username, password_hash, role="voter"):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, password_hash, role),
        )
        return cur.lastrowid


def set_totp_secret(user_id, secret):
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE users SET totp_secret = ? WHERE id = ?", (secret, user_id))


def enable_2fa(user_id):
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE users SET is_2fa_enabled = 1 WHERE id = ?", (user_id,))


def disable_2fa(user_id):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE users SET is_2fa_enabled = 0, totp_secret = NULL WHERE id = ?",
            (user_id,),
        )


def record_failed_attempt(username):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE users SET failed_attempts = failed_attempts + 1 WHERE username = ?",
            (username,),
        )


def reset_failed_attempts(username):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE username = ?",
            (username,),
        )


def lock_account(username, locked_until_iso):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE users SET locked_until = ? WHERE username = ?",
            (locked_until_iso, username),
        )

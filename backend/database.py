import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = os.getenv("DATABASE_PATH", str(BASE_DIR / "voting_system.db"))

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_cursor(commit=False):
    conn = get_connection()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


def _column_names(cur, table):
    cur.execute(f"PRAGMA table_info({table})")
    return [row["name"] for row in cur.fetchall()]


def _migrate_votes_table(cur):
   
    cur.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='votes'
    """)
    if not cur.fetchone():
        return  # fresh install, nothing to migrate

    cur.execute("PRAGMA table_info(votes)")
    columns = {row["name"]: row for row in cur.fetchall()}

    candidate_is_not_null = columns.get("candidate_id", {}) and columns["candidate_id"]["notnull"] == 1
    has_receipt_code = "receipt_code" in columns

    if not candidate_is_not_null and has_receipt_code:
        return  # already up to date

    cur.execute("ALTER TABLE votes RENAME TO votes_old")

    cur.execute("""
        CREATE TABLE votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voter_id INTEGER NOT NULL UNIQUE,
            candidate_id INTEGER,
            receipt_code TEXT UNIQUE,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY(voter_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
        )
    """)

    old_columns = _column_names(cur, "votes_old")
    cur.execute("SELECT * FROM votes_old")
    for row in cur.fetchall():
        row = dict(row)
        receipt_code = row.get("receipt_code") or secrets.token_hex(16)
        cur.execute("""
            INSERT INTO votes (id, voter_id, candidate_id, receipt_code, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (
            row.get("id"),
            row.get("voter_id"),
            row.get("candidate_id"),
            receipt_code,
            row.get("timestamp"),
        ))

    cur.execute("DROP TABLE votes_old")


def _migrate_2fa_data(cur):
    """
    Safely and idempotently migrate existing users who have totp_secret
    configured into auth_methods and totp_credentials.
    """
    cur.execute("SELECT id, totp_secret, is_2fa_enabled FROM users WHERE totp_secret IS NOT NULL")
    users_with_totp = cur.fetchall()
    for u in users_with_totp:
        uid = u["id"]
        secret = u["totp_secret"]
        is_enabled = u["is_2fa_enabled"]

        cur.execute("SELECT id FROM totp_credentials WHERE user_id = ?", (uid,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO totp_credentials (user_id, secret, last_used_step)
                VALUES (?, ?, 0)
            """, (uid, secret))

        cur.execute("SELECT id FROM auth_methods WHERE user_id = ? AND method_type = 'TOTP'", (uid,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO auth_methods (user_id, method_type, is_enabled)
                VALUES (?, 'TOTP', ?)
            """, (uid, 1 if is_enabled else 0))


def init_db():

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

        # Simple audit log — powers the admin "Login Activity" panel
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auth_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                username    TEXT,
                event_type  TEXT NOT NULL,
                success     INTEGER NOT NULL,
                timestamp   TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                party TEXT,
                description TEXT,
                image_url TEXT,
                position TEXT DEFAULT 'President'
            )
        """)

        # Create votes table fresh (no-op if it already exists), then migrate
        # any older shape of the table before continuing.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                voter_id INTEGER NOT NULL UNIQUE,
                candidate_id INTEGER,
                receipt_code TEXT UNIQUE,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY(voter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
            )
        """)
        _migrate_votes_table(cur)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS elections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL DEFAULT 'College Election',
                status TEXT NOT NULL DEFAULT 'UPCOMING'
                    CHECK(status IN ('UPCOMING','OPEN','CLOSED')),
                start_time TEXT,
                end_time TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cur.execute("SELECT COUNT(*) AS total FROM elections")
        if cur.fetchone()["total"] == 0:
            cur.execute("""
                INSERT INTO elections (name, status)
                VALUES ('College Election', 'OPEN')
            """)

        # =========================================================
        # 2FA TABLES
        # =========================================================

        # General auth methods table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auth_methods (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                method_type TEXT NOT NULL CHECK(method_type IN ('TOTP', 'PUSH', 'BIOMETRIC', 'SECURITY_KEY', 'QR')),
                is_enabled  INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, method_type)
            )
        """)

        # TOTP credentials table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS totp_credentials (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL UNIQUE,
                secret          TEXT NOT NULL,
                last_used_step  INTEGER DEFAULT 0,
                created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # WebAuthn credentials (for BIOMETRIC & SECURITY_KEY)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS webauthn_credentials (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                credential_id   TEXT NOT NULL UNIQUE,
                public_key      TEXT NOT NULL,
                sign_count      INTEGER NOT NULL DEFAULT 0,
                credential_type TEXT NOT NULL CHECK(credential_type IN ('BIOMETRIC', 'SECURITY_KEY')),
                aaguid          TEXT,
                transports      TEXT,
                created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
                last_used_at    TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Push trusted devices
        cur.execute("""
            CREATE TABLE IF NOT EXISTS push_devices (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id           INTEGER NOT NULL,
                device_name       TEXT NOT NULL,
                device_identifier TEXT NOT NULL UNIQUE,
                is_enabled        INTEGER NOT NULL DEFAULT 1,
                created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
                last_used_at      TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Authentication attempts lifecycle
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auth_attempts (
                id              TEXT PRIMARY KEY,
                user_id         INTEGER NOT NULL,
                selected_method TEXT CHECK(selected_method IN ('TOTP', 'PUSH', 'BIOMETRIC', 'SECURITY_KEY', 'QR') OR selected_method IS NULL),
                status          TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED')),
                failed_count    INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at      TEXT NOT NULL,
                completed_at    TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Push authentication requests
        cur.execute("""
            CREATE TABLE IF NOT EXISTS push_requests (
                id          TEXT PRIMARY KEY,
                attempt_id  TEXT NOT NULL,
                user_id     INTEGER NOT NULL,
                request_id  TEXT NOT NULL UNIQUE,
                status      TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED')),
                created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at  TEXT NOT NULL,
                approved_at TEXT,
                denied_at   TEXT,
                FOREIGN KEY(attempt_id) REFERENCES auth_attempts(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # QR authentication challenges
        cur.execute("""
            CREATE TABLE IF NOT EXISTS qr_requests (
                id          TEXT PRIMARY KEY,
                attempt_id  TEXT NOT NULL,
                user_id     INTEGER NOT NULL,
                request_id  TEXT NOT NULL UNIQUE,
                challenge   TEXT NOT NULL UNIQUE,
                status      TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED')),
                created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at  TEXT NOT NULL,
                approved_at TEXT,
                denied_at   TEXT,
                FOREIGN KEY(attempt_id) REFERENCES auth_attempts(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # WebAuthn challenge tracking
        cur.execute("""
            CREATE TABLE IF NOT EXISTS webauthn_challenges (
                id            TEXT PRIMARY KEY,
                user_id       INTEGER NOT NULL,
                attempt_id    TEXT,
                ceremony_type TEXT NOT NULL CHECK(ceremony_type IN ('BIOMETRIC_REG', 'SECURITY_KEY_REG', 'BIOMETRIC_AUTH', 'SECURITY_KEY_AUTH')),
                challenge     TEXT NOT NULL,
                expires_at    TEXT NOT NULL,
                is_consumed   INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Run 2FA migration
        _migrate_2fa_data(cur)


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


def get_candidates():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM candidates ORDER BY id")
        return cur.fetchall()


def get_candidate_by_id(candidate_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM candidates WHERE id=?", (candidate_id,))
        return cur.fetchone()


def create_candidate(name, party=None, description=None,
                      image_url=None, position="President"):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO candidates
            (name, party, description, image_url, position)
            VALUES (?, ?, ?, ?, ?)
        """, (name, party, description, image_url, position))
        return cur.lastrowid


def update_candidate(candidate_id, name, party,
                      description, image_url, position):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE candidates
            SET name=?,
                party=?,
                description=?,
                image_url=?,
                position=?
            WHERE id=?
        """, (
            name,
            party,
            description,
            image_url,
            position,
            candidate_id
        ))
        return cur.rowcount


def delete_candidate(candidate_id):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM candidates WHERE id=?",
            (candidate_id,)
        )
        return cur.rowcount


def cast_vote(voter_id, candidate_id):
    """
    candidate_id may be None, which records an abstain ("None of the
    Above") ballot. Every cast vote — including abstains — gets a unique,
    voter-visible receipt code.
    """
    with db_cursor(commit=True) as cur:
        # Election must be open
        cur.execute("""
            SELECT status
            FROM elections
            ORDER BY id DESC
            LIMIT 1
        """)
        election = cur.fetchone()

        if election and election["status"] != "OPEN":
            return {
                "success": False,
                "message": "Voting is currently closed."
            }

        # Already voted?
        cur.execute(
            "SELECT has_voted FROM users WHERE id=?",
            (voter_id,)
        )
        user = cur.fetchone()

        if not user:
            return {
                "success": False,
                "message": "User not found."
            }
        if user["has_voted"]:
            return {
                "success": False,
                "message": "User has already voted."
            }

        if candidate_id is not None:
            cur.execute(
                "SELECT id FROM candidates WHERE id=?",
                (candidate_id,)
            )
            if not cur.fetchone():
                return {
                    "success": False,
                    "message": "Candidate not found."
                }

        receipt_code = secrets.token_hex(16)

        try:
            cur.execute("""
                INSERT INTO votes(voter_id, candidate_id, receipt_code)
                VALUES(?, ?, ?)
            """, (
                voter_id,
                candidate_id,
                receipt_code,
            ))
            cur.execute("""
                UPDATE users
                SET has_voted=1
                WHERE id=?
            """, (voter_id,))

            cur.execute("""
                SELECT v.id, v.candidate_id, v.receipt_code, v.timestamp,
                       c.name AS candidate_name, c.party AS candidate_party
                FROM votes v
                LEFT JOIN candidates c ON c.id = v.candidate_id
                WHERE v.voter_id = ?
            """, (voter_id,))
            vote_row = cur.fetchone()

            return {
                "success": True,
                "message": "Vote cast successfully.",
                "receipt": dict(vote_row) if vote_row else None,
            }
        except sqlite3.IntegrityError:
            return {
                "success": False,
                "message": "Duplicate vote prevented."
            }


def get_vote_receipt(voter_id):
    with db_cursor() as cur:
        cur.execute("""
            SELECT v.id, v.candidate_id, v.receipt_code, v.timestamp,
                   c.name AS candidate_name, c.party AS candidate_party
            FROM votes v
            LEFT JOIN candidates c ON c.id = v.candidate_id
            WHERE v.voter_id = ?
        """, (voter_id,))
        return cur.fetchone()


def get_election():
    with db_cursor() as cur:
        cur.execute("""
            SELECT *
            FROM elections
            ORDER BY id DESC
            LIMIT 1
        """)
        return cur.fetchone()


def update_election_status(status):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE elections
            SET status=?
            WHERE id=(
                SELECT id
                FROM elections
                ORDER BY id DESC
                LIMIT 1
            )
        """, (status,))


def get_results():
    with db_cursor() as cur:
        cur.execute("""
            SELECT
                c.id,
                c.name,
                c.party,
                COUNT(v.id) AS votes
            FROM candidates c
            LEFT JOIN votes v
            ON c.id=v.candidate_id
            GROUP BY c.id
            ORDER BY votes DESC
        """)
        results = cur.fetchall()

        cur.execute("SELECT COUNT(*) AS total FROM votes")
        total_votes = cur.fetchone()["total"]

        cur.execute("""
            SELECT COUNT(*) AS abstains
            FROM votes
            WHERE candidate_id IS NULL
        """)
        abstain_votes = cur.fetchone()["abstains"]

        output = []
        for row in results:
            percentage = (
                (row["votes"] / total_votes) * 100
                if total_votes else 0
            )
            output.append({
                "candidate_id": row["id"],
                "name": row["name"],
                "party": row["party"],
                "votes": row["votes"],
                "percentage": round(percentage, 2)
            })

        abstain_percentage = (
            (abstain_votes / total_votes) * 100
            if total_votes else 0
        )
        output.append({
            "candidate_id": None,
            "name": "Abstain / None of the Above",
            "party": None,
            "votes": abstain_votes,
            "percentage": round(abstain_percentage, 2)
        })

        return {
            "results": output,
            "total_votes": total_votes,
        }


def get_security_events(limit=50):
    with db_cursor() as cur:
        cur.execute("""
            SELECT *
            FROM auth_events
            ORDER BY timestamp DESC
            LIMIT ?
        """, (limit,))
        return cur.fetchall()


def get_security_stats():
    with db_cursor() as cur:
        def count(event, success=None):
            if success is None:
                cur.execute("""
                    SELECT COUNT(*)
                    FROM auth_events
                    WHERE event_type=?
                """, (event,))
            else:
                cur.execute("""
                    SELECT COUNT(*)
                    FROM auth_events
                    WHERE event_type=?
                    AND success=?
                """, (event, int(success)))
            return cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM auth_events
        """)
        total_events = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM auth_events
            WHERE success = 1
        """)
        total_successful = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM auth_events
            WHERE success = 0
        """)
        total_failed = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM users
            WHERE locked_until IS NOT NULL
        """)
        locked_accounts = cur.fetchone()[0]

        return {
            "total_security_events": total_events,
            "total_successful_events": total_successful,
            "total_failed_events": total_failed,
            "successful_logins": count("login_password", True),
            "failed_logins": count("login_password", False),
            "successful_totp": count("login_totp", True),
            "failed_totp": count("login_totp", False),
            "successful_push": count("push_approved", True),
            "failed_push": count("push_denied", False),
            "successful_qr": count("qr_auth_approved", True),
            "failed_qr": count("qr_auth_denied", False),
            "successful_biometric": count("biometric_success", True),
            "failed_biometric": count("biometric_failed", False),
            "successful_security_key": count("security_key_success", True),
            "failed_security_key": count("security_key_failed", False),
            "locked_accounts": locked_accounts,
            "unauthorized_admin_access": count("unauthorized_admin_access"),
        }


# =========================================================
# 2FA DATABASE HELPERS
# =========================================================

# --- Auth Methods ---

def get_user_auth_methods(user_id):
    with db_cursor() as cur:
        cur.execute("""
            SELECT method_type, is_enabled, created_at
            FROM auth_methods
            WHERE user_id = ?
            ORDER BY id ASC
        """, (user_id,))
        return cur.fetchall()


def get_user_enabled_methods(user_id):
    with db_cursor() as cur:
        cur.execute("""
            SELECT method_type
            FROM auth_methods
            WHERE user_id = ? AND is_enabled = 1
            ORDER BY id ASC
        """, (user_id,))
        return [row["method_type"] for row in cur.fetchall()]


def has_enabled_auth_method(user_id, method_type):
    with db_cursor() as cur:
        cur.execute("""
            SELECT id
            FROM auth_methods
            WHERE user_id = ? AND method_type = ? AND is_enabled = 1
        """, (user_id, method_type))
        return cur.fetchone() is not None


def enable_auth_method(user_id, method_type):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO auth_methods (user_id, method_type, is_enabled)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id, method_type) DO UPDATE SET is_enabled = 1
        """, (user_id, method_type))
        # Keep legacy flag in sync
        cur.execute("UPDATE users SET is_2fa_enabled = 1 WHERE id = ?", (user_id,))


def disable_auth_method(user_id, method_type):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE auth_methods
            SET is_enabled = 0
            WHERE user_id = ? AND method_type = ?
        """, (user_id, method_type))
        # Check if user has any other enabled methods left
        cur.execute("""
            SELECT COUNT(*) AS total
            FROM auth_methods
            WHERE user_id = ? AND is_enabled = 1
        """, (user_id,))
        if cur.fetchone()["total"] == 0:
            cur.execute("UPDATE users SET is_2fa_enabled = 0 WHERE id = ?", (user_id,))


def delete_auth_method(user_id, method_type):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            DELETE FROM auth_methods
            WHERE user_id = ? AND method_type = ?
        """, (user_id, method_type))
        if method_type == "TOTP":
            cur.execute("DELETE FROM totp_credentials WHERE user_id = ?", (user_id,))
            cur.execute("UPDATE users SET totp_secret = NULL WHERE id = ?", (user_id,))
        elif method_type in ("BIOMETRIC", "SECURITY_KEY"):
            cur.execute("""
                DELETE FROM webauthn_credentials
                WHERE user_id = ? AND credential_type = ?
            """, (user_id, method_type))
        elif method_type == "PUSH":
            cur.execute("DELETE FROM push_devices WHERE user_id = ?", (user_id,))

        # Update legacy is_2fa_enabled if no remaining enabled methods
        cur.execute("""
            SELECT COUNT(*) AS total
            FROM auth_methods
            WHERE user_id = ? AND is_enabled = 1
        """, (user_id,))
        if cur.fetchone()["total"] == 0:
            cur.execute("UPDATE users SET is_2fa_enabled = 0 WHERE id = ?", (user_id,))


# --- TOTP Credentials ---

def get_totp_credential(user_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM totp_credentials WHERE user_id = ?", (user_id,))
        return cur.fetchone()


def create_or_update_totp_credential(user_id, secret):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO totp_credentials (user_id, secret, last_used_step)
            VALUES (?, ?, 0)
            ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, last_used_step = 0
        """, (user_id, secret))
        # Also maintain legacy users.totp_secret for backward compatibility
        cur.execute("UPDATE users SET totp_secret = ? WHERE id = ?", (secret, user_id))


def check_and_update_totp_step(user_id, current_step):
    with db_cursor(commit=True) as cur:
        cur.execute("SELECT last_used_step FROM totp_credentials WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        last_step = row["last_used_step"] if row and row["last_used_step"] is not None else 0
        if current_step <= last_step:
            return False  # Replay detected
        cur.execute("""
            UPDATE totp_credentials
            SET last_used_step = ?
            WHERE user_id = ?
        """, (current_step, user_id))
        return True


# --- WebAuthn Credentials ---

def create_webauthn_credential(user_id, credential_id, public_key, sign_count, credential_type, aaguid=None, transports=None):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO webauthn_credentials
            (user_id, credential_id, public_key, sign_count, credential_type, aaguid, transports)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, credential_id, public_key, sign_count, credential_type, aaguid, transports))
        # Enable the method in auth_methods
        cur.execute("""
            INSERT INTO auth_methods (user_id, method_type, is_enabled)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id, method_type) DO UPDATE SET is_enabled = 1
        """, (user_id, credential_type))
        cur.execute("UPDATE users SET is_2fa_enabled = 1 WHERE id = ?", (user_id,))
        return cur.lastrowid


def get_webauthn_credentials_by_user(user_id, credential_type=None):
    with db_cursor() as cur:
        if credential_type:
            cur.execute("""
                SELECT * FROM webauthn_credentials
                WHERE user_id = ? AND credential_type = ?
                ORDER BY id ASC
            """, (user_id, credential_type))
        else:
            cur.execute("""
                SELECT * FROM webauthn_credentials
                WHERE user_id = ?
                ORDER BY id ASC
            """, (user_id,))
        return cur.fetchall()


def get_webauthn_credential_by_id(credential_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM webauthn_credentials WHERE credential_id = ?", (credential_id,))
        return cur.fetchone()


def update_webauthn_sign_count(credential_id, new_sign_count):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE webauthn_credentials
            SET sign_count = ?, last_used_at = CURRENT_TIMESTAMP
            WHERE credential_id = ?
        """, (new_sign_count, credential_id))


def delete_webauthn_credential(credential_id):
    with db_cursor(commit=True) as cur:
        cur.execute("SELECT user_id, credential_type FROM webauthn_credentials WHERE credential_id = ?", (credential_id,))
        row = cur.fetchone()
        if not row:
            return
        user_id = row["user_id"]
        cred_type = row["credential_type"]
        cur.execute("DELETE FROM webauthn_credentials WHERE credential_id = ?", (credential_id,))
        # Check if user has any more credentials of this type
        cur.execute("""
            SELECT COUNT(*) AS total
            FROM webauthn_credentials
            WHERE user_id = ? AND credential_type = ?
        """, (user_id, cred_type))
        if cur.fetchone()["total"] == 0:
            cur.execute("""
                UPDATE auth_methods
                SET is_enabled = 0
                WHERE user_id = ? AND method_type = ?
            """, (user_id, cred_type))
            cur.execute("""
                SELECT COUNT(*) AS total
                FROM auth_methods
                WHERE user_id = ? AND is_enabled = 1
            """, (user_id,))
            if cur.fetchone()["total"] == 0:
                cur.execute("UPDATE users SET is_2fa_enabled = 0 WHERE id = ?", (user_id,))


# --- Push Devices & Requests ---

def create_push_device(user_id, device_name, device_identifier):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO push_devices (user_id, device_name, device_identifier, is_enabled)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(device_identifier) DO UPDATE SET device_name = excluded.device_name, is_enabled = 1
        """, (user_id, device_name, device_identifier))
        device_id = cur.lastrowid

        cur.execute("""
            INSERT INTO auth_methods (user_id, method_type, is_enabled)
            VALUES (?, 'PUSH', 1)
            ON CONFLICT(user_id, method_type) DO UPDATE SET is_enabled = 1
        """, (user_id,))
        cur.execute("UPDATE users SET is_2fa_enabled = 1 WHERE id = ?", (user_id,))
        return device_id


def get_push_devices_by_user(user_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM push_devices WHERE user_id = ? AND is_enabled = 1", (user_id,))
        return cur.fetchall()


def get_push_device_by_identifier(device_identifier):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM push_devices WHERE device_identifier = ?", (device_identifier,))
        return cur.fetchone()


def remove_push_device(device_id, user_id):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM push_devices WHERE id = ? AND user_id = ?", (device_id, user_id))
        cur.execute("SELECT COUNT(*) AS total FROM push_devices WHERE user_id = ? AND is_enabled = 1", (user_id,))
        if cur.fetchone()["total"] == 0:
            cur.execute("""
                UPDATE auth_methods
                SET is_enabled = 0
                WHERE user_id = ? AND method_type = 'PUSH'
            """, (user_id,))
            cur.execute("""
                SELECT COUNT(*) AS total
                FROM auth_methods
                WHERE user_id = ? AND is_enabled = 1
            """, (user_id,))
            if cur.fetchone()["total"] == 0:
                cur.execute("UPDATE users SET is_2fa_enabled = 0 WHERE id = ?", (user_id,))


def create_push_request(attempt_id, user_id, request_id, expires_at):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO push_requests (id, attempt_id, user_id, request_id, status, expires_at)
            VALUES (?, ?, ?, ?, 'PENDING', ?)
        """, (request_id, attempt_id, user_id, request_id, expires_at))
        return request_id


def get_push_request_by_request_id(request_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM push_requests WHERE request_id = ?", (request_id,))
        return cur.fetchone()


def get_pending_push_requests_for_user(user_id):
    with db_cursor() as cur:
        cur.execute("""
            SELECT * FROM push_requests
            WHERE user_id = ? AND status = 'PENDING' AND expires_at > datetime('now')
            ORDER BY created_at DESC
        """, (user_id,))
        return cur.fetchall()


def update_push_request_status(request_id, status):
    with db_cursor(commit=True) as cur:
        if status == "APPROVED":
            cur.execute("""
                UPDATE push_requests
                SET status = ?, approved_at = CURRENT_TIMESTAMP
                WHERE request_id = ?
            """, (status, request_id))
        elif status == "DENIED":
            cur.execute("""
                UPDATE push_requests
                SET status = ?, denied_at = CURRENT_TIMESTAMP
                WHERE request_id = ?
            """, (status, request_id))
        else:
            cur.execute("""
                UPDATE push_requests
                SET status = ?
                WHERE request_id = ?
            """, (status, request_id))


# --- QR Requests ---

def create_qr_request(attempt_id, user_id, request_id, challenge, expires_at):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO qr_requests (id, attempt_id, user_id, request_id, challenge, status, expires_at)
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
        """, (request_id, attempt_id, user_id, request_id, challenge, expires_at))
        return request_id


def get_qr_request_by_request_id(request_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM qr_requests WHERE request_id = ?", (request_id,))
        return cur.fetchone()


def get_qr_request_by_challenge(challenge):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM qr_requests WHERE challenge = ?", (challenge,))
        return cur.fetchone()


def update_qr_request_status(request_id, status):
    with db_cursor(commit=True) as cur:
        if status == "APPROVED":
            cur.execute("""
                UPDATE qr_requests
                SET status = ?, approved_at = CURRENT_TIMESTAMP
                WHERE request_id = ?
            """, (status, request_id))
        elif status == "DENIED":
            cur.execute("""
                UPDATE qr_requests
                SET status = ?, denied_at = CURRENT_TIMESTAMP
                WHERE request_id = ?
            """, (status, request_id))
        else:
            cur.execute("""
                UPDATE qr_requests
                SET status = ?
                WHERE request_id = ?
            """, (status, request_id))


# --- WebAuthn Challenges ---

def create_webauthn_challenge(challenge_id, user_id, ceremony_type, challenge, expires_at, attempt_id=None):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO webauthn_challenges (id, user_id, attempt_id, ceremony_type, challenge, expires_at, is_consumed)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        """, (challenge_id, user_id, attempt_id, ceremony_type, challenge, expires_at))
        return challenge_id


def get_valid_webauthn_challenge(user_id, ceremony_type, challenge_str=None, attempt_id=None):
    with db_cursor() as cur:
        if challenge_str:
            cur.execute("""
                SELECT * FROM webauthn_challenges
                WHERE user_id = ? AND ceremony_type = ? AND challenge = ? AND is_consumed = 0
                AND expires_at > datetime('now')
                ORDER BY created_at DESC
                LIMIT 1
            """, (user_id, ceremony_type, challenge_str))
        elif attempt_id:
            cur.execute("""
                SELECT * FROM webauthn_challenges
                WHERE user_id = ? AND ceremony_type = ? AND attempt_id = ? AND is_consumed = 0
                AND expires_at > datetime('now')
                ORDER BY created_at DESC
                LIMIT 1
            """, (user_id, ceremony_type, attempt_id))
        else:
            cur.execute("""
                SELECT * FROM webauthn_challenges
                WHERE user_id = ? AND ceremony_type = ? AND is_consumed = 0
                AND expires_at > datetime('now')
                ORDER BY created_at DESC
                LIMIT 1
            """, (user_id, ceremony_type))
        return cur.fetchone()


def consume_webauthn_challenge(challenge_id):
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE webauthn_challenges SET is_consumed = 1 WHERE id = ?", (challenge_id,))


# --- Auth Attempts ---

def create_auth_attempt(attempt_id, user_id, expires_at):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO auth_attempts (id, user_id, status, failed_count, expires_at)
            VALUES (?, ?, 'PENDING', 0, ?)
        """, (attempt_id, user_id, expires_at))
        return attempt_id


def get_auth_attempt(attempt_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM auth_attempts WHERE id = ?", (attempt_id,))
        return cur.fetchone()


def update_attempt_method(attempt_id, method):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE auth_attempts
            SET selected_method = ?
            WHERE id = ? AND status = 'PENDING'
        """, (method, attempt_id))


def update_attempt_status(attempt_id, status):
    with db_cursor(commit=True) as cur:
        if status in ("VERIFIED", "FAILED", "EXPIRED"):
            cur.execute("""
                UPDATE auth_attempts
                SET status = ?, completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status, attempt_id))
        else:
            cur.execute("""
                UPDATE auth_attempts
                SET status = ?
                WHERE id = ?
            """, (status, attempt_id))


def increment_attempt_failed_count(attempt_id):
    with db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE auth_attempts
            SET failed_count = failed_count + 1
            WHERE id = ?
        """, (attempt_id,))
        cur.execute("SELECT failed_count FROM auth_attempts WHERE id = ?", (attempt_id,))
        row = cur.fetchone()
        return row["failed_count"] if row else 0

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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                voter_id INTEGER NOT NULL UNIQUE,
                candidate_id INTEGER NOT NULL,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY(voter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
            )
        """)
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

def get_candidates():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM candidates ORDER BY id")
        return cur.fetchall()

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

        # Candidate exists?
        cur.execute(
            "SELECT id FROM candidates WHERE id=?",
            (candidate_id,)
        )
        if not cur.fetchone():
            return {
                "success": False,
                "message": "Candidate not found."
            }

        try:
            cur.execute("""
                INSERT INTO votes(voter_id,candidate_id)
                VALUES(?,?)
            """, (
                voter_id,
                candidate_id
            ))
            cur.execute("""
                UPDATE users
                SET has_voted=1
                WHERE id=?
            """, (voter_id,))

            return {
                "success": True,
                "message": "Vote cast successfully."
            }
        except sqlite3.IntegrityError:
            return {
                "success": False,
                "message": "Duplicate vote prevented."
            }

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
        output = []
        for row in results:
            percentage = (
                (row["votes"]/total_votes)*100
                if total_votes else 0
            )
            output.append({
                "candidate_id": row["id"],
                "name": row["name"],
                "party": row["party"],
                "votes": row["votes"],
                "percentage": round(percentage,2)
            })
        return output

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
                """, (event,int(success)))
            return cur.fetchone()[0]
        cur.execute("""
            SELECT COUNT(*)
            FROM auth_events
        """)

        total_events = cur.fetchone()[0]
        cur.execute("""
            SELECT COUNT(*)
            FROM users
            WHERE locked_until IS NOT NULL
        """)

        locked_accounts = cur.fetchone()[0]
        return {
            "successful_logins":
                count("login_password",True),
            "failed_logins":
                count("login_password",False),
            "failed_totp":
                count("login_totp",False),
            "locked_accounts":
                locked_accounts,
            "unauthorized_admin_access":
                count("unauthorized_admin_access"),
            "total_security_events":
                total_events
        }
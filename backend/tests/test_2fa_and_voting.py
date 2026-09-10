import os
import secrets
import time
import pytest
import pyotp
from werkzeug.security import generate_password_hash

import database as db
from app import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """
    Creates an isolated test database and test Flask client for test runs.
    """
    test_db_path = str(tmp_path / "test_voting.db")
    monkeypatch.setenv("DATABASE_PATH", test_db_path)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-32-bytes-long-12345")
    db.DB_PATH = test_db_path

    # Initialize fresh schema
    db.init_db()

    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_registration_and_validation(client):
    # 1. Invalid username
    res = client.post("/api/register", json={"username": "ab", "password": "password123"})
    assert res.status_code == 400

    # 2. Invalid password
    res = client.post("/api/register", json={"username": "validuser", "password": "123"})
    assert res.status_code == 400

    # 3. Successful registration
    res = client.post("/api/register", json={"username": "newvoter", "password": "password123"})
    assert res.status_code == 201
    body = res.get_json()
    assert body["success"] is True
    assert body["data"]["username"] == "newvoter"
    assert body["data"]["next"] == "setup-2fa"

    # 4. Duplicate username rejected
    res2 = client.post("/api/register", json={"username": "newvoter", "password": "password123"})
    assert res2.status_code == 409


def test_auth_state_isolation(client):
    # Register voter
    client.post("/api/register", json={"username": "isolated_voter", "password": "password123"})

    # Setup TOTP
    res_setup = client.get("/api/setup-2fa")
    assert res_setup.status_code == 200
    secret = res_setup.get_json()["data"]["secret"]
    totp = pyotp.TOTP(secret)
    token = totp.now()
    res_conf = client.post("/api/setup-2fa", json={"token": token})
    assert res_conf.status_code == 200

    # Step 1: Login with password (Transitions to State 2: PENDING)
    res_login = client.post("/api/login", json={"username": "isolated_voter", "password": "password123"})
    assert res_login.status_code == 200
    login_body = res_login.get_json()
    assert login_body["data"]["next"] == "choose-2fa"
    assert "TOTP" in login_body["data"]["methods"]

    # State 2 user MUST NOT access protected resources
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/candidates").status_code == 401
    assert client.post("/api/vote", json={"candidate_id": 1}).status_code == 401
    assert client.get("/api/admin").status_code == 401

    # Step 2: Complete TOTP (Transitions to State 3: FULLY AUTHENTICATED)
    # Wait or ensure next timestep
    time.sleep(1)
    res_totp = client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": login_body["data"]["attempt_id"]})
    assert res_totp.status_code == 200

    # State 3 user can now access /api/me and dashboard
    res_me = client.get("/api/me")
    assert res_me.status_code == 200
    assert res_me.get_json()["data"]["username"] == "isolated_voter"

    # Logout destroys session
    res_logout = client.post("/api/logout")
    assert res_logout.status_code == 200
    assert client.get("/api/me").status_code == 401


def test_password_lockout(client):
    client.post("/api/register", json={"username": "lockout_user", "password": "correct_password"})

    # 4 incorrect attempts
    for _ in range(4):
        res = client.post("/api/login", json={"username": "lockout_user", "password": "wrong_password"})
        assert res.status_code == 401

    # 5th incorrect attempt -> triggers 15 min lockout (423)
    res5 = client.post("/api/login", json={"username": "lockout_user", "password": "wrong_password"})
    assert res5.status_code == 423
    assert "locked" in res5.get_json()["message"].lower()

    # Even correct password is now blocked while locked
    res_correct_while_locked = client.post("/api/login", json={"username": "lockout_user", "password": "correct_password"})
    assert res_correct_while_locked.status_code == 423


def test_totp_replay_protection(client):
    client.post("/api/register", json={"username": "replay_user", "password": "password123"})
    res_setup = client.get("/api/setup-2fa")
    secret = res_setup.get_json()["data"]["secret"]
    totp = pyotp.TOTP(secret)
    client.post("/api/setup-2fa", json={"token": totp.now()})

    # Login
    res_login = client.post("/api/login", json={"username": "replay_user", "password": "password123"})
    attempt_id = res_login.get_json()["data"]["attempt_id"]

    # First verification with token
    current_token = totp.now()
    res1 = client.post("/api/verify-totp", json={"token": current_token, "attempt_id": attempt_id})
    assert res1.status_code == 200

    # Logout
    client.post("/api/logout")

    # Login again in same 30-sec window
    res_login2 = client.post("/api/login", json={"username": "replay_user", "password": "password123"})
    attempt_id2 = res_login2.get_json()["data"]["attempt_id"]

    # Attempt replay with identical token within same timestep
    res_replay = client.post("/api/verify-totp", json={"token": current_token, "attempt_id": attempt_id2})
    assert res_replay.status_code == 401
    assert "replayed" in res_replay.get_json()["message"].lower()


def test_push_authentication_flow(client):
    # Register user
    client.post("/api/register", json={"username": "push_user", "password": "password123"})

    # Enroll push device
    res_enroll = client.post("/api/2fa/push/enroll", json={"device_name": "Test Phone"})
    assert res_enroll.status_code == 201
    device_identifier = res_enroll.get_json()["data"]["device_identifier"]

    # Login
    res_login = client.post("/api/login", json={"username": "push_user", "password": "password123"})
    attempt_id = res_login.get_json()["data"]["attempt_id"]
    assert "PUSH" in res_login.get_json()["data"]["methods"]

    # Select PUSH method
    res_select = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "PUSH"})
    assert res_select.status_code == 200

    # Create Push Request
    res_push_req = client.post("/api/2fa/push/request", json={"attempt_id": attempt_id})
    assert res_push_req.status_code == 200
    request_id = res_push_req.get_json()["data"]["request_id"]

    # Polling initially shows PENDING
    res_poll = client.get(f"/api/2fa/push/status?request_id={request_id}")
    assert res_poll.status_code == 200
    assert res_poll.get_json()["data"]["status"] == "PENDING"

    # Security check: Unauthenticated arbitrary approval attempt rejected (401)
    res_unauth = client.post("/api/2fa/push/respond", json={"request_id": request_id, "action": "approve"})
    assert res_unauth.status_code == 401

    # Security check: Arbitrary device identifier rejected (403)
    res_fake_dev = client.post("/api/2fa/push/respond", json={
        "request_id": request_id,
        "action": "approve",
        "device_identifier": "unauthorized_device_token"
    })
    assert res_fake_dev.status_code == 403

    # Security check: Fake user_id in payload rejected (401)
    res_fake_user = client.post("/api/2fa/push/respond", json={
        "request_id": request_id,
        "action": "approve",
        "user_id": 999
    })
    assert res_fake_user.status_code == 401

    # Legitimate enrolled device approves request
    res_approve = client.post("/api/2fa/push/respond", json={
        "request_id": request_id,
        "action": "approve",
        "device_identifier": device_identifier
    })
    assert res_approve.status_code == 200

    # Polling now returns APPROVED and establishes session
    res_poll2 = client.get(f"/api/2fa/push/status?request_id={request_id}")
    assert res_poll2.status_code == 200
    assert res_poll2.get_json()["data"]["status"] == "APPROVED"

    # Primary client is now fully authenticated
    res_me = client.get("/api/me")
    assert res_me.status_code == 200
    assert res_me.get_json()["data"]["username"] == "push_user"


def test_qr_challenge_authentication_flow(client):
    # Register user
    client.post("/api/register", json={"username": "qr_user", "password": "password123"})

    # Enroll QR for qr_user
    res_enroll_qr = client.post("/api/2fa/qr/enroll")
    assert res_enroll_qr.status_code == 200

    # Enroll a trusted mobile device for qr_user
    user = db.get_user_by_username("qr_user")
    device_identifier = "trusted_mobile_scanner_token_123"
    db.create_push_device(user["id"], "Trusted Mobile Scanner", device_identifier)

    # Login
    res_login = client.post("/api/login", json={"username": "qr_user", "password": "password123"})
    attempt_id = res_login.get_json()["data"]["attempt_id"]
    assert "QR" in res_login.get_json()["data"]["methods"]

    # Select QR
    res_select = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "QR"})
    assert res_select.status_code == 200

    # Create QR Challenge
    res_qr_req = client.post("/api/2fa/qr/request", json={"attempt_id": attempt_id})
    assert res_qr_req.status_code == 200
    qr_data = res_qr_req.get_json()["data"]
    request_id = qr_data["request_id"]
    challenge = qr_data["challenge"]
    assert "data:image/png;base64" in qr_data["qr_code"]

    # Polling initially shows PENDING
    res_poll = client.get(f"/api/2fa/qr/status?request_id={request_id}")
    assert res_poll.status_code == 200
    assert res_poll.get_json()["data"]["status"] == "PENDING"

    # Security check: Unauthenticated scanner rejected (401)
    res_unauth = client.post("/api/2fa/qr/respond", json={"challenge": challenge, "action": "approve"})
    assert res_unauth.status_code == 401

    # Security check: Bogus device identifier rejected (403)
    res_fake_dev = client.post("/api/2fa/qr/respond", json={
        "challenge": challenge,
        "action": "approve",
        "device_identifier": "unauthorized_scanner_id"
    })
    assert res_fake_dev.status_code == 403

    # Security check: Arbitrary user_id / username in body ignored and rejected (401)
    res_fake_user = client.post("/api/2fa/qr/respond", json={
        "challenge": challenge,
        "action": "approve",
        "user_id": 999,
        "username": "qr_user"
    })
    assert res_fake_user.status_code == 401

    # Legitimate trusted mobile scanner approves
    res_approve = client.post("/api/2fa/qr/respond", json={
        "challenge": challenge,
        "action": "approve",
        "device_identifier": device_identifier
    })
    assert res_approve.status_code == 200

    # Polling returns APPROVED and authenticates
    res_poll2 = client.get(f"/api/2fa/qr/status?request_id={request_id}")
    assert res_poll2.get_json()["data"]["status"] == "APPROVED"

    # Primary client is now fully authenticated
    res_me = client.get("/api/me")
    assert res_me.status_code == 200
    assert res_me.get_json()["data"]["username"] == "qr_user"


def test_multiple_methods_and_switching(client):
    # Register and enroll TOTP, PUSH, and QR
    client.post("/api/register", json={"username": "multi_user", "password": "password123"})
    res_setup = client.get("/api/setup-2fa")
    totp = pyotp.TOTP(res_setup.get_json()["data"]["secret"])
    client.post("/api/setup-2fa", json={"token": totp.now()})

    # Log in and enroll additional methods
    res_l = client.post("/api/login", json={"username": "multi_user", "password": "password123"})
    time.sleep(1)
    client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": res_l.get_json()["data"]["attempt_id"]})

    client.post("/api/2fa/push/enroll", json={"device_name": "Tablet"})
    client.post("/api/2fa/qr/enroll")

    # Check /api/2fa/methods
    res_methods = client.get("/api/2fa/methods")
    assert res_methods.status_code == 200
    enabled = res_methods.get_json()["data"]["enabled_methods"]
    assert set(enabled) == {"TOTP", "PUSH", "QR"}

    # Logout
    client.post("/api/logout")

    # Login: all 3 methods returned
    res_login = client.post("/api/login", json={"username": "multi_user", "password": "password123"})
    login_data = res_login.get_json()["data"]
    attempt_id = login_data["attempt_id"]
    assert set(login_data["methods"]) == {"TOTP", "PUSH", "QR"}

    # Switch to PUSH
    res_sel_push = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "PUSH"})
    assert res_sel_push.status_code == 200

    # Switch to QR while still PENDING
    res_sel_qr = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "QR"})
    assert res_sel_qr.status_code == 200

    # Switch to TOTP and verify (reset last_used_step to simulate next timestep)
    with db.db_cursor(commit=True) as cur:
        cur.execute("UPDATE totp_credentials SET last_used_step = 0")

    res_sel_totp = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "TOTP"})
    assert res_sel_totp.status_code == 200
    res_v = client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": attempt_id})
    assert res_v.status_code == 200

    # Once verified, attempt cannot be reused
    res_reuse = client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": attempt_id})
    assert res_reuse.status_code == 400


def test_voting_full_cycle_and_admin(client):
    # 1. Create Admin
    admin_id = db.create_user("election_admin", generate_password_hash("adminpassword123"), role="admin")
    secret = pyotp.random_base32()
    db.create_or_update_totp_credential(admin_id, secret)
    db.enable_auth_method(admin_id, "TOTP")
    admin_totp = pyotp.TOTP(secret)

    # Admin Login
    res_admin_login = client.post("/api/login", json={"username": "election_admin", "password": "adminpassword123"})
    admin_attempt = res_admin_login.get_json()["data"]["attempt_id"]
    res_admin_2fa = client.post("/api/verify-totp", json={"token": admin_totp.now(), "attempt_id": admin_attempt})
    assert res_admin_2fa.status_code == 200

    # Create candidate
    res_c1 = client.post("/api/candidates", json={"name": "Alice Johnson", "party": "Forward Party", "description": "Integrity"})
    assert res_c1.status_code == 201
    c1_id = res_c1.get_json()["data"]["id"]

    res_c2 = client.post("/api/candidates", json={"name": "Bob Smith", "party": "Innovate Party", "description": "Innovation"})
    assert res_c2.status_code == 201
    c2_id = res_c2.get_json()["data"]["id"]

    # Open Election
    res_elec = client.post("/api/admin/election", json={"status": "OPEN"})
    assert res_elec.status_code == 200

    # Admin Logout
    client.post("/api/logout")

    # 2. Voter 1 registers, sets up 2FA, logs in, and votes for Alice
    client.post("/api/register", json={"username": "voter1", "password": "password123"})
    v1_totp_secret = client.get("/api/setup-2fa").get_json()["data"]["secret"]
    v1_totp = pyotp.TOTP(v1_totp_secret)
    client.post("/api/setup-2fa", json={"token": v1_totp.now()})

    res_v1_l = client.post("/api/login", json={"username": "voter1", "password": "password123"})
    client.post("/api/verify-totp", json={"token": v1_totp.now(), "attempt_id": res_v1_l.get_json()["data"]["attempt_id"]})

    # Cast Vote
    res_vote = client.post("/api/vote", json={"candidate_id": c1_id})
    assert res_vote.status_code == 201
    receipt = res_vote.get_json()["data"]
    assert receipt["candidate_name"] == "Alice Johnson"
    assert "receipt_code" in receipt

    # Duplicate vote prevented
    res_dup = client.post("/api/vote", json={"candidate_id": c2_id})
    assert res_dup.status_code == 409

    # View vote receipt
    res_my_vote = client.get("/api/my-vote")
    assert res_my_vote.status_code == 200
    assert res_my_vote.get_json()["data"]["receipt_code"] == receipt["receipt_code"]

    client.post("/api/logout")

    # 3. Voter 2 registers, sets up 2FA, logs in, and casts Abstain (NOTA)
    client.post("/api/register", json={"username": "voter2", "password": "password123"})
    v2_totp_secret = client.get("/api/setup-2fa").get_json()["data"]["secret"]
    v2_totp = pyotp.TOTP(v2_totp_secret)
    client.post("/api/setup-2fa", json={"token": v2_totp.now()})

    res_v2_l = client.post("/api/login", json={"username": "voter2", "password": "password123"})
    client.post("/api/verify-totp", json={"token": v2_totp.now(), "attempt_id": res_v2_l.get_json()["data"]["attempt_id"]})

    res_vote_nota = client.post("/api/vote", json={"candidate_id": None})
    assert res_vote_nota.status_code == 201

    # Check Results
    res_results = client.get("/api/results")
    assert res_results.status_code == 200
    results_data = res_results.get_json()["data"]
    assert results_data["total_votes"] == 2
    nota_entry = [r for r in results_data["results"] if r["candidate_id"] is None][0]
    assert nota_entry["votes"] == 1
    alice_entry = [r for r in results_data["results"] if r["candidate_id"] == c1_id][0]
    assert alice_entry["votes"] == 1
    assert alice_entry["percentage"] == 50.0

    client.post("/api/logout")

    # 4. Admin checks security stats and audit events (reset last_used_step to simulate next timestep)
    with db.db_cursor(commit=True) as cur:
        cur.execute("UPDATE totp_credentials SET last_used_step = 0 WHERE user_id = ?", (admin_id,))

    res_admin_login2 = client.post("/api/login", json={"username": "election_admin", "password": "adminpassword123"})
    res_totp_v = client.post("/api/verify-totp", json={"token": admin_totp.now(), "attempt_id": res_admin_login2.get_json()["data"]["attempt_id"]})
    assert res_totp_v.status_code == 200

    res_stats = client.get("/api/admin/security-stats")
    assert res_stats.status_code == 200
    stats = res_stats.get_json()["data"]
    assert stats["total_security_events"] > 0
    assert stats["successful_logins"] >= 3

    res_events = client.get("/api/admin/security-events")
    assert res_events.status_code == 200
    assert len(res_events.get_json()["data"]) > 0


def test_webauthn_registration_options_and_isolation(client):
    # 1. Register user
    client.post("/api/register", json={"username": "webauthn_user", "password": "password123"})

    # 2. Generate Biometric Register Options (platform attachment)
    res_bio_opt = client.post("/api/2fa/biometric/register-options")
    assert res_bio_opt.status_code == 200
    bio_data = res_bio_opt.get_json()["data"]
    assert "challenge" in bio_data
    assert bio_data["authenticatorSelection"]["authenticatorAttachment"] == "platform"

    # 3. Generate Security Key Register Options (cross-platform attachment)
    res_key_opt = client.post("/api/2fa/security-key/register-options")
    assert res_key_opt.status_code == 200
    key_data = res_key_opt.get_json()["data"]
    assert "challenge" in key_data
    assert key_data["authenticatorSelection"]["authenticatorAttachment"] == "cross-platform"

    # 4. Store a simulated biometric credential in DB and verify method separation
    user = db.get_user_by_username("webauthn_user")
    db.create_webauthn_credential(
        user_id=user["id"],
        credential_id="test_bio_cred_id_123",
        public_key="test_bio_pub_key_123",
        sign_count=0,
        credential_type="BIOMETRIC",
    )

    # Login to State 2
    res_login = client.post("/api/login", json={"username": "webauthn_user", "password": "password123"})
    attempt_id = res_login.get_json()["data"]["attempt_id"]
    assert "BIOMETRIC" in res_login.get_json()["data"]["methods"]

    # Biometric auth options succeed
    res_bio_auth_opt = client.post("/api/2fa/biometric/auth-options", json={"attempt_id": attempt_id})
    assert res_bio_auth_opt.status_code == 200

    # Security key auth options fail because no SECURITY_KEY credentials exist
    res_key_auth_opt = client.post("/api/2fa/security-key/auth-options", json={"attempt_id": attempt_id})
    assert res_key_auth_opt.status_code == 400
    assert "no security_key credentials" in res_key_auth_opt.get_json()["message"].lower()


def test_disable_method_lockout_prevention(client):
    # Register and setup TOTP
    client.post("/api/register", json={"username": "disable_test_user", "password": "password123"})
    res_setup = client.get("/api/setup-2fa")
    totp = pyotp.TOTP(res_setup.get_json()["data"]["secret"])
    client.post("/api/setup-2fa", json={"token": totp.now()})

    # Log in
    res_l = client.post("/api/login", json={"username": "disable_test_user", "password": "password123"})
    client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": res_l.get_json()["data"]["attempt_id"]})

    # Attempt to disable the only active method (TOTP) -> should be rejected with 400
    res_dis_single = client.delete("/api/2fa/methods/TOTP")
    assert res_dis_single.status_code == 400
    assert "only active" in res_dis_single.get_json()["message"].lower()

    # Now enroll PUSH so user has 2 methods
    client.post("/api/2fa/push/enroll", json={"device_name": "Second Factor Device"})

    # Now disabling TOTP is allowed
    res_dis_totp = client.delete("/api/2fa/methods/TOTP")
    assert res_dis_totp.status_code == 200

    # User still has PUSH enabled
    user = db.get_user_by_username("disable_test_user")
    assert db.get_user_enabled_methods(user["id"]) == ["PUSH"]


def test_existing_database_integrity():
    """
    Directly verifies the persistence and integrity of voting_system.db data.
    """
    import sqlite3
    conn = sqlite3.connect("voting_system.db")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Verify tables exist
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    table_names = [r["name"] for r in cur.fetchall()]
    for t in ["users", "candidates", "votes", "elections", "auth_events", "auth_methods", "totp_credentials"]:
        assert t in table_names

    # Verify existing users
    cur.execute("SELECT username, role, totp_secret, is_2fa_enabled FROM users WHERE username='admin'")
    admin_row = cur.fetchone()
    assert admin_row is not None
    assert admin_row["role"] == "admin"
    assert admin_row["totp_secret"] is not None

    # Verify existing candidate
    cur.execute("SELECT name FROM candidates WHERE id=3")
    cand_row = cur.fetchone()
    assert cand_row is not None
    assert cand_row["name"] == "Shabnam"

    conn.close()

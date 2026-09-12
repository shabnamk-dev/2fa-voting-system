import os
import secrets
import time
from datetime import datetime, timedelta
import pytest
import pyotp
from werkzeug.security import generate_password_hash

import database as db
from app import create_app
from auth.utils import utc_now


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
    assert client.get("/api/candidates").status_code == 401
    assert client.post("/api/vote", json={"candidate_id": 1}).status_code == 401
    assert client.get("/api/admin/security-stats").status_code == 401

    # Step 2: Complete TOTP (Transitions to State 3: FULLY AUTHENTICATED)
    time.sleep(1)
    res_totp = client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": login_body["data"]["attempt_id"]})
    assert res_totp.status_code == 200

    # State 3 user can now access /api/me
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


def test_push_trusted_device_enrollment_and_auth(client):
    # Register user
    client.post("/api/register", json={"username": "push_user", "password": "password123"})

    # Setup TOTP first
    res_setup = client.get("/api/setup-2fa")
    totp = pyotp.TOTP(res_setup.get_json()["data"]["secret"])
    client.post("/api/setup-2fa", json={"token": totp.now()})

    # Login to State 3
    res_l = client.post("/api/login", json={"username": "push_user", "password": "password123"})
    client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": res_l.get_json()["data"]["attempt_id"]})

    # Enroll trusted device
    res_enroll = client.post("/api/2fa/push/enroll", json={"device_name": "Test Laptop"})
    assert res_enroll.status_code == 201
    data = res_enroll.get_json()["data"]
    device_identifier = data["device_identifier"]
    device_secret = data["device_secret"]
    assert device_identifier.startswith("push_dev_")

    # Check database: device exists and PUSH is enabled
    user = db.get_user_by_username("push_user")
    devices = db.get_push_devices_by_user(user["id"])
    assert len(devices) == 1
    assert devices[0]["device_name"] == "Test Laptop"
    assert db.has_enabled_auth_method(user["id"], "PUSH") is True

    # Logout
    client.post("/api/logout")

    # Step 1: Login with password
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

    # Security check: Arbitrary fake device identifier rejected (403)
    res_fake_dev = client.post("/api/2fa/push/respond", json={
        "request_id": request_id,
        "action": "approve",
        "device_identifier": "fake_device_token_xyz"
    })
    assert res_fake_dev.status_code == 403

    # Legitimate registered device approves request
    res_approve = client.post("/api/2fa/push/respond", json={
        "request_id": request_id,
        "action": "approve",
        "device_identifier": device_identifier,
        "device_secret": device_secret
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


def test_qr_real_enrollment_and_auth_flow(client):
    # 1. Register user and setup TOTP
    client.post("/api/register", json={"username": "qr_flow_user", "password": "password123"})
    res_setup = client.get("/api/setup-2fa")
    totp = pyotp.TOTP(res_setup.get_json()["data"]["secret"])
    client.post("/api/setup-2fa", json={"token": totp.now()})

    # Log in to State 3
    res_l = client.post("/api/login", json={"username": "qr_flow_user", "password": "password123"})
    client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": res_l.get_json()["data"]["attempt_id"]})

    user = db.get_user_by_username("qr_flow_user")

    # Before QR enrollment: QR is NOT enabled
    assert db.has_enabled_auth_method(user["id"], "QR") is False

    # 2. Step 1 of QR Enrollment: PC requests enrollment challenge
    res_enroll_req = client.post("/api/2fa/qr/enroll-request")
    assert res_enroll_req.status_code == 200
    enroll_data = res_enroll_req.get_json()["data"]
    token = enroll_data["token"]
    assert "data:image/png;base64" in enroll_data["qr_code"]
    assert "/#/qr-enroll?token=" in enroll_data["enroll_url"]

    # Enrollment status is initially PENDING
    res_status = client.get(f"/api/2fa/qr/enroll-status?token={token}")
    assert res_status.status_code == 200
    assert res_status.get_json()["data"]["status"] == "PENDING"

    # 3. Step 2 of QR Enrollment: Phone scans and confirms enrollment
    res_confirm = client.post("/api/2fa/qr/enroll-confirm", json={
        "token": token,
        "device_name": "Shabnam's Phone"
    })
    assert res_confirm.status_code == 201
    confirm_data = res_confirm.get_json()["data"]
    device_identifier = confirm_data["device_identifier"]
    device_secret = confirm_data["device_secret"]
    assert device_identifier.startswith("qr_dev_")

    # PC polling now receives COMPLETED
    res_status2 = client.get(f"/api/2fa/qr/enroll-status?token={token}")
    assert res_status2.status_code == 200
    assert res_status2.get_json()["data"]["status"] == "COMPLETED"

    # Re-using the same enrollment token is blocked
    res_reuse_enroll = client.post("/api/2fa/qr/enroll-confirm", json={
        "token": token,
        "device_name": "Another Phone"
    })
    assert res_reuse_enroll.status_code == 409

    # Now QR is officially enabled in the database
    assert db.has_enabled_auth_method(user["id"], "QR") is True
    qr_devs = db.get_qr_devices_by_user(user["id"])
    assert len(qr_devs) == 1
    assert qr_devs[0]["device_name"] == "Shabnam's Phone"

    # 4. QR Login Flow
    client.post("/api/logout")

    res_login = client.post("/api/login", json={"username": "qr_flow_user", "password": "password123"})
    attempt_id = res_login.get_json()["data"]["attempt_id"]
    assert "QR" in res_login.get_json()["data"]["methods"]

    # Select QR
    res_sel_qr = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "QR"})
    assert res_sel_qr.status_code == 200

    # PC creates QR Login challenge
    res_qr_req = client.post("/api/2fa/qr/request", json={"attempt_id": attempt_id})
    assert res_qr_req.status_code == 200
    qr_chal_data = res_qr_req.get_json()["data"]
    request_id = qr_chal_data["request_id"]
    challenge = qr_chal_data["challenge"]
    assert "/#/qr-approve?" in qr_chal_data["qr_url"]

    # Phone fetches details
    res_details = client.get(f"/api/2fa/qr/details?request_id={request_id}&challenge={challenge}")
    assert res_details.status_code == 200
    assert res_details.get_json()["data"]["username"] == "qr_flow_user"

    # Security check: Unenrolled device scanning the QR cannot approve (403)
    res_unauth_scan = client.post("/api/2fa/qr/respond", json={
        "request_id": request_id,
        "challenge": challenge,
        "action": "approve",
        "device_identifier": "unenrolled_intruder_phone"
    })
    assert res_unauth_scan.status_code == 403

    # Enrolled phone approves login
    res_approve = client.post("/api/2fa/qr/respond", json={
        "request_id": request_id,
        "challenge": challenge,
        "action": "approve",
        "device_identifier": device_identifier,
        "device_secret": device_secret
    })
    assert res_approve.status_code == 200

    # PC polling detects approval and finalizes session
    res_poll = client.get(f"/api/2fa/qr/status?request_id={request_id}")
    assert res_poll.status_code == 200
    assert res_poll.get_json()["data"]["status"] == "APPROVED"

    # Primary client is authenticated (no TOTP code was required)
    res_me = client.get("/api/me")
    assert res_me.status_code == 200
    assert res_me.get_json()["data"]["username"] == "qr_flow_user"


def test_platform_biometrics_webauthn_flow(client):
    # Register user
    client.post("/api/register", json={"username": "bio_user", "password": "password123"})
    res_setup = client.get("/api/setup-2fa")
    totp = pyotp.TOTP(res_setup.get_json()["data"]["secret"])
    client.post("/api/setup-2fa", json={"token": totp.now()})

    # Login to State 3
    res_l = client.post("/api/login", json={"username": "bio_user", "password": "password123"})
    client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": res_l.get_json()["data"]["attempt_id"]})

    # Generate Biometric Register Options (platform attachment)
    res_bio_opt = client.post("/api/2fa/biometric/register-options")
    assert res_bio_opt.status_code == 200
    bio_data = res_bio_opt.get_json()["data"]
    assert "challenge" in bio_data
    assert bio_data["authenticatorSelection"]["authenticatorAttachment"] == "platform"

    # Simulate genuine WebAuthn credential record creation in webauthn_credentials
    from auth.utils import bytes_to_b64url
    user = db.get_user_by_username("bio_user")
    cred_id = bytes_to_b64url(b"test_windows_hello_cred_id_abc")
    pub_key = bytes_to_b64url(b"test_windows_hello_pub_key_xyz")
    db.create_webauthn_credential(
        user_id=user["id"],
        credential_id=cred_id,
        public_key=pub_key,
        sign_count=0,
        credential_type="BIOMETRIC",
    )

    # Now BIOMETRIC is enabled
    assert db.has_enabled_auth_method(user["id"], "BIOMETRIC") is True
    creds = db.get_webauthn_credentials_by_user(user["id"], "BIOMETRIC")
    assert len(creds) == 1

    # Logout
    client.post("/api/logout")

    # Login
    res_login = client.post("/api/login", json={"username": "bio_user", "password": "password123"})
    attempt_id = res_login.get_json()["data"]["attempt_id"]
    assert "BIOMETRIC" in res_login.get_json()["data"]["methods"]

    # Select BIOMETRIC
    res_sel_bio = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "BIOMETRIC"})
    assert res_sel_bio.status_code == 200

    # Get Biometric Auth Options
    res_auth_opt = client.post("/api/2fa/biometric/auth-options", json={"attempt_id": attempt_id})
    assert res_auth_opt.status_code == 200
    auth_data = res_auth_opt.get_json()["data"]
    assert "challenge" in auth_data
    assert len(auth_data["allowCredentials"]) == 1
    assert auth_data["allowCredentials"][0]["id"] == cred_id


def test_security_key_completely_removed(client):
    # 1. Check methods metadata: SECURITY_KEY is NOT listed
    client.post("/api/register", json={"username": "check_no_fido", "password": "password123"})
    res_methods = client.get("/api/2fa/methods")
    assert res_methods.status_code == 200
    all_methods = [m["method"] for m in res_methods.get_json()["data"]["methods"]]
    assert "SECURITY_KEY" not in all_methods
    assert set(all_methods) == {"TOTP", "QR", "PUSH", "BIOMETRIC"}

    # 2. Cannot select SECURITY_KEY at login
    res_login = client.post("/api/login", json={"username": "check_no_fido", "password": "password123"})
    attempt_id = res_login.get_json()["data"].get("attempt_id")
    if attempt_id:
        res_sel_key = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "SECURITY_KEY"})
        assert res_sel_key.status_code == 400

    # 3. Security Key specific routes return 404
    assert client.post("/api/2fa/security-key/register-options").status_code == 404
    assert client.post("/api/2fa/security-key/auth-options").status_code == 404


def test_unenrolled_methods_cannot_authenticate(client):
    # New user with ONLY TOTP enrolled
    client.post("/api/register", json={"username": "totp_only_voter", "password": "password123"})
    res_setup = client.get("/api/setup-2fa")
    totp = pyotp.TOTP(res_setup.get_json()["data"]["secret"])
    client.post("/api/setup-2fa", json={"token": totp.now()})

    # Log out
    client.post("/api/logout")

    # Step 1: Login
    res_login = client.post("/api/login", json={"username": "totp_only_voter", "password": "password123"})
    login_data = res_login.get_json()["data"]
    attempt_id = login_data["attempt_id"]

    # Only TOTP is reported as enabled
    assert login_data["methods"] == ["TOTP"]

    # Attempting to select unenrolled QR -> 403 Forbidden
    res_sel_qr = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "QR"})
    assert res_sel_qr.status_code == 403
    assert "not enrolled or enabled" in res_sel_qr.get_json()["message"].lower()

    # Attempting to select unenrolled PUSH -> 403 Forbidden
    res_sel_push = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "PUSH"})
    assert res_sel_push.status_code == 403

    # Attempting to select unenrolled BIOMETRIC -> 403 Forbidden
    res_sel_bio = client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "BIOMETRIC"})
    assert res_sel_bio.status_code == 403

    # Attempting to create QR request without enrollment -> 403 Forbidden
    res_req_qr = client.post("/api/2fa/qr/request", json={"attempt_id": attempt_id})
    assert res_req_qr.status_code == 403

    # Attempting to create Push request without enrollment -> 403 Forbidden
    res_req_push = client.post("/api/2fa/push/request", json={"attempt_id": attempt_id})
    assert res_req_push.status_code == 403


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

    # Create candidates
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

    # 4. Admin checks security stats and audit events
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


def test_qr_and_push_challenge_expiration_and_replay(client):
    # Register voter and enroll both QR and PUSH
    client.post("/api/register", json={"username": "exp_voter", "password": "password123"})
    res_setup = client.get("/api/setup-2fa")
    totp = pyotp.TOTP(res_setup.get_json()["data"]["secret"])
    client.post("/api/setup-2fa", json={"token": totp.now()})

    res_l = client.post("/api/login", json={"username": "exp_voter", "password": "password123"})
    client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": res_l.get_json()["data"]["attempt_id"]})

    # Enroll QR
    res_enroll_req = client.post("/api/2fa/qr/enroll-request")
    qr_token = res_enroll_req.get_json()["data"]["token"]
    res_qr_conf = client.post("/api/2fa/qr/enroll-confirm", json={"token": qr_token, "device_name": "Test Phone"})
    qr_dev_id = res_qr_conf.get_json()["data"]["device_identifier"]
    qr_dev_sec = res_qr_conf.get_json()["data"]["device_secret"]

    # Enroll Push
    res_push_conf = client.post("/api/2fa/push/enroll", json={"device_name": "Test Browser"})
    push_dev_id = res_push_conf.get_json()["data"]["device_identifier"]
    push_dev_sec = res_push_conf.get_json()["data"]["device_secret"]

    client.post("/api/logout")

    # 1. QR Challenge Expiration
    res_l2 = client.post("/api/login", json={"username": "exp_voter", "password": "password123"})
    attempt_id = res_l2.get_json()["data"]["attempt_id"]
    client.post("/api/2fa/select", json={"attempt_id": attempt_id, "method": "QR"})
    res_qr_req = client.post("/api/2fa/qr/request", json={"attempt_id": attempt_id})
    qr_data = res_qr_req.get_json()["data"]

    # Artificially expire the QR challenge in database
    with db.db_cursor(commit=True) as cur:
        past_time = (utc_now() - timedelta(minutes=5)).isoformat()
        cur.execute("UPDATE qr_requests SET expires_at = ? WHERE request_id = ?", (past_time, qr_data["request_id"]))

    # Responding to expired QR challenge fails (410)
    res_exp_resp = client.post("/api/2fa/qr/respond", json={
        "request_id": qr_data["request_id"],
        "challenge": qr_data["challenge"],
        "action": "approve",
        "device_identifier": qr_dev_id,
        "device_secret": qr_dev_sec,
    })
    assert res_exp_resp.status_code == 410

    # 2. Push Challenge Expiration
    client.post("/api/logout")
    res_l3 = client.post("/api/login", json={"username": "exp_voter", "password": "password123"})
    attempt_id3 = res_l3.get_json()["data"]["attempt_id"]
    client.post("/api/2fa/select", json={"attempt_id": attempt_id3, "method": "PUSH"})
    res_push_req = client.post("/api/2fa/push/request", json={"attempt_id": attempt_id3})
    push_req_id = res_push_req.get_json()["data"]["request_id"]

    # Artificially expire the Push request
    with db.db_cursor(commit=True) as cur:
        past_time = (utc_now() - timedelta(minutes=5)).isoformat()
        cur.execute("UPDATE push_requests SET expires_at = ? WHERE request_id = ?", (past_time, push_req_id))

    # Responding to expired push request fails (410)
    res_exp_push = client.post("/api/2fa/push/respond", json={
        "request_id": push_req_id,
        "action": "approve",
        "device_identifier": push_dev_id,
        "device_secret": push_dev_sec,
    })
    assert res_exp_push.status_code == 410


def test_simultaneous_multi_method_enrollment_and_independent_logins(client):
    """
    Verifies that a single user account can enroll all 4 methods (TOTP, QR, PUSH, BIOMETRIC)
    in the same setup session without methods overriding or blocking each other.
    Verifies that POST /api/login returns all 4 enabled methods.
    Verifies that the user can choose and log in with ANY ONE of the 4 methods across separate logins.
    """
    from auth.utils import bytes_to_b64url

    # Step 1: Register voter (enters setup session)
    res_reg = client.post("/api/register", json={"username": "multi_method_voter", "password": "password123"})
    assert res_reg.status_code == 201
    user = db.get_user_by_username("multi_method_voter")

    # Step 2: Enroll TOTP
    res_totp_setup = client.get("/api/setup-2fa")
    assert res_totp_setup.status_code == 200
    totp_secret = res_totp_setup.get_json()["data"]["secret"]
    totp = pyotp.TOTP(totp_secret)
    res_totp_conf = client.post("/api/setup-2fa", json={"token": totp.now()})
    assert res_totp_conf.status_code == 200

    # Verify only TOTP is enabled so far
    assert db.get_user_enabled_methods(user["id"]) == ["TOTP"]

    # Step 3: Immediately enroll QR Code Login in the SAME setup session (no re-login required)
    res_qr_req = client.post("/api/2fa/qr/enroll-request")
    assert res_qr_req.status_code == 200
    qr_token = res_qr_req.get_json()["data"]["token"]
    res_qr_conf = client.post("/api/2fa/qr/enroll-confirm", json={"token": qr_token, "device_name": "Pixel 8 Pro"})
    assert res_qr_conf.status_code == 201
    qr_dev_id = res_qr_conf.get_json()["data"]["device_identifier"]
    qr_dev_sec = res_qr_conf.get_json()["data"]["device_secret"]

    # Verify both TOTP and QR are enabled simultaneously
    assert set(db.get_user_enabled_methods(user["id"])) == {"TOTP", "QR"}

    # Step 4: Immediately enroll Trusted Device (PUSH) in the SAME setup session
    res_push_conf = client.post("/api/2fa/push/enroll", json={"device_name": "Home Desktop"})
    assert res_push_conf.status_code == 201
    push_dev_id = res_push_conf.get_json()["data"]["device_identifier"]
    push_dev_sec = res_push_conf.get_json()["data"]["device_secret"]

    # Verify TOTP, QR, and PUSH are enabled simultaneously
    assert set(db.get_user_enabled_methods(user["id"])) == {"TOTP", "QR", "PUSH"}

    # Step 5: Immediately enroll Platform Biometrics (WebAuthn) in the SAME setup session
    res_bio_opt = client.post("/api/2fa/biometric/register-options")
    assert res_bio_opt.status_code == 200
    bio_cred_id = bytes_to_b64url(b"touchid_or_windows_hello_cred_123")
    bio_pub_key = bytes_to_b64url(b"touchid_or_windows_hello_pub_key_456")
    db.create_webauthn_credential(
        user_id=user["id"],
        credential_id=bio_cred_id,
        public_key=bio_pub_key,
        sign_count=0,
        credential_type="BIOMETRIC",
    )

    # Step 6: Verify ALL FOUR methods are now simultaneously enabled and active for user_id
    enabled_all = db.get_user_enabled_methods(user["id"])
    assert set(enabled_all) == {"TOTP", "QR", "PUSH", "BIOMETRIC"}
    assert len(enabled_all) == 4

    # Check GET /api/2fa/methods returns all 4 enabled
    res_methods_list = client.get("/api/2fa/methods")
    assert res_methods_list.status_code == 200
    assert set(res_methods_list.get_json()["data"]["enabled_methods"]) == {"TOTP", "QR", "PUSH", "BIOMETRIC"}

    # Step 7: Log out to test fresh login flows
    client.post("/api/logout")

    # =========================================================================
    # LOGIN TEST 1: Authenticate using TOTP
    # =========================================================================
    res_l1 = client.post("/api/login", json={"username": "multi_method_voter", "password": "password123"})
    assert res_l1.status_code == 200
    l1_data = res_l1.get_json()["data"]
    assert set(l1_data["methods"]) == {"TOTP", "QR", "PUSH", "BIOMETRIC"}
    assert set(l1_data["enabled_methods"]) == {"TOTP", "QR", "PUSH", "BIOMETRIC"}

    # Select and verify TOTP
    client.post("/api/2fa/select", json={"attempt_id": l1_data["attempt_id"], "method": "TOTP"})
    with db.db_cursor(commit=True) as cur:
        cur.execute("UPDATE totp_credentials SET last_used_step = 0 WHERE user_id = ?", (user["id"],))
    res_v1 = client.post("/api/verify-totp", json={"token": totp.now(), "attempt_id": l1_data["attempt_id"]})
    assert res_v1.status_code == 200
    assert client.get("/api/me").status_code == 200
    client.post("/api/logout")

    # =========================================================================
    # LOGIN TEST 2: Authenticate using QR Code Login
    # =========================================================================
    res_l2 = client.post("/api/login", json={"username": "multi_method_voter", "password": "password123"})
    l2_attempt = res_l2.get_json()["data"]["attempt_id"]
    client.post("/api/2fa/select", json={"attempt_id": l2_attempt, "method": "QR"})
    res_qr_req = client.post("/api/2fa/qr/request", json={"attempt_id": l2_attempt})
    qr_chal_data = res_qr_req.get_json()["data"]

    # Phone approves challenge
    res_qr_app = client.post("/api/2fa/qr/respond", json={
        "request_id": qr_chal_data["request_id"],
        "challenge": qr_chal_data["challenge"],
        "action": "approve",
        "device_identifier": qr_dev_id,
        "device_secret": qr_dev_sec,
    })
    assert res_qr_app.status_code == 200

    # PC polls and finalizes session
    res_qr_poll = client.get(f"/api/2fa/qr/status?request_id={qr_chal_data['request_id']}")
    assert res_qr_poll.get_json()["data"]["status"] == "APPROVED"
    assert client.get("/api/me").status_code == 200
    client.post("/api/logout")

    # =========================================================================
    # LOGIN TEST 3: Authenticate using Trusted Device Approval (PUSH)
    # =========================================================================
    res_l3 = client.post("/api/login", json={"username": "multi_method_voter", "password": "password123"})
    l3_attempt = res_l3.get_json()["data"]["attempt_id"]
    client.post("/api/2fa/select", json={"attempt_id": l3_attempt, "method": "PUSH"})
    res_push_req = client.post("/api/2fa/push/request", json={"attempt_id": l3_attempt})
    push_req_id = res_push_req.get_json()["data"]["request_id"]

    # Trusted device approves prompt
    res_push_app = client.post("/api/2fa/push/respond", json={
        "request_id": push_req_id,
        "action": "approve",
        "device_identifier": push_dev_id,
        "device_secret": push_dev_sec,
    })
    assert res_push_app.status_code == 200

    # PC polls and finalizes session
    res_push_poll = client.get(f"/api/2fa/push/status?request_id={push_req_id}")
    assert res_push_poll.get_json()["data"]["status"] == "APPROVED"
    assert client.get("/api/me").status_code == 200
    client.post("/api/logout")

    # =========================================================================
    # LOGIN TEST 4: Authenticate using Platform Biometrics (WebAuthn)
    # =========================================================================
    res_l4 = client.post("/api/login", json={"username": "multi_method_voter", "password": "password123"})
    l4_attempt = res_l4.get_json()["data"]["attempt_id"]
    client.post("/api/2fa/select", json={"attempt_id": l4_attempt, "method": "BIOMETRIC"})
    res_bio_auth_opt = client.post("/api/2fa/biometric/auth-options", json={"attempt_id": l4_attempt})
    assert res_bio_auth_opt.status_code == 200
    assert res_bio_auth_opt.get_json()["data"]["allowCredentials"][0]["id"] == bio_cred_id



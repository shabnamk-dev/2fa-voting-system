import os
from getpass import getpass
import pyotp
from werkzeug.security import generate_password_hash
import database as db

ISSUER_NAME = "SecureVotingSystem"


def main():
    print("=== Secure Voting System — Admin Setup ===")
    db.init_db()

    username = os.getenv("ADMIN_USERNAME")
    if username:
        username = username.strip()
    else:
        username = input("Admin Username: ").strip()

    if not username:
        print("Error: username cannot be empty.")
        return

    existing_user = db.get_user_by_username(username)
    if existing_user:
        print(f"Notice: user '{username}' already exists (Role: {existing_user['role']}).")
        enabled_methods = db.get_user_enabled_methods(existing_user["id"])
        print(f"Enabled 2FA methods: {enabled_methods}")
        return

    password = os.getenv("ADMIN_PASSWORD")
    if password is None:
        password = getpass("Admin Password: ")
        confirm_password = getpass("Confirm password: ")

        if password != confirm_password:
            print("Error: passwords do not match.")
            return

    if len(password) < 8:
        print("Error: password must be at least 8 characters.")
        return

    password_hash = generate_password_hash(password)
    admin_id = db.create_user(
        username=username,
        password_hash=password_hash,
        role="admin",
    )

    # Automatically configure and enroll TOTP for the administrator
    secret = pyotp.random_base32()
    db.create_or_update_totp_credential(admin_id, secret)
    db.enable_auth_method(admin_id, "TOTP")

    uri = pyotp.TOTP(secret).provisioning_uri(
        name=username,
        issuer_name=ISSUER_NAME,
    )

    print()
    print("Administrator account created successfully.")
    print(f"Admin ID: {admin_id}")
    print(f"Username: {username}")
    print(f"TOTP Secret: {secret}")
    print(f"TOTP Provisioning URI: {uri}")
    print("Please import this secret into your authenticator app (Google Authenticator, Authy, etc.).")


if __name__ == "__main__":
    main()

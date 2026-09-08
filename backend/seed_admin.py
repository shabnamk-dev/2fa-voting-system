from getpass import getpass
from werkzeug.security import generate_password_hash
import os
import database as db


def main():
    print("=== Secure Voting System — Admin Setup ===")

    username = os.getenv("ADMIN_USERNAME")

    if username:
        username = username.strip()
    else:
        username = input("Admin Username: ").strip()


    if not username:
        print("Error: username cannot be empty.")
        return

    if db.get_user_by_username(username):
        print(f"Error: user '{username}' already exists.")
        return

    password = os.getenv("ADMIN_PASSWORD")
    if password is None:
        password = getpass("Admin Password")
        confirm_password = getpass("Confirm password: ")

        if password !=confirm_password:
            print("Error: passwords do not match.")
            return

    if len(password) < 8:
        print("Error: password must be at least 8 characters.")
        return

    password_hash = generate_password_hash(password)

    admin_id = db.create_user(
        username,
        password_hash,
        role="admin"
    )

    print()
    print("Administrator account created successfully.")
    print(f"Admin ID: {admin_id}")
    print(f"Username: {username}")


if __name__ == "__main__":
    main()

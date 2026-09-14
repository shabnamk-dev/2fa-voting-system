# 2FA Voting System

A secure online voting platform (Flask + React) that verifies voters and admins with **two-factor authentication** before they can access the system or cast a ballot. Users can choose from **4 different second-factor methods** — TOTP, QR Code Challenge, Trusted Device, or Biometric (WebAuthn/Passkey) — rather than being locked into a single flow.

## How to run

### Backend

```
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 seed_admin.py             # create your first admin account
python3 app.py                    # starts on http://localhost:5000
```

The SQLite file `voting_system.db` is created automatically on first run. If you already have an existing `voting_system.db` from before, don't delete it — `database.py` safely migrates the old `votes` table shape to the new one (adds receipt codes + abstain support) and preserves your data.

### Frontend

Drop the contents of `frontend/src` into your existing `src/` folder, overwriting the files listed below. Then, as usual:

```
npm install
npm run dev
```

Make sure `axios` and `react-router-dom` are in your `package.json` — the backend expects requests from `http://localhost:5173` (Vite's default) or wherever your dev server runs; if you use a different port, update Flask's CORS origin in `app.py`.

## Features

- **Choice of 4 second-factor authentication methods** — voters and admins aren't locked into one 2FA flow; at login, users can verify with whichever method they've enrolled in:
  - **TOTP** — enter the time-based code from an authenticator app
  - **QR Code Challenge** — scan a QR code, open the challenge link it generates, and approve or deny the login from there
  - **Trusted Device** — enroll a device as trusted; future logins send an accept/deny prompt to that device instead of asking for a code
  - **Biometric (WebAuthn/Passkey)** — verify with your device's biometrics via WebAuthn
- Session-cookie authentication with no client-only session fallback
- Vote casting with abstain support and unique per-vote receipt codes
- Admin dashboard: candidate management, election open/close control, and a Login Activity panel (successful/failed logins, failed 2FA attempts, locked accounts, unauthorized admin attempts)
- Voter dashboard showing live election status and past vote receipt

## Team

| <img src="https://github.com/shabnamk-dev.png" width="100" /> | <img src="https://github.com/ethancancode.png" width="100" /> | <img src="https://github.com/swarnaldeshmukh.png" width="100" /> |
|:---:|:---:|:---:|
| [**Shabnam**](https://github.com/shabnamk-dev) | [**Ethan**](https://github.com/ethancancode) | [**Swarnal**](https://github.com/swarnaldeshmukh) |

# 2FA Voting System

A secure online voting platform (Flask + React) that uses **Time-based One-Time
Password (TOTP)** two-factor authentication to verify voters and admins before
they can access the system or cast a ballot.

## Reference & Acknowledgement

This project's authentication design was inspired by the security goals and
system architecture described in:

> S. P. Dhome, A. N. Gade, and O. S. Thakur, "Enhancing the Security of Online
> Voting Systems Using OTP-Based Multi-Factor Authentication Mechanisms,"
> *International Journal of Computer Sciences and Engineering*, vol. 14, no. 4,
> pp. 70–75, Apr. 2026. DOI: [10.26438/ijcse.v14i4.7351](https://doi.org/10.26438/ijcse.v14i4.7351)

The paper proposes a layered OTP-based Online Voting System (User
Interface → Authentication → Application → Security → Database →
Monitoring/Logging) and reports strong results for OTP as a second factor:
a 98.6% authentication success rate, ~3.2s average verification time, and
89% positive user feedback, while also flagging real risks — SIM-swap
attacks, phishing, and network-delivery delays — as limitations of
SMS/email-delivered OTPs. It recommends combining OTP with layered security
measures such as encryption, monitoring, and (optionally) biometrics.

**What we adopted from the paper:**
- The core idea of layering a second authentication factor on top of
  credential login, specifically for the login step *and* before a ballot
  can be cast.
- The paper's emphasis on encrypted communication, secure data storage, and
  logging/monitoring of authentication activity as essential companions to
  OTP — not just the OTP step in isolation.
- Tracking authentication outcomes (successes, failures) as a first-class
  concern, not an afterthought.

**What we did differently, and why:**
- **TOTP instead of SMS/email OTP.** The paper explicitly names SIM-swap
  attacks, phishing, and OTP-delivery delay over mobile networks as
  weaknesses of their approach. We use TOTP (RFC 6238 — the algorithm
  behind Google Authenticator/Authy), where the code is generated locally
  on the user's device from a shared secret and never travels over SMS or
  email. This removes the delivery-delay and SIM-swap risks the paper
  identifies, at the cost of requiring users to set up an authenticator
  app during registration.
- **Session-based auth, not just login-time verification.** Our backend
  treats "logged in" as a live Flask session validated against
  `GET /api/me`, with no client-side session fallback, closing the kind of
  gap that would let a device "remember" a login without live server
  verification.
- **Per-vote receipts.** Every vote (including an explicit abstain option)
  gets a unique receipt code, and voters can retrieve their real recorded
  vote after the fact via `GET /api/my-vote`. The paper's model focuses on
  authentication integrity; it doesn't describe a voter-facing
  verifiability mechanism, so this is an addition on our end.
- **Admin-facing security monitoring.** In line with the paper's
  "Monitoring and Logging Layer" recommendation, our admin dashboard
  surfaces successful/failed logins, failed 2FA attempts, locked accounts,
  and unauthorized admin access attempts, rather than just logging them
  silently.
- **Not yet implemented from the paper's recommendations:** AI-based
  anomaly/fraud detection, blockchain-based vote storage, and biometric
  authentication are all mentioned in the paper's "Future Scope" as
  directions beyond OTP — none of these are in this project, and they're
  reasonable candidates for future work rather than gaps in the current
  scope.

In short: we followed the paper's core principle (multi-factor
authentication as the backbone of voter verification) but chose a
device-generated TOTP factor over a network-delivered OTP factor,
specifically to avoid the delivery/SIM-swap weaknesses the paper itself
identifies.

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

The SQLite file `voting_system.db` is created automatically on first run.
If you already have an existing `voting_system.db` from before, don't
delete it — `database.py` safely migrates the old `votes` table shape to
the new one (adds receipt codes + abstain support) and preserves your data.

### Frontend

Drop the contents of `frontend/src` into your existing `src/` folder,
overwriting the files listed below. Then, as usual:

```
npm install
npm run dev
```

Make sure `axios` and `react-router-dom` are in your `package.json` — the
backend expects requests from `http://localhost:5173` (Vite's default) or
wherever your dev server runs; if you use a different port, update Flask's
CORS origin in `app.py`.

## Features

- TOTP-based two-factor authentication for both voters and admins
- Session-cookie authentication with no client-only session fallback
- Vote casting with abstain support and unique per-vote receipt codes
- Admin dashboard: candidate management, election open/close control,
  and a Login Activity panel (successful/failed logins, failed 2FA
  attempts, locked accounts, unauthorized admin attempts)
- Voter dashboard showing live election status and past vote receipt

Team
<table> <tr> <td align="center"> <a href="https://github.com/shabnamk-dev"> <img src="https://github.com/shabnamk-dev.png" width="80px" style="border-radius:50%"><br> <sub><b>Shabnam</b></sub> </a> </td> <td align="center"> <a href="https://github.com/ethancancode"> <img src="https://github.com/ethancancode.png" width="80px" style="border-radius:50%"><br> <sub><b>Ethan</b></sub> </a> </td> <td align="center"> <a href="https://github.com/swarnaldeshmukh"> <img src="https://github.com/swarnaldeshmukh.png" width="80px" style="border-radius:50%"><br> <sub><b>Swarnal</b></sub> </a> </td> </tr> </table>

## License / Citation

If you build on this project academically, please also cite the reference
paper above alongside this repository.

## How to run

### Backend

cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 seed_admin.py             # create your first admin account
python3 app.py                    # starts on http://localhost:5000


### Frontend

Drop the contents of `frontend/src` into your existing `src/` folder,
overwriting the files listed below. Then, as usual:


npm install
npm run dev


Make sure `axios` and `react-router-dom` are in your `package.json` — the
backend expects requests from `http://localhost:5173` (Vite's default) or
wherever your dev server runs; if you use a different port, update Flask's
CORS origin in `app.py`.

## What changed

### Backend (`app.py`, `database.py`)

- **Added `POST /api/vote`** — this route didn't exist before, so casting a
  ballot was never actually possible end-to-end, despite the database logic
  for it already being written.
- **Added `GET /api/my-vote`** — lets the receipt page show your *real*
  recorded vote, including after a page refresh, instead of a fabricated
  placeholder.
- **Added `GET /api/election` and `POST /api/admin/election`** — voters can
  see whether voting is open; admins can open/close it.
- **Added `GET /api/admin/security-stats` and `GET /api/admin/security-events`**
  — powers the new Login Activity panel on the admin dashboard.
- **Votes now support abstain** (`candidate_id: null`) and every vote —
  including abstains — gets a unique receipt code. The `votes` table
  migrates automatically and safely if you have an older copy of the
  database.
- **`/api/setup-2fa` now returns the real TOTP secret** for the manual-entry
  fallback (the frontend was previously showing a hardcoded fake key that
  had nothing to do with your actual account).
- Added `Flask-Cors` to `requirements.txt` — it was imported in `app.py` but
  never listed, which would have failed on a clean install.
- A new `elections` row is auto-seeded as `OPEN` on first run so voting
  works immediately without any extra admin setup step.

### Frontend

- **Removed `DevBar.jsx` and `mockApi.js` entirely.** DevBar let anyone
  fake-login as a student or admin and land directly on a protected
  dashboard without any real authentication — this was a direct
  contradiction of "dashboards should only be visible after real auth."
  `App.jsx` no longer has any client-only session fallback either
  (`sessionStorage`/`localStorage`); the *only* source of truth for "is this
  user logged in" is a live `GET /api/me` call against the Flask session
  cookie.
- **Fixed a real bug in `api.js`**: `updateCandidate`/`deleteCandidate` were
  building URLs with `'/api/candidates/${id}'` — single quotes, not
  backticks — so `${id}` was being sent literally instead of interpolated.
  Every candidate update/delete call was silently broken.
- **`AdminDashboard.jsx` — full rewrite.** The old version mixed real
  `api.js` calls with calls to `mockApi` and an undefined `addCandidate`
  function (it would have crashed), and was built around fields the
  backend doesn't have (`affiliation`, `platform`, `status`, `votes`)
  instead of the real schema (`name`, `party`, `description`, `position`).
  Now: full create/update/delete against the real API, an Open/Close
  voting toggle, and a Login Activity section (stat tiles for successful
  logins, failed logins, failed 2FA codes, locked accounts, unauthorized
  admin attempts, plus a recent-events table).
- **`Results.jsx` — full rewrite.** No longer touches `mockApi` or pads
  vote counts with a fake `+287`. Abstain votes are now real, counted data
  from the database.
- **`VoteConfirm.jsx` / `VoteSubmitted.jsx` — full rewrite.** Voting now
  calls the real `/api/vote` endpoint and the receipt shown afterward is
  the actual database record (receipt code, timestamp, selected candidate
  or "Abstained"), not a client-generated random hash.
- **`VoterDashboard.jsx` — full rewrite.** Dropped the two fabricated
  election/referendum cards that weren't backed by any real data. Now
  shows the one real election, its live open/closed status, and disables
  "Cast Ballot" when voting isn't open.
- **`TwoFactorSetup.jsx`** now displays your actual TOTP secret (from the
  backend) instead of a hardcoded fake manual-entry key.
- **`OTPVerify.jsx`** no longer claims a code was "sent to your email" —
  this is authenticator-app-based TOTP, not email OTP, so the copy and the
  fake "Resend" button (replaced with "Clear & Try Again") now match how
  the system actually works.
- **`Register.jsx`** no longer collects a University Email the backend
  never used, and adds a confirm-password check.
- Fixed a couple of lowercase `maxlength` JSX attributes (should be
  `maxLength`) that React was silently ignoring.



# 2FA Voting System — Frontend

A React-based frontend for a secure student council election portal with two-factor authentication.

## Tech Stack

- **React** (Vite)
- **React Router** (hash-based routing)
- **Tailwind CSS v3**
- **Mock API** (localStorage-based)

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

## Pages

| Route | Description |
|---|---|
| `/login` | Student / Admin login |
| `/register` | New student registration |
| `/2fa-setup` | TOTP authenticator setup |
| `/otp-verify` | OTP code verification |
| `/dashboard` | Voter dashboard (student) |
| `/ballot` | Candidate selection |
| `/confirm-vote` | Vote confirmation |
| `/receipt` | Vote submitted receipt |
| `/admin` | Admin — candidate management |
| `/results` | Election results |

## Demo Accounts

| Role | Student ID | Password |
|---|---|---|
| Student | `STU001` | `password123` |
| Admin | `ADMIN001` | `admin123` |

> Use the yellow **DEV** bar at the top to quickly switch between pages and mock sessions during development.

## Project Structure

```
src/
├── components/      # Shared UI (Navbar, DevBar)
├── pages/
│   ├── auth/        # Login, Register, 2FA, OTP
│   ├── voter/       # Dashboard, Ballot, Confirm, Receipt
│   └── admin/       # Admin Dashboard, Results
└── services/
    └── mockApi.js   # Mock database (localStorage)
```

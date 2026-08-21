import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000",
  withCredentials: true, // Flask session cookies
  headers: { "Content-Type": "application/json" },
});

// POST /api/register
export const register = (username, password) =>
  api.post("/api/register", { username, password });

// POST /api/login → returns { next: "setup-2fa" | "verify-totp" }
export const login = (username, password) =>
  api.post("/api/login", { username, password });

// GET /api/setup-2fa → returns { qr_code, username }
export const getSetup2FA = () => api.get("/api/setup-2fa");

// POST /api/setup-2fa → confirm TOTP during setup
export const confirmSetup2FA = (token) =>
  api.post("/api/setup-2fa", { token });

// POST /api/verify-totp → completes login, sets session
export const verifyTOTP = (token) =>
  api.post("/api/verify-totp", { token });

// GET /api/me → returns current logged-in user
export const getMe = () => api.get("/api/me");

// POST /api/logout
export const logout = () => api.post("/api/logout");

export default api;

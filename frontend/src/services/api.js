import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000",
  withCredentials: true, // Flask session cookies
  headers: { "Content-Type": "application/json" },
});

// ==========================================
// 1. Auth & Account Lifecycle
// ==========================================

// POST /api/register - Create new voter account
export const register = (username, password) =>
  api.post("/api/register", { username, password });

// POST /api/login - Step 1: Username + Password authentication
export const login = (username, password) =>
  api.post("/api/login", { username, password });

// POST /api/2fa/select - Select preferred 2FA method
export const select2FAMethod = (attempt_id, method) =>
  api.post("/api/2fa/select", { attempt_id, method });

// GET /api/2fa/methods - List user's enrolled & available 2FA methods
export const listUserMethods = () =>
  api.get("/api/2fa/methods");

// DELETE /api/2fa/methods/:method_type - Disable / remove a 2FA method
export const disableUserMethod = (method_type) =>
  api.delete(`/api/2fa/methods/${method_type}`);

// GET /api/me - Current user session
export const getMe = () => api.get("/api/me");

// POST /api/logout - Log out
export const logout = () => api.post("/api/logout");


// ==========================================
// 2. TOTP (Authenticator App)
// ==========================================

// GET /api/2fa/totp/setup (or /api/setup-2fa)
export const getSetup2FA = () => api.get("/api/2fa/totp/setup");

// POST /api/2fa/totp/enable (or /api/setup-2fa)
export const confirmSetup2FA = (token) =>
  api.post("/api/2fa/totp/enable", { token });

// POST /api/2fa/verify/totp (or /api/verify-totp)
export const verifyTOTP = (token, attempt_id = null) =>
  api.post("/api/2fa/verify/totp", { token, attempt_id });


// ==========================================
// 3. Push Authentication
// ==========================================

// POST /api/2fa/push/enroll - Register a trusted push device
export const enrollPushDevice = (device_name = "Trusted Browser Device", device_identifier = null) =>
  api.post("/api/2fa/push/enroll", { device_name, device_identifier });

// POST /api/2fa/push/request - Request push challenge
export const createPushRequest = (attempt_id = null) =>
  api.post("/api/2fa/push/request", { attempt_id });

// GET /api/2fa/push/status?request_id=... - Check push approval status
export const getPushStatus = (request_id) =>
  api.get("/api/2fa/push/status", { params: { request_id } });

// GET /api/2fa/push/pending - Get pending requests for device
export const getPendingPushRequests = (device_identifier = null) =>
  api.get("/api/2fa/push/pending", { params: { device_identifier } });

// POST /api/2fa/push/respond - Approve or Deny push challenge
export const respondToPush = (request_id, action = "approve", device_identifier = null) =>
  api.post("/api/2fa/push/respond", { request_id, action, device_identifier });


// ==========================================
// 4. QR Code Authentication
// ==========================================

// POST /api/2fa/qr/enroll - Enable QR challenge method
export const enrollQR = () =>
  api.post("/api/2fa/qr/enroll", {});

// POST /api/2fa/qr/request - Request dynamic QR challenge
export const createQRChallenge = (attempt_id = null) =>
  api.post("/api/2fa/qr/request", { attempt_id });

// GET /api/2fa/qr/status?request_id=... - Check QR scan/approval status
export const getQRStatus = (request_id) =>
  api.get("/api/2fa/qr/status", { params: { request_id } });

// POST /api/2fa/qr/respond - Mobile device scan & approve/deny
export const respondToQR = (request_id, challenge = null, action = "approve", device_identifier = null) =>
  api.post("/api/2fa/qr/respond", { request_id, challenge, action, device_identifier });


// ==========================================
// 5. Biometric Authentication (Platform WebAuthn)
// ==========================================

// POST /api/2fa/biometric/register-options
export const getBiometricRegisterOptions = () =>
  api.post("/api/2fa/biometric/register-options", {});

// POST /api/2fa/biometric/register-verify
export const verifyBiometricRegistration = (credential) =>
  api.post("/api/2fa/biometric/register-verify", { credential });

// POST /api/2fa/biometric/auth-options
export const getBiometricAuthOptions = (attempt_id = null) =>
  api.post("/api/2fa/biometric/auth-options", { attempt_id });

// POST /api/2fa/biometric/auth-verify
export const verifyBiometricAuth = (credential, attempt_id = null) =>
  api.post("/api/2fa/biometric/auth-verify", { credential, attempt_id });


// ==========================================
// 6. Security Keys (Cross-Platform FIDO2 / YubiKey)
// ==========================================

// POST /api/2fa/security-key/register-options
export const getSecurityKeyRegisterOptions = () =>
  api.post("/api/2fa/security-key/register-options", {});

// POST /api/2fa/security-key/register-verify
export const verifySecurityKeyRegistration = (credential) =>
  api.post("/api/2fa/security-key/register-verify", { credential });

// POST /api/2fa/security-key/auth-options
export const getSecurityKeyAuthOptions = (attempt_id = null) =>
  api.post("/api/2fa/security-key/auth-options", { attempt_id });

// POST /api/2fa/security-key/auth-verify
export const verifySecurityKeyAuth = (credential, attempt_id = null) =>
  api.post("/api/2fa/security-key/auth-verify", { credential, attempt_id });


// ==========================================
// Candidates & Voting
// ==========================================

// GET /api/candidates
export const getCandidates = () => api.get("/api/candidates");

// POST /api/candidates
export const createCandidate = (name, party, description, image_url = null, position = "President") =>
  api.post("/api/candidates", {
    name,
    party,
    description,
    image_url,
    position,
  });

// PUT /api/candidates/:id
export const updateCandidate = (id, name, party, description, image_url = null, position = "President") =>
  api.put(`/api/candidates/${id}`, {
    name,
    party,
    description,
    image_url,
    position,
  });

// DELETE /api/candidates/:id
export const deleteCandidate = (id) =>
  api.delete(`/api/candidates/${id}`);

// POST /api/vote
export const castVote = (candidateId) =>
  api.post("/api/vote", { candidate_id: candidateId ?? null });

// GET /api/my-vote
export const getMyVote = () => api.get("/api/my-vote");

// GET /api/results
export const getResult = () => api.get("/api/results");

// GET /api/election
export const getElection = () => api.get("/api/election");


// ==========================================
// Admin
// ==========================================

// GET /api/admin/security-stats
export const getSecurityStats = () => api.get("/api/admin/security-stats");

// GET /api/admin/security-events
export const getSecurityEvents = (limit = 50) =>
  api.get("/api/admin/security-events", { params: { limit } });

// POST /api/admin/election
export const updateElectionStatus = (status) =>
  api.post("/api/admin/election", { status });

export default api;

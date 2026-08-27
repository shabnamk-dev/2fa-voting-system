import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000",
  withCredentials: true, // Flask session cookies
  headers: { "Content-Type": "application/json" },
});


// Auth
// POST /api/register
export const register = (username, password) =>
  api.post("/api/register", { username, password });

// POST /api/login
export const login = (username, password) =>
  api.post("/api/login", { username, password });

// GET /api/setup-2fa
export const getSetup2FA = () => api.get("/api/setup-2fa");

// POST /api/setup-2fa 
export const confirmSetup2FA = (token) =>
  api.post("/api/setup-2fa", { token });

// POST /api/verify-totp
export const verifyTOTP = (token) =>
  api.post("/api/verify-totp", { token });

// GET /api/me
export const getMe = () => api.get("/api/me");

// POST /api/logout
export const logout = () => api.post("/api/logout");

// Candidates

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


// Voting
// POST /api/vote
export const castVote = (candidateId) =>
  api.post("/api/vote", { candidate_id: candidateId ?? null });

// GET /api/my-vote
export const getMyVote = () => api.get("/api/my-vote");

// GET /api/results
export const getResult = () => api.get("/api/results");

// GET /api/election
export const getElection = () => api.get("/api/election");

// Admin
// GET /api/admin/security-stats
export const getSecurityStats = () => api.get("/api/admin/security-stats");

// GET /api/admin/security-events
export const getSecurityEvents = (limit = 50) =>
  api.get("/api/admin/security-events", { params: { limit } });

// POST /api/admin/election
export const updateElectionStatus = (status) =>
  api.post("/api/admin/election", { status });

export default api;

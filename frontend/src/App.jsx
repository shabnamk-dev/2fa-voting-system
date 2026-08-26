import React, { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";

// Layout Components
import Navbar from "./components/layout/Navbar";

// Auth Pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import TwoFactorSetup from "./pages/auth/TwoFactorSetup";
import OTPVerify from "./pages/auth/OTPVerify";

// Voter Pages
import VoterDashboard from "./pages/voter/VoterDashboard";
import Candidates from "./pages/voter/Candidates";
import VoteConfirm from "./pages/voter/VoteConfirm";
import VoteSubmitted from "./pages/voter/VoteSubmitted";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import Results from "./pages/admin/Results";

import { getMe, logout as apiLogout } from "./services/api";

function toClientUser(meData) {
  return {
    studentId: meData.username,
    username: meData.username,
    role: meData.role === "voter" ? "student" : meData.role,
    hasVoted: !!meData.has_voted,
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [receipt, setReceipt] = useState(null);
  // Until this resolves we don't know yet whether there's a valid backend
  // session, so we hold off rendering any route guards to avoid a flash of
  // the login page (or worse, a flash of a protected page).
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await getMe();
        const meData = res.data?.data;
        if (meData) {
          setUser(toClientUser(meData));
        }
      } catch (err) {
        // No valid backend session — user stays logged out. We intentionally
        // do NOT fall back to any client-only/local session store: dashboards
        // must only be reachable with a real, server-verified session.
        setUser(null);
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch (err) {
      // Ignore logout API failure — we still clear local state below.
    }
    setUser(null);
    setSelectedCandidate(null);
    setReceipt(null);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text-primary">
        <p className="font-body-md text-body-md text-text-secondary">Loading session…</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-background text-text-primary">
        {/* Header/Nav Bar */}
        <Navbar user={user} onLogout={handleLogout} />

        <div className="flex flex-1 flex-col">
          <Routes>
            {/* Public Routes */}
            <Route
              path="/login"
              element={
                !user ? <Login onLoginSuccess={handleLoginSuccess} /> : <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />
              }
            />
            <Route
              path="/register"
              element={
                !user ? <Register onLoginSuccess={handleLoginSuccess} /> : <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />
              }
            />

            {/* Auth Setup / Verification Routes (backend session-gated) */}
            <Route
              path="/2fa-setup"
              element={
                !user ? <TwoFactorSetup /> : <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />
              }
            />
            <Route
              path="/otp-verify"
              element={
                !user ? <OTPVerify onOtpSuccess={handleLoginSuccess} /> : <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />
              }
            />

            {/* Voter Protected Routes */}
            <Route
              path="/dashboard"
              element={
                user && user.role === "student"
                  ? <VoterDashboard user={user} />
                  : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/ballot"
              element={
                user && user.role === "student" && !user.hasVoted
                  ? <Candidates selectedCandidate={selectedCandidate} onSelectCandidate={setSelectedCandidate} />
                  : <Navigate to={user ? "/dashboard" : "/login"} replace />
              }
            />
            <Route
              path="/confirm-vote"
              element={
                user && user.role === "student" && !user.hasVoted
                  ? (
                    <VoteConfirm
                      user={user}
                      selectedCandidate={selectedCandidate}
                      onVoteCompleted={(r) => { setReceipt(r); setUser({ ...user, hasVoted: true }); }}
                    />
                  )
                  : <Navigate to={user ? "/dashboard" : "/login"} replace />
              }
            />
            <Route
              path="/receipt"
              element={
                user && user.role === "student"
                  ? <VoteSubmitted receipt={receipt} onResetBallot={() => { setSelectedCandidate(null); setReceipt(null); }} />
                  : <Navigate to="/login" replace />
              }
            />

            {/* General Protected Results Route */}
            <Route
              path="/results"
              element={
                user
                  ? <Results />
                  : <Navigate to="/login" replace />
              }
            />

            {/* Admin Protected Routes */}
            <Route
              path="/admin"
              element={
                user && user.role === "admin"
                  ? <AdminDashboard />
                  : <Navigate to="/login" replace />
              }
            />

            {/* Default Redirect */}
            <Route
              path="*"
              element={<Navigate to={user ? (user.role === "admin" ? "/admin" : "/dashboard") : "/login"} replace />}
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

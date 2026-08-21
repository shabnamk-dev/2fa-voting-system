import React, { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";

// Layout & Common Components
import Navbar from "./components/layout/Navbar";

import DevBar from "./components/common/DevBar";

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


// API / Mock Data Init
import { initializeMockDatabase } from "./services/mockApi";

export default function App() {
  const [user, setUser] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    initializeMockDatabase();
    
    // Check if session exists in sessionStorage
    const storedUser = sessionStorage.getItem("avp_user_session");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    sessionStorage.setItem("avp_user_session", JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedCandidate(null);
    setReceipt(null);
    sessionStorage.removeItem("avp_user_session");
  };

  const handleResetDev = () => {
    setUser(null);
    setSelectedCandidate(null);
    setReceipt(null);
    sessionStorage.removeItem("avp_user_session");
  };

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-background text-text-primary">
        {/* Developer Utility Bar */}
        <DevBar user={user} setUser={setUser} onReset={handleResetDev} />

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
                  !user ? <Register onLoginSuccess={handleLoginSuccess} /> : <Navigate to="/2fa-setup" replace />
                } 
              />

              {/* Auth Setup / Verification Routes */}
              <Route 
                path="/2fa-setup" 
                element={<TwoFactorSetup user={user} on2faSuccess={handleLoginSuccess} />} 
              />
              <Route 
                path="/otp-verify" 
                element={<OTPVerify user={user} onOtpSuccess={() => {}} />} 
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
                  user && user.role === "student" 
                    ? <Candidates selectedCandidate={selectedCandidate} onSelectCandidate={setSelectedCandidate} /> 
                    : <Navigate to="/login" replace />
                } 
              />
              <Route 
                path="/confirm-vote" 
                element={
                  user && user.role === "student" 
                    ? <VoteConfirm user={user} selectedCandidate={selectedCandidate} onVoteCompleted={(r) => { setReceipt(r); setUser({...user, hasVoted: true}); }} /> 
                    : <Navigate to="/login" replace />
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

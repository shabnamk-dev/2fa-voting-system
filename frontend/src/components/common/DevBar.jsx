import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function DevBar({ user, setUser, onReset }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleRoleToggle = (role) => {
    if (role === "student-notvoted") {
      setUser({ studentId: "90210", email: "student@university.edu", role: "student", is2faSetup: true, hasVoted: false });
      navigate("/dashboard");
    } else if (role === "student-voted") {
      setUser({ studentId: "90210", email: "student@university.edu", role: "student", is2faSetup: true, hasVoted: true });
      navigate("/dashboard");
    } else if (role === "admin") {
      setUser({ studentId: "admin", email: "admin@university.edu", role: "admin", is2faSetup: true });
      navigate("/admin");
    } else {
      setUser(null);
      navigate("/login");
    }
  };

  const handleRedirect = (path) => {
    navigate(path);
  };

  const pages = [
    { name: "Login", path: "/login" },
    { name: "Register", path: "/register" },
    { name: "2FA Setup", path: "/2fa-setup" },
    { name: "OTP Verify", path: "/otp-verify" },
    { name: "Voter Dashboard", path: "/dashboard" },
    { name: "Ballot Selection", path: "/ballot" },
    { name: "Confirm Vote", path: "/confirm-vote" },
    { name: "Vote Submitted", path: "/receipt" },
    { name: "Admin Dashboard", path: "/admin" },
    { name: "Election Results", path: "/results" }
  ];

  return (
    <div className="bg-slate-900 border-b-2 border-yellow-500 text-yellow-500 text-xs px-margin-page py-2 flex flex-wrap justify-between items-center z-50 sticky top-0 font-mono gap-2">
      <div className="flex items-center gap-2 flex-wrap">

        {/* Mock Role Select */}
        <button
          onClick={() => handleRoleToggle("unauth")}
          className={`px-2 py-0.5 border ${!user ? "bg-yellow-500 text-slate-900 border-yellow-500 font-bold" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
        >
          Unauth
        </button>
        <button
          onClick={() => handleRoleToggle("student-notvoted")}
          className={`px-2 py-0.5 border ${user?.role === "student" && !user.hasVoted ? "bg-yellow-500 text-slate-900 border-yellow-500 font-bold" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
        >
          Student (Not Voted)
        </button>
        <button
          onClick={() => handleRoleToggle("student-voted")}
          className={`px-2 py-0.5 border ${user?.role === "student" && user.hasVoted ? "bg-yellow-500 text-slate-900 border-yellow-500 font-bold" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
        >
          Student (Voted)
        </button>
        <button
          onClick={() => handleRoleToggle("admin")}
          className={`px-2 py-0.5 border ${user?.role === "admin" ? "bg-yellow-500 text-slate-900 border-yellow-500 font-bold" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
        >
          Admin
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Direct Navigation */}
        <span className="text-slate-400">Jump to Screen:</span>
        <select
          value={location.pathname}
          onChange={(e) => handleRedirect(e.target.value)}
          className="bg-slate-800 text-yellow-500 border border-slate-700 text-xs px-2 py-0.5 focus:outline-none"
        >
          {pages.map((p) => (
            <option key={p.path} value={p.path}>{p.name}</option>
          ))}
        </select>

      </div>
    </div>
  );
}

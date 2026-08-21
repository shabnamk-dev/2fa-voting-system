import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { mockApi } from "../../services/mockApi";

export default function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    try {
      const user = mockApi.login(studentId, password);
      onLoginSuccess(user);
      if (user.role === "admin") {
        navigate("/admin");
      } else {
        if (!user.is2faSetup) {
          navigate("/2fa-setup");
        } else {
          navigate("/otp-verify");
        }
      }
    } catch (err) {
      setError(err.message || "Authentication failed.");
    }
  };

  return (
    <main className="w-full max-w-container-max mx-auto px-margin-page py-stack-lg flex-grow flex flex-col items-center justify-center min-h-[calc(100vh-6rem)]">
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline px-gutter py-stack-lg relative my-auto">
        {/* Top Icon */}
        <div className="w-full text-center mt-2 mb-4">
          <span className="material-symbols-outlined text-[48px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            how_to_vote
          </span>
        </div>

        {/* Title */}
        <div className="text-center mb-stack-lg border-b border-outline pb-stack-md">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Academic Voting Portal</h1>
          <p className="font-body-md text-body-md text-text-secondary mt-stack-sm">Student Login</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-error-container border border-error text-error text-sm font-bold">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-stack-md">
          <div className="flex flex-col gap-stack-sm">
            <label className="font-label-lg text-label-lg text-primary uppercase" htmlFor="studentId">
              Student ID
            </label>
            <input
              className="w-full bg-surface-container-lowest border border-outline rounded-none px-4 py-3 font-body-lg text-body-lg text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-text-secondary"
              id="studentId"
              name="studentId"
              placeholder="Enter 8-digit ID"
              required
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-stack-sm">
            <label className="font-label-lg text-label-lg text-primary uppercase" htmlFor="password">
              Password
            </label>
            <input
              className="w-full bg-surface-container-lowest border border-outline rounded-none px-4 py-3 font-body-lg text-body-lg text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-text-secondary"
              id="password"
              name="password"
              placeholder="Enter your password"
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-stack-md">
            <button
              className="w-full bg-primary text-on-primary font-label-lg text-label-lg uppercase tracking-widest py-4 border border-primary hover:bg-on-primary-fixed-variant transition-none rounded-none flex justify-center items-center gap-2"
              type="submit"
            >
              <span>Login </span>
            </button>
          </div>
        </form>

        {/* Links */}
        <div className="mt-stack-lg pt-stack-sm border-t border-outline text-center flex flex-col gap-2">
          <Link
            className="font-label-md text-label-md text-text-secondary hover:text-primary transition-none underline underline-offset-4 decoration-outline hover:decoration-primary"
            to="/register"
          >
            Create New Voter Account
          </Link>
        </div>
      </div>
    </main>
  );
}

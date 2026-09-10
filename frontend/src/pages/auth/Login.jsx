import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { login as apiLogin } from "../../services/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(location.state?.successBanner || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiLogin(studentId.trim(), password);
      const data = res.data?.data || {};
      const nextStep = data.next;
      const attemptId = data.attempt_id;
      const methods = data.methods || [];

      const uName = studentId.trim();
      sessionStorage.setItem("auth_username", uName);
      if (attemptId) {
        sessionStorage.setItem("auth_attempt_id", attemptId);
      }

      if (nextStep === "setup-2fa") {
        navigate("/2fa-setup", {
          state: {
            credentials: { username: uName, password },
          },
        });
      } else if (nextStep === "choose-2fa" || nextStep === "verify-totp") {
        navigate("/2fa-verify", {
          state: {
            attempt_id: attemptId,
            username: uName,
            methods: methods.length > 0 ? methods : ["TOTP"],
          },
        });
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="w-full max-w-container-max mx-auto px-margin-page py-stack-lg flex-grow flex flex-col items-center justify-center min-h-[calc(100vh-6rem)]">
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline px-gutter py-stack-lg relative my-auto">
        {/* Top Icon */}
        <div className="w-full text-center mt-2 mb-4">
          <span
            className="material-symbols-outlined text-[48px] text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            how_to_vote
          </span>
        </div>

        {/* Title */}
        <div className="text-center mb-stack-lg border-b border-outline pb-stack-md">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-semibold">
            Academic Voting Portal
          </h1>
          <p className="font-body-md text-body-md text-text-secondary mt-stack-sm">
            Primary Layer Authentication (Step 1)
          </p>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="mb-4 p-3 bg-secondary-container/20 border border-secondary text-secondary text-sm font-bold flex items-start gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <div>{success}</div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-error-container border border-error text-error text-sm font-bold flex items-start gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            <div>{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-stack-md">
          <div className="flex flex-col gap-stack-sm">
            <label className="font-label-lg text-label-lg text-primary uppercase" htmlFor="studentId">
              Student ID / Username
            </label>
            <input
              className="w-full bg-surface-container-lowest border border-outline rounded-none px-4 py-3 font-body-lg text-body-lg text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-text-secondary"
              id="studentId"
              name="studentId"
              placeholder="Enter Student ID"
              required
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={loading}
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
              disabled={loading}
            />
          </div>

          <div className="pt-stack-md">
            <button
              className="w-full bg-primary text-on-primary font-label-lg text-label-lg uppercase tracking-widest py-4 border border-primary hover:bg-on-primary-fixed-variant transition-none rounded-none flex justify-center items-center gap-2 disabled:opacity-50"
              type="submit"
              disabled={loading}
            >
              <span>{loading ? "Authenticating..." : "Continue to 2FA"}</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
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

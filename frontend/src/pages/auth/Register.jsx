import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as apiRegister, login as apiLogin } from "../../services/api";

export default function Register() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const username = studentId.trim();
    if (username.length < 3) {
      setError("Student ID must be at least 3 characters.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiRegister(username, password);
      // Automatically log in to skip manual login screen and proceed straight to 2FA
      const loginRes = await apiLogin(username, password);
      const data = loginRes.data?.data || {};
      const attemptId = data.attempt_id;
      const methods = data.methods || ["TOTP", "QR", "PUSH", "BIOMETRIC", "SECURITY_KEY"];

      if (attemptId) {
        sessionStorage.setItem("auth_attempt_id", attemptId);
      }
      sessionStorage.setItem("auth_username", username);

      setSuccess("Account registered! Proceeding to 2FA choice...");
      setTimeout(() => {
        navigate("/2fa-verify", {
          state: {
            attempt_id: attemptId,
            username: username,
            methods: methods,
          },
        });
      }, 500);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-center p-margin-page max-w-container-max mx-auto w-full min-h-[calc(100vh-10rem)]">
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline p-stack-lg">
        {/* Top Icon */}
        <div className="w-full text-center mt-2 mb-4">
          <span
            className="material-symbols-outlined text-[48px] text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            person_add
          </span>
        </div>

        <div className="mb-stack-lg text-center">
          <h1 className="font-headline-lg text-headline-lg text-primary mb-stack-sm font-semibold">
            Create Voter Account
          </h1>
          <p className="font-body-md text-body-md text-text-secondary">
            Register your Student ID to participate in campus elections.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-error-container border border-error text-error text-sm font-bold flex items-start gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-secondary-container/20 border border-secondary text-secondary text-sm font-bold flex items-start gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <div>{success}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-stack-md">
          {/* Student ID */}
          <div>
            <label className="block font-label-lg text-label-lg text-primary mb-1 uppercase" htmlFor="student-id">
              Student ID / Username
            </label>
            <input
              className="w-full input-institutional p-3 font-body-md text-body-md focus:ring-1 focus:ring-primary"
              id="student-id"
              name="student_id"
              placeholder="e.g. STU1001"
              required
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block font-label-lg text-label-lg text-primary mb-1 uppercase" htmlFor="password">
              Password
            </label>
            <input
              className="w-full input-institutional p-3 font-body-md text-body-md focus:ring-1 focus:ring-primary"
              id="password"
              name="password"
              placeholder="Create a strong password (min 8 chars)"
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block font-label-lg text-label-lg text-primary mb-1 uppercase" htmlFor="confirm-password">
              Confirm Password
            </label>
            <input
              className="w-full input-institutional p-3 font-body-md text-body-md focus:ring-1 focus:ring-primary"
              id="confirm-password"
              name="confirm_password"
              placeholder="Re-enter your password"
              required
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Submit Button */}
          <div className="pt-stack-md">
            <button
              className="w-full btn-institutional py-3.5 font-label-lg text-label-lg uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
              type="submit"
              disabled={loading}
            >
              <span>{loading ? "Registering..." : "Create Account"}</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </div>
        </form>

        <div className="mt-stack-lg border-t border-outline pt-stack-md text-center">
          <p className="font-body-md text-body-md text-text-secondary">
            Already have an account?{" "}
            <Link className="text-primary font-label-lg text-label-lg underline font-semibold" to="/login">
              Log In
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

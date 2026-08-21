import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as apiRegister } from "../../services/api";

export default function Register({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await apiRegister(studentId, password);
      setSuccess("Registration successful! Redirecting to login...");
      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Registration failed.");
    }
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-center p-margin-page max-w-container-max mx-auto w-full min-h-[calc(100vh-10rem)]">
      {/* Registration Form Container */}
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline p-stack-lg">
        {/* Top Icon */}
        <div className="w-full text-center mt-2 mb-4">
          <span className="material-symbols-outlined text-[48px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            how_to_vote
          </span>
        </div>

        <div className="mb-stack-lg text-center">
          <h1 className="font-headline-lg text-headline-lg text-primary mb-stack-sm font-semibold">Academic Voting Portal</h1>
          <p className="font-body-md text-body-md text-text-secondary">Student Registeration</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-error-container border border-error text-error text-sm font-bold">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-secondary-container/30 border border-secondary text-secondary text-sm font-bold">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-stack-md">
          {/* Student ID */}
          <div>
            <label className="block font-label-lg text-label-lg text-primary mb-stack-sm uppercase" htmlFor="student-id">
              STUDENT ID
            </label>
            <input
              className="w-full input-institutional p-3 font-body-md text-body-md focus:ring-1 focus:ring-primary"
              id="student-id"
              name="student_id"
              placeholder="Enter your ID"
              required
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
          </div>

          {/* University Email */}
          <div>
            <label className="block font-label-lg text-label-lg text-primary mb-stack-sm uppercase" htmlFor="email">
              UNIVERSITY EMAIL
            </label>
            <input
              className="w-full input-institutional p-3 font-body-md text-body-md focus:ring-1 focus:ring-primary"
              id="email"
              name="email"
              placeholder="student@university.edu"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block font-label-lg text-label-lg text-primary mb-stack-sm uppercase" htmlFor="password">
              PASSWORD
            </label>
            <input
              className="w-full input-institutional p-3 font-body-md text-body-md focus:ring-1 focus:ring-primary"
              id="password"
              name="password"
              placeholder="Create a strong password"
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="font-label-md text-label-md text-text-secondary mt-2">
              Must be at least 8 characters, including at least one uppercase, lowercase, numbers, and symbols.
            </p>
          </div>



          {/* Submit Button */}
          <div className="pt-stack-md">
            <button className="w-full btn-institutional py-3 font-label-lg text-label-lg uppercase tracking-wider" type="submit">
              REGISTER
            </button>
          </div>
        </form>

        <div className="mt-stack-lg border-t border-outline pt-stack-md text-center">
          <p className="font-body-md text-body-md text-text-secondary">
            Already registered? <Link className="text-primary font-label-lg text-label-lg underline" to="/login">Log In Here</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

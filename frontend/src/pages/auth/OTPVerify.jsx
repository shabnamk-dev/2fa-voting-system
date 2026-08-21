import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { verifyTOTP, getMe } from "../../services/api";

export default function OTPVerify({ user, onOtpSuccess }) {
  const navigate = useNavigate();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const inputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null)
  ];

  useEffect(() => {
    // Focus first input on mount
    if (inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, []);

  const handleChange = (e, index) => {
    const value = e.target.value.replace(/\D/g, "");
    if (!value) return;

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    // Auto-advance
    if (index < 5 && inputRefs[index + 1].current) {
      inputRefs[index + 1].current.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace") {
      const newDigits = [...digits];

      if (digits[index] !== "") {
        newDigits[index] = "";
        setDigits(newDigits);
      } else if (index > 0 && inputRefs[index - 1].current) {
        newDigits[index - 1] = "";
        setDigits(newDigits);
        inputRefs[index - 1].current.focus();
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...digits];
    [...pastedData].forEach((char, i) => {
      if (i < 6) {
        newDigits[i] = char;
      }
    });
    setDigits(newDigits);

    const focusIndex = Math.min(pastedData.length, 5);
    if (inputRefs[focusIndex].current) {
      inputRefs[focusIndex].current.focus();
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setError("");

    const code = digits.join("");
    if (code.length !== 6) {
      setError("Please fill in all 6 digits.");
      return;
    }

    try {
      await verifyTOTP(code);
      const userRes = await getMe();
      const meData = userRes.data?.data;
      if (meData) {
        const loggedInUser = {
          studentId: meData.username,
          username: meData.username,
          role: meData.role === "voter" ? "student" : meData.role,
          hasVoted: meData.has_voted,
        };
        onOtpSuccess(loggedInUser);
        if (loggedInUser.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Invalid authentication code.");
    }
  };

  const handleResend = () => {
    alert("Verification code has been resent to your registered institutional email.");
    setDigits(["", "", "", "", "", ""]);
    if (inputRefs[0].current) inputRefs[0].current.focus();
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-center p-margin-page w-full max-w-container-max mx-auto min-h-[calc(100vh-10rem)]">
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline rounded-none flex flex-col">
        {/* Header Section */}
        <div className="bg-surface-container border-b border-outline p-stack-md flex items-center justify-center">
          <span aria-hidden="true" className="material-symbols-outlined text-primary mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>
            security
          </span>
          <h1 className="font-headline-md text-headline-md text-primary m-0 uppercase tracking-tight font-semibold">
            Security Verification
          </h1>
        </div>

        {/* Content Section */}
        <div className="p-stack-lg flex flex-col gap-stack-lg">
          <div className="text-center">
            <h2 className="font-headline-lg text-headline-lg text-primary mb-stack-sm font-semibold">Enter Access Code</h2>
            <p className="font-body-md text-body-md text-text-secondary">
              A 6-digit verification code has been sent to your registered institutional email. Please enter it below to proceed.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-error-container border border-error text-error text-sm font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} className="flex flex-col gap-stack-lg">
            {/* OTP Inputs */}
            <div className="flex justify-between gap-2 sm:gap-gutter" id="otp-container">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={inputRefs[index]}
                  aria-label={`Digit ${index + 1}`}
                  className="w-12 h-16 text-center font-display text-display text-primary bg-surface-container-lowest border border-outline focus:border-primary focus:ring-0 focus:outline-none rounded-none"
                  maxlength="1"
                  type="text"
                  value={digit}
                  onChange={(e) => handleChange(e, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onPaste={index === 0 ? handlePaste : undefined}
                />
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-stack-md mt-stack-md">
              <button
                type="submit"
                className="w-full bg-primary text-on-primary font-label-lg text-label-lg py-3 px-4 uppercase tracking-widest border border-primary hover:bg-on-primary-fixed-variant rounded-none flex items-center justify-center gap-2"
              >
                Verify
                <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
              </button>
              <button
                type="button"
                onClick={handleResend}
                className="w-full bg-transparent text-primary font-label-md text-label-md py-2 px-4 uppercase border border-transparent hover:border-outline rounded-none transition-none"
              >
                Resend Code
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  verifyTOTP,
  createPushRequest,
  getPushStatus,
  createQRChallenge,
  getQRStatus,
  getBiometricAuthOptions,
  verifyBiometricAuth,
  listUserMethods,
  getMe,
} from "../../services/api";
import { performWebAuthnAuthentication } from "../../services/webauthn";

const METHODS = [
  {
    id: "TOTP",
    title: "Authenticator App (TOTP)",
    subtitle: "Enter 6-digit code from Google Authenticator, Authy, etc.",
    icon: "pin",
    badge: "6-Digit Code",
  },
  {
    id: "QR",
    title: "QR Code Login",
    subtitle: "Scan dynamic screen challenge with your enrolled mobile phone",
    icon: "qr_code_2",
    badge: "Mobile Scan",
  },
  {
    id: "PUSH",
    title: "Trusted Device Approval",
    subtitle: "Approve login prompt from your registered trusted device",
    icon: "notifications_active",
    badge: "Device Prompt",
  },
  {
    id: "BIOMETRIC",
    title: "Platform Biometrics",
    subtitle: "WebAuthn — Windows Hello, Touch ID, Fingerprint, or Face Unlock",
    icon: "fingerprint",
    badge: "WebAuthn",
  },
];

export default function TwoFactorVerify({ onAuthSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();

  const attemptId = location.state?.attempt_id || sessionStorage.getItem("auth_attempt_id");
  const username = location.state?.username || sessionStorage.getItem("auth_username") || "";
  const initialEnabledMethods = location.state?.methods || [];

  const [enabledMethods, setEnabledMethods] = useState(
    Array.isArray(initialEnabledMethods) ? initialEnabledMethods.map((m) => m.toUpperCase()) : []
  );

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // TOTP State
  const [otpCode, setOtpCode] = useState("");

  // Push State
  const [pushRequestId, setPushRequestId] = useState(null);
  const [pushStatus, setPushStatus] = useState("idle");
  const [pushExpiresIn, setPushExpiresIn] = useState(120);
  const pushPollTimer = useRef(null);

  // QR State
  const [qrRequestId, setQrRequestId] = useState(null);
  const [qrImageData, setQrImageData] = useState(null);
  const [qrStatus, setQrStatus] = useState("idle");
  const [qrExpiresIn, setQrExpiresIn] = useState(120);
  const qrPollTimer = useRef(null);

  // Biometric State
  const [biometricStatus, setBiometricStatus] = useState("idle");

  // Fetch enabled methods if not passed through state
  useEffect(() => {
    const fetchMethods = async () => {
      if (enabledMethods.length === 0) {
        try {
          const res = await listUserMethods();
          const list = res.data?.data?.enabled_methods || [];
          setEnabledMethods(list.map((m) => m.toUpperCase()));
        } catch (_err) {
          // Default to TOTP if unable to fetch
        }
      }
    };
    fetchMethods();
  }, [enabledMethods.length]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (pushPollTimer.current) clearInterval(pushPollTimer.current);
      if (qrPollTimer.current) clearInterval(qrPollTimer.current);
    };
  }, []);

  const finishAuth = useCallback(async () => {
    sessionStorage.removeItem("auth_attempt_id");

    const clientUser = {
      studentId: username || "STU1001",
      username: username || "STU1001",
      role: "student",
      hasVoted: false,
    };

    try {
      const meRes = await getMe();
      const meData = meRes.data?.data;
      if (meData) {
        clientUser.studentId = meData.username;
        clientUser.username = meData.username;
        clientUser.role = meData.role === "voter" ? "student" : meData.role;
        clientUser.hasVoted = !!meData.has_voted;
      }
    } catch (_err) {
      // Fallback to default
    }

    if (onAuthSuccess) {
      onAuthSuccess(clientUser);
    }
    navigate(clientUser.role === "admin" ? "/admin" : "/dashboard", { replace: true });
  }, [navigate, onAuthSuccess, username]);

  // -------------------------------------------------------------
  // 1. TOTP Ceremony (Keep Existing Unchanged)
  // -------------------------------------------------------------
  const handleVerifyTOTP = async (e) => {
    e.preventDefault();
    setError("");
    const token = otpCode.replace(/\s/g, "");
    if (token.length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      await verifyTOTP(token, attemptId);
      await finishAuth();
    } catch (err) {
      setError(err.response?.data?.message || "Invalid TOTP verification code.");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // 2. QR Code Login Ceremony
  // -------------------------------------------------------------
  const startQRChallenge = useCallback(async () => {
    setError("");
    setLoading(true);
    setQrStatus("waiting");
    if (qrPollTimer.current) clearInterval(qrPollTimer.current);

    try {
      const res = await createQRChallenge(attemptId);
      const data = res.data?.data;
      if (data) {
        setQrRequestId(data.request_id);
        setQrImageData(data.qr_code);
        setQrExpiresIn(data.expires_in_seconds || 120);

        // Start polling for mobile scan and approval
        qrPollTimer.current = setInterval(async () => {
          try {
            const statusRes = await getQRStatus(data.request_id);
            const statusData = statusRes.data?.data;
            if (statusData?.status === "APPROVED") {
              clearInterval(qrPollTimer.current);
              setQrStatus("approved");
              setTimeout(() => {
                finishAuth();
              }, 600);
            } else if (statusData?.status === "DENIED") {
              clearInterval(qrPollTimer.current);
              setQrStatus("denied");
              setError("Login request was denied from your mobile device.");
            } else if (statusData?.status === "EXPIRED") {
              clearInterval(qrPollTimer.current);
              setQrStatus("expired");
              setError("QR login challenge expired. Please generate a new code.");
            }
          } catch (_err) {
            // Keep polling
          }
        }, 1500);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to generate QR login challenge.");
      setQrStatus("idle");
    } finally {
      setLoading(false);
    }
  }, [attemptId, finishAuth]);

  useEffect(() => {
    if (selectedMethod === "QR" && qrStatus === "idle") {
      startQRChallenge();
    }
  }, [selectedMethod, qrStatus, startQRChallenge]);

  // -------------------------------------------------------------
  // 3. Trusted Device Approval Ceremony
  // -------------------------------------------------------------
  const startPushChallenge = useCallback(async () => {
    setError("");
    setLoading(true);
    setPushStatus("waiting");
    if (pushPollTimer.current) clearInterval(pushPollTimer.current);

    try {
      const res = await createPushRequest(attemptId);
      const data = res.data?.data;
      if (data) {
        setPushRequestId(data.request_id);
        setPushExpiresIn(data.expires_in_seconds || 120);

        // Start polling for approval from registered device
        pushPollTimer.current = setInterval(async () => {
          try {
            const statusRes = await getPushStatus(data.request_id);
            const statusData = statusRes.data?.data;
            if (statusData?.status === "APPROVED") {
              clearInterval(pushPollTimer.current);
              setPushStatus("approved");
              setTimeout(() => {
                finishAuth();
              }, 600);
            } else if (statusData?.status === "DENIED") {
              clearInterval(pushPollTimer.current);
              setPushStatus("denied");
              setError("Login request was denied by your trusted device.");
            } else if (statusData?.status === "EXPIRED") {
              clearInterval(pushPollTimer.current);
              setPushStatus("expired");
              setError("Push approval request expired.");
            }
          } catch (_err) {
            // Keep polling
          }
        }, 1500);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to initiate trusted device approval request.");
      setPushStatus("idle");
    } finally {
      setLoading(false);
    }
  }, [attemptId, finishAuth]);

  useEffect(() => {
    if (selectedMethod === "PUSH" && pushStatus === "idle") {
      startPushChallenge();
    }
  }, [selectedMethod, pushStatus, startPushChallenge]);

  // -------------------------------------------------------------
  // 4. Platform Biometrics (WebAuthn) Ceremony
  // -------------------------------------------------------------
  const startBiometricAuthentication = async () => {
    setError("");
    setLoading(true);
    setBiometricStatus("prompting");

    try {
      const optionsRes = await getBiometricAuthOptions(attemptId);
      const options = optionsRes.data?.data;
      const credential = await performWebAuthnAuthentication(options);
      await verifyBiometricAuth(credential, attemptId);
      setBiometricStatus("success");
      setTimeout(() => {
        finishAuth();
      }, 500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Biometric verification was cancelled or failed."
      );
      setBiometricStatus("idle");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMethod === "BIOMETRIC" && biometricStatus === "idle") {
      startBiometricAuthentication();
    }
  }, [selectedMethod, biometricStatus]);

  return (
    <div className="w-full flex-grow flex flex-col">
      <main className="flex-grow flex items-center justify-center py-stack-lg px-margin-page">
        <div className="max-w-xl w-full border border-outline bg-surface-container-lowest flex flex-col">
          {/* Header */}
          <div className="bg-surface-container border-b border-outline p-stack-md flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                verified_user
              </span>
              <h1 className="font-headline-md text-headline-md text-primary m-0 uppercase tracking-tight font-semibold">
                Two-Factor Verification
              </h1>
            </div>
            <span className="font-mono text-xs font-bold text-text-secondary">
              {username ? `Voter: ${username}` : "Identity Challenge"}
            </span>
          </div>

          {/* Alerts */}
          {error && (
            <div className="px-stack-lg pt-stack-md">
              <div className="w-full p-3 bg-error-container border border-error text-error text-sm font-bold flex items-start gap-2">
                <span className="material-symbols-outlined text-base">error</span>
                <div>{error}</div>
              </div>
            </div>
          )}

          {/* Body Content */}
          <div className="p-stack-lg flex flex-col gap-stack-lg">
            {/* STEP 1: METHOD SELECTION */}
            {!selectedMethod ? (
              <div className="flex flex-col gap-stack-md">
                <div className="text-center mb-1">
                  <h2 className="font-headline-lg text-headline-lg text-primary mb-1 font-semibold">
                    Select 2FA Method
                  </h2>
                  <p className="font-body-md text-body-md text-text-secondary">
                    Choose an enrolled authentication method to complete your login.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {METHODS.map((m) => {
                    const isEnrolled = enabledMethods.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!isEnrolled}
                        onClick={() => {
                          if (isEnrolled) {
                            setSelectedMethod(m.id);
                            setError("");
                          }
                        }}
                        className={`text-left p-4 border transition-all flex items-start justify-between gap-4 ${
                          isEnrolled
                            ? "border-outline hover:border-primary hover:bg-surface-main cursor-pointer"
                            : "border-outline/40 bg-surface-container/30 opacity-60 cursor-not-allowed"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 border mt-0.5 ${
                              isEnrolled
                                ? "bg-surface-container border-outline text-primary"
                                : "bg-surface-container-low border-outline/40 text-text-secondary"
                            }`}
                          >
                            <span className="material-symbols-outlined text-2xl">{m.icon}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-headline-sm font-semibold ${
                                  isEnrolled ? "text-primary" : "text-text-secondary"
                                }`}
                              >
                                {m.title}
                              </span>
                              <span
                                className={`text-[10px] uppercase font-bold px-1.5 py-0.5 border ${
                                  isEnrolled
                                    ? "border-outline text-text-secondary"
                                    : "border-outline/40 text-text-secondary/60"
                                }`}
                              >
                                {m.badge}
                              </span>
                            </div>
                            <p className="text-xs text-text-secondary mt-1">{m.subtitle}</p>
                          </div>
                        </div>

                        <div className="mt-1 flex flex-col items-end">
                          {isEnrolled ? (
                            <span className="inline-flex items-center gap-1 text-secondary text-xs font-bold uppercase tracking-wider">
                              <span className="material-symbols-outlined text-sm">verified</span>
                              Available
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-surface-container border border-outline/50 text-text-secondary">
                              Setup Required
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-outline pt-4 text-center mt-2 flex justify-between items-center text-xs text-text-secondary">
                  <Link to="/2fa-setup" className="hover:text-primary underline font-semibold">
                    Configure / Enroll 2FA Methods
                  </Link>
                  <Link to="/login" className="hover:text-primary underline font-semibold">
                    ← Back to Login
                  </Link>
                </div>
              </div>
            ) : (
              /* STEP 2: ACTIVE CEREMONY VIEW */
              <div className="flex flex-col gap-stack-md">
                {/* 1. TOTP Verify */}
                {selectedMethod === "TOTP" && (
                  <form onSubmit={handleVerifyTOTP} className="flex flex-col gap-4 text-center">
                    <div>
                      <span className="material-symbols-outlined text-4xl text-primary mb-1">pin</span>
                      <h2 className="font-headline-md font-semibold text-primary">Enter TOTP Code</h2>
                      <p className="text-xs text-text-secondary mt-1">
                        Enter the 6-digit verification code generated by your authenticator app.
                      </p>
                    </div>

                    <div className="max-w-xs mx-auto w-full flex flex-col gap-3">
                      <input
                        maxLength="6"
                        placeholder="000000"
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                        required
                        autoFocus
                        className="w-full border border-outline p-3 text-center font-mono text-3xl tracking-widest bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                      />

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">lock_open</span>
                        {loading ? "Verifying Code..." : "Verify & Sign In"}
                      </button>
                    </div>
                  </form>
                )}

                {/* 2. QR Code Login Ceremony */}
                {selectedMethod === "QR" && (
                  <div className="flex flex-col gap-4 text-center items-center py-2">
                    <div>
                      <span className="material-symbols-outlined text-4xl text-primary mb-1">qr_code_2</span>
                      <h2 className="font-headline-md font-semibold text-primary">QR Code Login</h2>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1">
                        Scan this dynamic one-time challenge QR with your enrolled mobile device and tap "Approve".
                      </p>
                    </div>

                    {loading && !qrImageData ? (
                      <div className="py-12 flex flex-col items-center">
                        <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-2">progress_activity</span>
                        <p className="text-sm text-text-secondary">Generating login challenge...</p>
                      </div>
                    ) : qrImageData ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="border-4 border-primary p-2 bg-white shadow-sm">
                          <img className="w-52 h-52 object-contain" alt="QR Login Challenge" src={qrImageData} />
                        </div>

                        {qrStatus === "approved" ? (
                          <div className="text-xs text-secondary font-bold uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            Approved! Signing in...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-secondary font-bold uppercase tracking-wider animate-pulse">
                            <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                            Waiting for scan and approval on phone...
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={startQRChallenge}
                          className="text-xs text-text-secondary hover:text-primary underline mt-1 cursor-pointer"
                        >
                          ↻ Refresh QR Challenge
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* 3. Trusted Device Approval Ceremony */}
                {selectedMethod === "PUSH" && (
                  <div className="flex flex-col gap-4 text-center items-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary animate-bounce">
                      notifications_active
                    </span>
                    <div>
                      <h2 className="font-headline-md font-semibold text-primary">Approval Prompt Dispatched</h2>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1">
                        A login challenge was dispatched to your registered trusted device. Please review and tap "Approve Login".
                      </p>
                    </div>

                    {pushStatus === "approved" ? (
                      <div className="text-xs text-secondary font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Approved! Signing in...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-secondary font-bold uppercase tracking-wider animate-pulse">
                        <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                        Awaiting approval from your device...
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={startPushChallenge}
                      className="text-xs text-text-secondary hover:text-primary underline mt-2 cursor-pointer"
                    >
                      ↻ Resend Approval Prompt
                    </button>
                  </div>
                )}

                {/* 4. Platform Biometrics Ceremony */}
                {selectedMethod === "BIOMETRIC" && (
                  <div className="flex flex-col gap-4 text-center items-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary">fingerprint</span>
                    <div>
                      <h2 className="font-headline-md font-semibold text-primary">Platform Biometrics</h2>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1">
                        Complete your Windows Hello, Touch ID, or platform biometric prompt.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={startBiometricAuthentication}
                      disabled={loading}
                      className="w-full max-w-xs mx-auto bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-base">fingerprint</span>
                      {loading ? "Waiting for Biometric Sensor..." : "Authenticate with Biometrics"}
                    </button>
                  </div>
                )}

                {/* Back to Method Selection */}
                <div className="border-t border-outline pt-4 text-center mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod(null);
                      setError("");
                      if (pushPollTimer.current) clearInterval(pushPollTimer.current);
                      if (qrPollTimer.current) clearInterval(qrPollTimer.current);
                    }}
                    className="font-label-md text-label-md text-text-secondary hover:text-primary underline underline-offset-4 cursor-pointer"
                  >
                    ← Choose a different authentication method
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

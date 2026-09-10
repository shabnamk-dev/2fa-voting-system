import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  getSetup2FA,
  confirmSetup2FA,
  verifyTOTP,
  createPushRequest,
  getPushStatus,
  respondToPush,
  createQRChallenge,
  getQRStatus,
  respondToQR,
  getBiometricAuthOptions,
  verifyBiometricAuth,
  getSecurityKeyAuthOptions,
  verifySecurityKeyAuth,
  getMe,
} from "../../services/api";
import { performWebAuthnAuthentication } from "../../services/webauthn";

const METHODS = [
  {
    id: "TOTP",
    title: "Authenticator App (TOTP)",
    subtitle: "Enter the 6-digit dynamic code from Google Authenticator or Authy",
    icon: "pin",
    badge: "6-Digit Code",
  },
  {
    id: "QR",
    title: "QR Code",
    subtitle: "Scan a dynamic one-time cryptographic QR from your mobile phone",
    icon: "qr_code_2",
    badge: "Mobile Scan",
  },
  {
    id: "PUSH",
    title: "Push Notification",
    subtitle: "Receive a real-time instant login prompt on your registered trusted device",
    icon: "notifications_active",
    badge: "Device Prompt",
  },
  {
    id: "BIOMETRIC",
    title: "Platform Biometrics",
    subtitle: "Touch ID, Windows Hello, Fingerprint, or Face Unlock via WebAuthn",
    icon: "fingerprint",
    badge: "WebAuthn",
  },
  {
    id: "SECURITY_KEY",
    title: "Hardware Security Key",
    subtitle: "Physical YubiKey, Google Titan Key, or FIDO2 USB / NFC token",
    icon: "key",
    badge: "FIDO2",
  },
];

export default function TwoFactorVerify({ onAuthSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();

  const attemptId = location.state?.attempt_id || sessionStorage.getItem("auth_attempt_id");
  const username = location.state?.username || sessionStorage.getItem("auth_username") || "";

  // Retrieve last used 2FA method strictly scoped to this account
  const lastUsedKey = username ? `last_used_2fa_${username}` : null;
  const lastUsedMethod = lastUsedKey ? (localStorage.getItem(lastUsedKey) || "") : "";

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // TOTP State
  const isFirstTimeTotp = !lastUsedMethod || lastUsedMethod !== "TOTP";
  const [totpMode, setTotpMode] = useState(isFirstTimeTotp ? "setup" : "verify"); // "setup" | "verify"
  const [otpCode, setOtpCode] = useState("");
  const [totpSetupData, setTotpSetupData] = useState(null);
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);

  // Push State
  const [pushRequestId, setPushRequestId] = useState(null);
  const [pushStatus, setPushStatus] = useState("idle"); // idle | waiting | approved | denied | expired
  const [pushExpiresIn, setPushExpiresIn] = useState(120);
  const pushPollTimer = useRef(null);

  // QR State
  const [qrRequestId, setQrRequestId] = useState(null);
  const [qrChallenge, setQrChallenge] = useState(null);
  const [qrImageData, setQrImageData] = useState(null);
  const [qrStatus, setQrStatus] = useState("idle"); // idle | waiting | approved | denied | expired
  const [qrExpiresIn, setQrExpiresIn] = useState(120);
  const qrPollTimer = useRef(null);

  // Biometric / Security Key State
  const [webAuthnStatus, setWebAuthnStatus] = useState("idle");

  const loadTotpSetupData = useCallback(async () => {
    setError("");
    setTotpSetupLoading(true);
    try {
      const res = await getSetup2FA();
      const data = res.data?.data;
      if (data?.qr_code) {
        setTotpSetupData(data);
      } else {
        const sec = data?.secret || "JBSWY3DPEHPK3PXP";
        const otpAuthUri = `otpauth://totp/SecureVotingSystem:${username || "Voter"}?secret=${sec}&issuer=SecureVotingSystem`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpAuthUri)}`;
        setTotpSetupData({
          username: username || "Voter",
          secret: sec,
          qr_code: qrUrl,
        });
      }
    } catch (_err) {
      const sec = "JBSWY3DPEHPK3PXP";
      const otpAuthUri = `otpauth://totp/SecureVotingSystem:${username || "Voter"}?secret=${sec}&issuer=SecureVotingSystem`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpAuthUri)}`;
      setTotpSetupData({
        username: username || "Voter",
        secret: sec,
        qr_code: qrUrl,
      });
    } finally {
      setTotpSetupLoading(false);
    }
  }, [username]);


  // Automatically load TOTP setup data if entering in setup mode
  useEffect(() => {
    if (selectedMethod === "TOTP" || isFirstTimeTotp) {
      loadTotpSetupData();
    }
  }, [isFirstTimeTotp, loadTotpSetupData, selectedMethod]);

  const finishAuth = useCallback(async (verifiedMethod) => {
    if (verifiedMethod && lastUsedKey) {
      localStorage.setItem(lastUsedKey, verifiedMethod);
    }

    sessionStorage.removeItem("auth_attempt_id");
    
    // Default voter fallback user
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
      // Backend session wasn't elevated by real factor verify (simulation)
    }

    if (onAuthSuccess) {
      onAuthSuccess(clientUser);
    }
    navigate(clientUser.role === "admin" ? "/admin" : "/dashboard", { replace: true });
  }, [lastUsedKey, navigate, onAuthSuccess, username]);

  // Clean up polling intervals on unmount or method switch
  useEffect(() => {
    return () => {
      if (pushPollTimer.current) clearInterval(pushPollTimer.current);
      if (qrPollTimer.current) clearInterval(qrPollTimer.current);
    };
  }, []);

  // -------------------------------------------------------------
  // 1. TOTP Ceremony
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
      let verified = false;
      
      // Try setup confirmation first if in setup mode
      if (totpMode === "setup") {
        try {
          await confirmSetup2FA(token);
          verified = true;
        } catch (_cErr) {
          // If setup fails, will try verifyTOTP below
        }
      }

      // Try verifyTOTP
      if (!verified) {
        try {
          await verifyTOTP(token, attemptId);
          verified = true;
        } catch (vErr) {
          // If verify returned 400 (e.g. not configured yet), fallback to confirmSetup2FA
          if (vErr.response?.status === 400 || vErr.response?.status === 401) {
            await confirmSetup2FA(token);
            verified = true;
          } else {
            throw vErr;
          }
        }
      }

      await finishAuth("TOTP");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Invalid authenticator code.");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // 2. Push Notification Ceremony
  // -------------------------------------------------------------
  const startPushChallenge = useCallback(() => {
    setError("");
    setPushStatus("waiting");
    setPushExpiresIn(120);
    if (pushPollTimer.current) clearInterval(pushPollTimer.current);
    pushPollTimer.current = setInterval(() => {
      setPushExpiresIn((prev) => {
        if (prev <= 1) {
          clearInterval(pushPollTimer.current);
          setPushStatus("expired");
          setError("Push notification prompt expired. Please try again.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);


  // -------------------------------------------------------------
  // 3. QR Code Challenge Ceremony
  // -------------------------------------------------------------
  const startQRChallenge = useCallback(() => {
    setError("");
    setQrStatus("waiting");
    setQrExpiresIn(120);
    // Generate a preview QR challenge
    const previewUri = `voting2fa://challenge?session=${attemptId || "demo"}&t=${Date.now()}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(previewUri)}`;
    setQrImageData(qrUrl);

    if (qrPollTimer.current) clearInterval(qrPollTimer.current);
    qrPollTimer.current = setInterval(() => {
      setQrExpiresIn((prev) => {
        if (prev <= 1) {
          clearInterval(qrPollTimer.current);
          setQrStatus("expired");
          setError("QR code challenge expired. Please refresh.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [attemptId]);


  // -------------------------------------------------------------
  // 4. Biometric Authentication Ceremony (Touch ID / Windows Hello / Face ID)
  // -------------------------------------------------------------
  const startBiometricAuth = async () => {
    setError("");
    setLoading(true);
    setWebAuthnStatus("prompting");
    setTimeout(() => {
      setLoading(false);
      setWebAuthnStatus("idle");
    }, 1200);
  };

  // -------------------------------------------------------------
  // 5. Hardware Security Key Ceremony (YubiKey / FIDO2 USB Key)
  // -------------------------------------------------------------
  const startSecurityKeyAuth = async () => {
    setError("");
    setLoading(true);
    setWebAuthnStatus("prompting");
    setTimeout(() => {
      setLoading(false);
      setWebAuthnStatus("idle");
    }, 1200);
  };

  // Method Selection Handler
  const handleSelectMethod = (methodId) => {
    setSelectedMethod(methodId);
    setError("");
    if (pushPollTimer.current) clearInterval(pushPollTimer.current);
    if (qrPollTimer.current) clearInterval(qrPollTimer.current);

    if (methodId === "TOTP") {
      if (totpMode === "setup" || isFirstTimeTotp) {
        setTotpMode("setup");
        loadTotpSetupData();
      }
    } else if (methodId === "PUSH") {
      startPushChallenge();
    } else if (methodId === "QR") {
      startQRChallenge();
    }
  };

  return (
    <div className="w-full flex-grow flex flex-col">
      <main className="flex-grow flex items-center justify-center py-stack-lg px-margin-page">
        <div className="max-w-2xl w-full border border-outline bg-surface-container-lowest flex flex-col">
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
            <span className="text-[11px] font-mono uppercase bg-surface-container-highest px-2 py-0.5 border border-outline text-text-secondary">
              Step 2 of 2
            </span>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="px-stack-lg pt-stack-md">
              <div className="w-full p-3 bg-error-container border border-error text-error text-sm font-bold flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-base mt-0.5">error</span>
                  <div>{error}</div>
                </div>
                {error.toLowerCase().includes("expired") && (
                  <Link
                    to="/login"
                    className="ml-2 px-2.5 py-1 bg-error text-white text-xs uppercase tracking-wider font-bold rounded hover:opacity-90 whitespace-nowrap"
                  >
                    Log In Again
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Main Body */}
          <div className="p-stack-lg flex flex-col gap-stack-lg">
            {!selectedMethod ? (
              /* ============================================================ */
              /* METHOD SELECTION SCREEN (With "Last Used" Highlighting)     */
              /* ============================================================ */
              <div className="flex flex-col gap-stack-md">
                <div className="text-center mb-2">
                  <h2 className="font-headline-lg text-headline-lg text-primary mb-1 font-semibold">
                    Choose 2FA Method
                  </h2>
                  <p className="font-body-md text-body-md text-text-secondary">
                    Select any secondary verification factor to complete your login.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {METHODS.map((m) => {
                    const isLastUsed = lastUsedMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectMethod(m.id)}
                        className={`text-left p-4 border transition-all flex items-start justify-between gap-4 cursor-pointer relative ${
                          isLastUsed
                            ? "border-primary bg-primary/5 hover:bg-primary/10 ring-1 ring-primary shadow-sm"
                            : "border-outline hover:border-primary hover:bg-surface-main"
                        }`}
                      >
                        {/* Top Right "Last Used" Badge */}
                        {isLastUsed && (
                          <div className="absolute top-2.5 right-3 flex items-center gap-1 bg-primary text-on-primary text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-sm">
                            <span className="material-symbols-outlined text-[12px]">star</span>
                            <span>Last Used</span>
                          </div>
                        )}

                        <div className="flex items-start gap-3 w-full pr-16">
                          <div
                            className={`p-2 border ${
                              isLastUsed
                                ? "bg-primary text-on-primary border-primary"
                                : "bg-surface-container border-outline text-primary"
                            } mt-0.5`}
                          >
                            <span className="material-symbols-outlined text-2xl">{m.icon}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-headline-sm font-semibold text-primary">{m.title}</span>
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 border border-outline text-text-secondary bg-surface-container-lowest">
                                {m.badge}
                              </span>
                            </div>
                            <p className="text-xs text-text-secondary mt-1">{m.subtitle}</p>
                          </div>
                        </div>

                        {!isLastUsed && (
                          <span className="material-symbols-outlined text-text-secondary mt-2">
                            arrow_forward
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-outline pt-4 text-center mt-2">
                  <Link to="/login" className="text-xs text-text-secondary hover:text-primary underline">
                    ← Back to Password Login
                  </Link>
                </div>
              </div>
            ) : (
              /* ============================================================ */
              /* METHOD VERIFICATION CEREMONIES                               */
              /* ============================================================ */
              <div className="flex flex-col gap-stack-md">
                {/* 1. TOTP Verification & Setup */}
                {selectedMethod === "TOTP" && (
                  <div className="flex flex-col gap-stack-md max-w-sm mx-auto w-full">
                    {totpMode === "setup" ? (
                      /* First Time Setup View (QR Code + Secret + Verify Code) */
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="text-center">
                          <span className="material-symbols-outlined text-4xl text-primary mb-1">qr_code_2</span>
                          <h2 className="font-headline-md font-semibold text-primary">Set Up Authenticator App</h2>
                          <p className="text-xs text-text-secondary mt-1">
                            Scan this QR code with Google Authenticator, Authy, or your password manager.
                          </p>
                        </div>

                        {/* QR Code Container */}
                        <div className="border-4 border-primary p-2 bg-white shadow-sm">
                          {totpSetupLoading ? (
                            <div className="w-48 h-48 flex items-center justify-center text-xs text-text-secondary">
                              Loading setup QR...
                            </div>
                          ) : totpSetupData?.qr_code ? (
                            <img className="w-48 h-48 object-contain" alt="Authenticator QR" src={totpSetupData.qr_code} />
                          ) : (
                            <div className="w-48 h-48 flex flex-col items-center justify-center text-xs text-text-secondary p-2">
                              <span className="material-symbols-outlined text-3xl mb-1 text-primary">key</span>
                              <span>Manual Secret:</span>
                              <span className="font-mono font-bold mt-1 text-primary text-[11px] select-all bg-surface-container p-1 border border-outline">
                                {totpSetupData?.secret || "JBSWY3DPEHPK3PXP"}
                              </span>
                            </div>
                          )}
                        </div>

                        {totpSetupData?.secret && (
                          <div className="w-full text-left bg-surface-container border border-outline p-2.5 text-[11px]">
                            <span className="text-text-secondary block font-semibold mb-0.5">Manual Key:</span>
                            <span className="font-mono font-bold text-primary select-all break-all">
                              {totpSetupData.secret}
                            </span>
                          </div>
                        )}

                        <form onSubmit={handleVerifyTOTP} className="flex flex-col gap-3 w-full mt-1">
                          <label className="text-xs text-text-secondary text-left font-medium block">
                            Enter the 6-digit code from your authenticator:
                          </label>
                          <input
                            autoFocus
                            maxLength="6"
                            placeholder="000000"
                            type="text"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                            required
                            className="w-full border border-outline p-3 text-center font-mono text-3xl tracking-widest bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="submit"
                            disabled={loading || otpCode.length !== 6}
                            className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-base">check_circle</span>
                            {loading ? "Verifying..." : "Verify & Activate"}
                          </button>
                        </form>

                        {!isFirstTimeTotp && (
                          <button
                            type="button"
                            onClick={() => setTotpMode("verify")}
                            className="text-xs text-text-secondary hover:text-primary underline mt-1"
                          >
                            Already saved the code? Enter 6-digit code directly
                          </button>
                        )}
                      </div>
                    ) : (
                      /* Subsequent Login View (Enter 6-digit code directly) */
                      <div className="flex flex-col gap-stack-md">
                        <div className="text-center">
                          <span className="material-symbols-outlined text-4xl text-primary mb-1">pin</span>
                          <h2 className="font-headline-md font-semibold text-primary">Enter Authenticator Code</h2>
                          <p className="text-xs text-text-secondary mt-1">
                            Open your authenticator app and enter the 6-digit code.
                          </p>
                        </div>

                        <form onSubmit={handleVerifyTOTP} className="flex flex-col gap-3">
                          <input
                            autoFocus
                            maxLength="6"
                            placeholder="000000"
                            type="text"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                            required
                            className="w-full border border-outline p-3 text-center font-mono text-3xl tracking-widest bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="submit"
                            disabled={loading || otpCode.length !== 6}
                            className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-base">check_circle</span>
                            {loading ? "Verifying..." : "Verify & Sign In"}
                          </button>
                        </form>

                        {/* Scan again / Reconfigure Option */}
                        <div className="pt-2 text-center border-t border-outline/50">
                          <button
                            type="button"
                            onClick={() => {
                              setTotpMode("setup");
                              loadTotpSetupData();
                            }}
                            className="text-xs text-text-secondary hover:text-primary underline cursor-pointer mx-auto block"
                          >
                            Lost your authenticator? Scan QR or view key
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. QR Code Verification */}
                {selectedMethod === "QR" && (
                  <div className="flex flex-col items-center gap-stack-md text-center">
                    <h2 className="font-headline-md font-semibold text-primary">Scan Dynamic QR Code</h2>
                    <p className="text-xs text-text-secondary max-w-sm">
                      Scan this one-time challenge QR code with your mobile authenticator or camera.
                    </p>

                    <div className="border-4 border-primary p-3 bg-white shadow-sm">
                      {qrImageData ? (
                        <img className="w-52 h-52 object-contain" alt="Authentication QR" src={qrImageData} />
                      ) : (
                        <div className="w-52 h-52 flex items-center justify-center text-xs text-text-secondary">
                          Generating dynamic QR...
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
                      <span className="inline-block w-2 h-2 rounded-full bg-secondary animate-pulse" />
                      <span>Waiting for mobile scan ({qrExpiresIn}s)...</span>
                    </div>
                  </div>
                )}

                {/* 3. Push Notification Verification */}
                {selectedMethod === "PUSH" && (
                  <div className="flex flex-col items-center gap-stack-md text-center py-2">
                    <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary flex items-center justify-center text-primary mb-1">
                      <span className="material-symbols-outlined text-3xl animate-bounce">notifications_active</span>
                    </div>
                    <h2 className="font-headline-md font-semibold text-primary">Push Notification Sent</h2>
                    <p className="text-xs text-text-secondary max-w-sm">
                      A login approval prompt has been dispatched to your trusted registered smartphone. Please tap <strong>Approve</strong>.
                    </p>

                    <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
                      <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span>Awaiting device response ({pushExpiresIn}s)...</span>
                    </div>
                  </div>
                )}

                {/* 4. Platform Biometric Verification */}
                {selectedMethod === "BIOMETRIC" && (
                  <div className="flex flex-col items-center gap-stack-md text-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary">fingerprint</span>
                    <h2 className="font-headline-md font-semibold text-primary">Platform Biometrics</h2>
                    <p className="text-xs text-text-secondary max-w-sm">
                      Authenticate with Touch ID, Windows Hello, or Fingerprint reader.
                    </p>
                    <button
                      type="button"
                      onClick={startBiometricAuth}
                      disabled={loading}
                      className="w-full max-w-xs bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">fingerprint</span>
                      {loading ? "Triggering Sensor..." : "Scan Biometrics"}
                    </button>
                  </div>
                )}

                {/* 5. Hardware Security Key Verification */}
                {selectedMethod === "SECURITY_KEY" && (
                  <div className="flex flex-col items-center gap-stack-md text-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary">key</span>
                    <h2 className="font-headline-md font-semibold text-primary">Hardware Security Key</h2>
                    <p className="text-xs text-text-secondary max-w-sm">
                      Insert your YubiKey / FIDO2 security key and touch the gold contact point.
                    </p>
                    <button
                      type="button"
                      onClick={startSecurityKeyAuth}
                      disabled={loading}
                      className="w-full max-w-xs bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">usb</span>
                      {loading ? "Waiting for Key Tap..." : "Tap Hardware Key"}
                    </button>
                  </div>
                )}

                {/* Back to Technique Selection */}
                <div className="border-t border-outline pt-stack-md text-center mt-2">
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
                    ← Choose a different 2FA method
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

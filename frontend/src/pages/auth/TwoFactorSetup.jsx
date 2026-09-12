import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  listUserMethods,
  getSetup2FA,
  confirmSetup2FA,
  enrollPushDevice,
  enrollQRRequest,
  enrollQRStatus,
  getBiometricRegisterOptions,
  verifyBiometricRegistration,
  getMe,
} from "../../services/api";
import { performWebAuthnRegistration } from "../../services/webauthn";

function formatSecret(secret) {
  if (!secret) return "";
  return secret.match(/.{1,4}/g)?.join(" ") || secret;
}

const METHODS = [
  {
    id: "TOTP",
    title: "Authenticator App (TOTP)",
    subtitle: "6-digit time-based code from Google Authenticator, Authy, etc.",
    icon: "pin",
    badge: "6-Digit Code",
  },
  {
    id: "QR",
    title: "QR Code Login",
    subtitle: "Scan a dynamic screen challenge with your paired mobile phone to approve",
    icon: "qr_code_2",
    badge: "Mobile Scan",
  },
  {
    id: "PUSH",
    title: "Trusted Device Approval",
    subtitle: "Receive and approve login prompts on this or another registered browser",
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

export default function TwoFactorSetup({ onAuthSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();

  const initialTab = location.state?.initialTab || null;
  const [selectedTechnique, setSelectedTechnique] = useState(initialTab);

  const [methodsStatus, setMethodsStatus] = useState({});
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // 1. TOTP State
  const [code, setCode] = useState("");
  const [totpQrCode, setTotpQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [copied, setCopied] = useState(false);

  // 2. QR Enrollment State
  const [qrEnrollData, setQrEnrollData] = useState(null);
  const [qrEnrollLoading, setQrEnrollLoading] = useState(false);
  const qrEnrollPollTimer = useRef(null);

  // 3. Push State
  const [deviceName, setDeviceName] = useState(() => {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows PC (Chrome)";
    if (ua.includes("Mac")) return "MacBook (Safari)";
    if (ua.includes("Linux")) return "Linux Desktop (Firefox)";
    return "My Trusted Browser";
  });

  // Fetch current user's enrolled methods
  const loadMethods = useCallback(async () => {
    try {
      const res = await listUserMethods();
      const methodsList = res.data?.data?.methods || [];
      const statusMap = {};
      methodsList.forEach((m) => {
        statusMap[m.method] = m.is_enabled;
      });
      setMethodsStatus(statusMap);
    } catch (_err) {
      // Setup session might be active
    }
  }, []);

  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  // Clean up QR enrollment polling timer on unmount
  useEffect(() => {
    return () => {
      if (qrEnrollPollTimer.current) clearInterval(qrEnrollPollTimer.current);
    };
  }, []);

  // 1. TOTP Setup Loader
  const loadTotpSetup = useCallback(async () => {
    try {
      const res = await getSetup2FA();
      if (res.data?.data?.qr_code) setTotpQrCode(res.data.data.qr_code);
      if (res.data?.data?.secret) setTotpSecret(res.data.data.secret);
    } catch (_err) {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (selectedTechnique === "TOTP" && !totpQrCode) {
      loadTotpSetup();
    }
  }, [selectedTechnique, totpQrCode, loadTotpSetup]);

  const handleCopy = () => {
    if (!totpSecret) return;
    navigator.clipboard.writeText(totpSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 2. Start QR Enrollment Ceremony
  const startQREnrollment = useCallback(async () => {
    setError("");
    setSuccessMsg("");
    setQrEnrollLoading(true);
    if (qrEnrollPollTimer.current) clearInterval(qrEnrollPollTimer.current);

    try {
      const res = await enrollQRRequest();
      const data = res.data?.data;
      if (data) {
        setQrEnrollData(data);

        // Start polling for phone scan & pairing
        qrEnrollPollTimer.current = setInterval(async () => {
          try {
            const statusRes = await enrollQRStatus(data.token);
            const statusData = statusRes.data?.data;
            if (statusData?.status === "COMPLETED") {
              clearInterval(qrEnrollPollTimer.current);
              setSuccessMsg(
                `Mobile device "${statusData.device_name || "Phone"}" paired successfully! QR Code Login is now enabled. You can enroll additional methods below or proceed to log in.`
              );
              setSelectedTechnique(null);
              setQrEnrollData(null);
              loadMethods();
            } else if (statusData?.status === "EXPIRED") {
              clearInterval(qrEnrollPollTimer.current);
              setError("QR enrollment challenge expired. Please generate a new code.");
            }
          } catch (_err) {
            // Keep polling
          }
        }, 2000);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to initiate QR enrollment challenge.");
    } finally {
      setQrEnrollLoading(false);
    }
  }, [loadMethods]);

  useEffect(() => {
    if (selectedTechnique === "QR" && !qrEnrollData) {
      startQREnrollment();
    }
  }, [selectedTechnique, qrEnrollData, startQREnrollment]);

  // Activate TOTP Submission
  const handleActivateTotp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const token = code.replace(/\s/g, "");
    if (token.length !== 6) {
      setError("Please enter a valid 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      await confirmSetup2FA(token);
      setCode("");
      setSelectedTechnique(null);
      setSuccessMsg(
        "Authenticator App (TOTP) successfully enrolled and enabled! You can now enroll additional authentication methods below or proceed to log in."
      );
      await loadMethods();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to confirm TOTP setup.");
    } finally {
      setLoading(false);
    }
  };

  // Activate Push Submission
  const handleActivatePush = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const name = deviceName.trim() || "Trusted Device";
      const res = await enrollPushDevice(name);
      const data = res.data?.data;
      if (data?.device_identifier) {
        localStorage.setItem("voting_trusted_device_id", data.device_identifier);
        localStorage.setItem("voting_trusted_device_secret", data.device_secret || "");
        localStorage.setItem("voting_trusted_device_name", name);
      }
      setSelectedTechnique(null);
      setSuccessMsg(`Trusted Device "${name}" successfully enrolled and enabled! You can enroll additional methods below or proceed to log in.`);
      await loadMethods();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to enroll push device.");
    } finally {
      setLoading(false);
    }
  };

  // Activate Biometric Submission
  const handleActivateBiometric = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const optionsRes = await getBiometricRegisterOptions();
      const options = optionsRes.data?.data;
      const credential = await performWebAuthnRegistration(options);
      await verifyBiometricRegistration(credential);
      setSelectedTechnique(null);
      setSuccessMsg("Platform Biometric Authenticator successfully enrolled and enabled! You can enroll additional methods below or proceed to log in.");
      await loadMethods();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to register biometric authenticator.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-grow flex flex-col">
      <main className="flex-grow flex items-center justify-center py-stack-lg px-margin-page">
        <div className="max-w-3xl w-full border border-outline bg-surface-container-lowest flex flex-col">
          {/* Header */}
          <div className="bg-surface-container border-b border-outline p-stack-md flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                security
              </span>
              <h1 className="font-headline-md text-headline-md text-primary m-0 uppercase tracking-tight font-semibold">
                Two-Factor Authentication Setup
              </h1>
            </div>
            <Link
              to="/dashboard"
              className="text-xs text-text-secondary hover:text-primary font-bold uppercase tracking-wider flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">dashboard</span>
              Dashboard
            </Link>
          </div>

          {/* Alerts */}
          <div className="px-stack-lg pt-stack-md">
            {error && (
              <div className="w-full p-3 bg-error-container border border-error text-error text-sm font-bold flex items-start gap-2">
                <span className="material-symbols-outlined text-base">error</span>
                <div>{error}</div>
              </div>
            )}
            {successMsg && (
              <div className="w-full p-3 bg-secondary-container/20 border border-secondary text-secondary text-sm font-bold flex items-start gap-2">
                <span className="material-symbols-outlined text-base">check_circle</span>
                <div>{successMsg}</div>
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="p-stack-lg flex flex-col gap-stack-lg">
            {/* STEP 1: DASHBOARD VIEW (ALL 4 METHODS) */}
            {!selectedTechnique ? (
              <div className="flex flex-col gap-stack-md">
                <div className="text-center mb-1">
                  <h2 className="font-headline-lg text-headline-lg text-primary mb-1 font-semibold">
                    Manage 2FA Authentication Methods
                  </h2>
                  <p className="font-body-md text-body-md text-text-secondary max-w-xl mx-auto text-xs sm:text-sm">
                    A single voter account can enroll multiple authentication methods simultaneously. At login, you can choose any one of your enrolled methods.
                  </p>
                </div>

                {/* Enrolled Methods Count Summary */}
                {(() => {
                  const enabledCount = Object.values(methodsStatus).filter(Boolean).length;
                  return (
                    <div className="bg-surface-container border border-outline p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-xl">shield</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          Enrollment Status: <span className="font-mono text-secondary">{enabledCount} of 4</span> Methods Active
                        </span>
                      </div>
                      {enabledCount > 0 && (
                        <span className="text-[11px] font-bold text-secondary flex items-center gap-1 uppercase">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Ready for Login
                        </span>
                      )}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 gap-3">
                  {METHODS.map((m) => {
                    const isEnabled = !!methodsStatus[m.id];
                    return (
                      <div
                        key={m.id}
                        className={`p-4 border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                          isEnabled
                            ? "border-secondary/50 bg-secondary-container/5"
                            : "border-outline bg-surface-container-lowest hover:border-primary"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2.5 border mt-0.5 ${
                              isEnabled
                                ? "bg-secondary/10 border-secondary text-secondary"
                                : "bg-surface-container border-outline text-primary"
                            }`}
                          >
                            <span className="material-symbols-outlined text-2xl">{m.icon}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-headline-sm font-semibold text-primary">{m.title}</span>
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 border border-outline text-text-secondary">
                                {m.badge}
                              </span>
                            </div>
                            <p className="text-xs text-text-secondary mt-1">{m.subtitle}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {isEnabled ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/10 border border-secondary text-secondary text-xs font-bold uppercase tracking-wider">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Enabled
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTechnique(m.id);
                                  setError("");
                                  setSuccessMsg("");
                                }}
                                className="px-2.5 py-1.5 border border-outline text-text-secondary hover:text-primary hover:border-primary text-xs font-bold uppercase tracking-wider transition-none cursor-pointer"
                                title="Re-configure / Add Device"
                              >
                                Re-Enroll
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTechnique(m.id);
                                setError("");
                                setSuccessMsg("");
                              }}
                              className="px-4 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-wider border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <span className="material-symbols-outlined text-sm">add_circle</span>
                              Set Up
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Actions */}
                <div className="border-t border-outline pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 mt-2">
                  <Link
                    to="/dashboard"
                    className="text-xs text-text-secondary hover:text-primary underline font-semibold flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    Voter Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="w-full sm:w-auto px-6 py-2.5 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <span>Proceed to Login</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 2: CONFIGURE SELECTED METHOD */
              <div className="flex flex-col gap-stack-md">
                {/* 1. TOTP Setup Form */}
                {selectedTechnique === "TOTP" && (
                  <div className="flex flex-col gap-stack-md">
                    <div className="border-b border-outline pb-2 text-center">
                      <span className="material-symbols-outlined text-4xl text-primary mb-1">pin</span>
                      <h2 className="font-headline-md font-semibold text-primary">Authenticator App (TOTP) Setup</h2>
                      <p className="text-xs text-text-secondary">
                        Scan the QR code in Google Authenticator, Authy, or 1Password.
                      </p>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className="border-4 border-primary p-2 bg-white mb-2 shadow-sm">
                        {totpQrCode ? (
                          <img className="w-48 h-48 object-contain" alt="2FA QR Code" src={totpQrCode} />
                        ) : (
                          <div className="w-48 h-48 flex items-center justify-center text-xs text-text-secondary">
                            Loading QR code...
                          </div>
                        )}
                      </div>

                      {/* Manual Key */}
                      <div className="w-full max-w-sm flex items-center justify-between border border-outline bg-surface-main p-2 text-xs font-mono">
                        <span className="truncate">{totpSecret ? formatSecret(totpSecret) : "Loading secret..."}</span>
                        <button
                          onClick={handleCopy}
                          disabled={!totpSecret}
                          className="text-secondary hover:text-primary flex items-center ml-2 cursor-pointer"
                          title="Copy Key"
                        >
                          <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleActivateTotp} className="flex flex-col gap-2 mt-2 max-w-sm mx-auto w-full">
                      <label className="text-xs font-bold uppercase text-primary text-center" htmlFor="verification_code">
                        Enter 6-Digit Code from App
                      </label>
                      <input
                        id="verification_code"
                        maxLength="6"
                        placeholder="000000"
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        required
                        className="w-full border border-outline p-2.5 text-center font-mono text-2xl tracking-widest bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-1 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        {loading ? "Activating..." : "Confirm & Activate TOTP"}
                      </button>
                    </form>
                  </div>
                )}

                {/* 2. QR Code Enrollment Ceremony */}
                {selectedTechnique === "QR" && (
                  <div className="flex flex-col gap-stack-md text-center py-2">
                    <div className="border-b border-outline pb-2">
                      <span className="material-symbols-outlined text-4xl text-primary mb-1">qr_code_2</span>
                      <h2 className="font-headline-md font-semibold text-primary">Pair Mobile Device for QR Login</h2>
                      <p className="text-xs text-text-secondary max-w-md mx-auto mt-1">
                        Scan this pairing QR code with your phone camera. Your phone will register an authorized credential with your voter account.
                      </p>
                    </div>

                    {qrEnrollLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-2">progress_activity</span>
                        <p className="text-sm text-text-secondary">Generating enrollment challenge...</p>
                      </div>
                    ) : qrEnrollData ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="border-4 border-primary p-2 bg-white shadow-sm">
                          <img className="w-52 h-52 object-contain" alt="QR Enrollment Challenge" src={qrEnrollData.qr_code} />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-secondary font-bold uppercase tracking-wider animate-pulse">
                          <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                          Waiting for phone to scan and pair...
                        </div>

                        <div className="p-3 bg-surface-container border border-outline text-xs text-text-secondary max-w-sm text-left">
                          <div><strong>Step 1:</strong> Point your phone camera at this QR code.</div>
                          <div className="mt-1"><strong>Step 2:</strong> Tap the prompt on your phone to open the pairing screen.</div>
                          <div className="mt-1"><strong>Step 3:</strong> Tap "Authorize This Device" on your phone.</div>
                        </div>

                        <button
                          type="button"
                          onClick={startQREnrollment}
                          className="text-xs text-text-secondary hover:text-primary underline mt-1 cursor-pointer"
                        >
                          ↻ Refresh QR Enrollment Code
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* 3. Trusted Device Enrollment */}
                {selectedTechnique === "PUSH" && (
                  <div className="flex flex-col gap-stack-md py-2 max-w-sm mx-auto w-full">
                    <div className="border-b border-outline pb-2 text-center">
                      <span className="material-symbols-outlined text-4xl text-primary mb-1">notifications_active</span>
                      <h2 className="font-headline-md font-semibold text-primary">Register Trusted Device</h2>
                      <p className="text-xs text-text-secondary mt-1">
                        Register this browser as a trusted device to receive and approve login requests.
                      </p>
                    </div>

                    <form onSubmit={handleActivatePush} className="flex flex-col gap-3 mt-2">
                      <div>
                        <label className="text-xs font-bold uppercase text-primary block mb-1">
                          Device Name / Label
                        </label>
                        <input
                          type="text"
                          value={deviceName}
                          onChange={(e) => setDeviceName(e.target.value)}
                          placeholder="e.g., Shabnam's Laptop"
                          required
                          className="w-full border border-outline p-2.5 text-sm bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-2 disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        <span className="material-symbols-outlined text-base">phonelink_setup</span>
                        {loading ? "Registering Device..." : "Register as Trusted Device"}
                      </button>
                    </form>
                  </div>
                )}

                {/* 4. Platform Biometrics Enrollment */}
                {selectedTechnique === "BIOMETRIC" && (
                  <div className="flex flex-col gap-stack-md text-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary mx-auto">fingerprint</span>
                    <div>
                      <h2 className="font-headline-md font-semibold text-primary">Platform Biometrics</h2>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1">
                        Register Windows Hello, Touch ID, or your platform authenticator using genuine WebAuthn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleActivateBiometric}
                      disabled={loading}
                      className="w-full max-w-xs mx-auto bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-2 disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined text-base">fingerprint</span>
                      {loading ? "Waiting for Biometric Scan..." : "Enroll Platform Biometrics"}
                    </button>
                  </div>
                )}

                {/* Back to Overview */}
                <div className="border-t border-outline pt-stack-md text-center mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTechnique(null);
                      setError("");
                      setSuccessMsg("");
                      if (qrEnrollPollTimer.current) clearInterval(qrEnrollPollTimer.current);
                      loadMethods();
                    }}
                    className="font-label-md text-label-md text-text-secondary hover:text-primary underline underline-offset-4 cursor-pointer"
                  >
                    ← Back to 2FA Methods List
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

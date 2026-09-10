import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  getSetup2FA,
  confirmSetup2FA,
  enrollPushDevice,
  createPushRequest,
  respondToPush,
  enrollQR,
  createQRChallenge,
  respondToQR,
  getBiometricRegisterOptions,
  verifyBiometricRegistration,
  getSecurityKeyRegisterOptions,
  verifySecurityKeyRegistration,
  verifyTOTP,
  login as apiLogin,
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
    subtitle: "Google Authenticator, Authy, or Microsoft Authenticator",
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
    title: "Push Notification Device",
    subtitle: "Register a trusted smartphone to receive real-time login prompts",
    icon: "notifications_active",
    badge: "Device Prompt",
  },
  {
    id: "BIOMETRIC",
    title: "Platform Biometrics",
    subtitle: "Touch ID, Windows Hello, Fingerprint, or Face Unlock",
    icon: "fingerprint",
    badge: "WebAuthn",
  },
  {
    id: "SECURITY_KEY",
    title: "Hardware Security Key",
    subtitle: "Physical YubiKey, Google Titan Key, or FIDO2 USB token",
    icon: "key",
    badge: "FIDO2",
  },
];

export default function TwoFactorSetup({ onAuthSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();

  const initialTab = location.state?.initialTab || null;
  const [selectedTechnique, setSelectedTechnique] = useState(initialTab);

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // TOTP State
  const [code, setCode] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);

  // Push State
  const [deviceName, setDeviceName] = useState("My Trusted Device");

  const loadTotpSetup = useCallback(async () => {
    try {
      const res = await getSetup2FA();
      if (res.data?.data?.qr_code) setQrCode(res.data.data.qr_code);
      if (res.data?.data?.secret) setSecret(res.data.data.secret);
    } catch (_err) {
      // Setup session might have expired
    }
  }, []);

  // Fetch TOTP setup if TOTP is selected
  useEffect(() => {
    if (selectedTechnique === "TOTP" && !qrCode) {
      loadTotpSetup();
    }
  }, [selectedTechnique, qrCode, loadTotpSetup]);

  const handleCopy = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Seamless auto-login and transition directly to dashboard as signed in
  const handleSuccessRedirect = async (methodId, tokenValue = null) => {
    const username = location.state?.credentials?.username || sessionStorage.getItem("pending_reg_username") || sessionStorage.getItem("auth_username") || "";
    const password = location.state?.credentials?.password || sessionStorage.getItem("pending_reg_password");

    if (methodId) {
      if (username) {
        localStorage.setItem(`last_used_2fa_${username}`, methodId);
      }
      localStorage.setItem("last_used_2fa", methodId);
    }

    if (username && password) {
      try {
        const loginRes = await apiLogin(username, password);
        const data = loginRes.data?.data || {};
        const attemptId = data.attempt_id;

        // Auto-finalize 2FA for the method that was just configured
        if (attemptId) {
          if (methodId === "TOTP" && tokenValue) {
            try {
              await verifyTOTP(tokenValue, attemptId);
            } catch (_tErr) {
              // Ignore if already verified
            }
          } else if (methodId === "QR") {
            try {
              const qrRes = await createQRChallenge(attemptId);
              const qrData = qrRes.data?.data;
              if (qrData?.request_id && qrData?.challenge) {
                await respondToQR(qrData.request_id, qrData.challenge, "approve");
              }
            } catch (_qErr) {
              // Ignore
            }
          } else if (methodId === "PUSH") {
            try {
              const pushRes = await createPushRequest(attemptId);
              const pushReqId = pushRes.data?.data?.request_id;
              if (pushReqId) {
                await respondToPush(pushReqId, "approve");
              }
            } catch (_pErr) {
              // Ignore
            }
          }
        }

        // Clean up temporary registration credentials
        sessionStorage.removeItem("pending_reg_username");
        sessionStorage.removeItem("pending_reg_password");
        sessionStorage.removeItem("auth_attempt_id");

        // Verify session and update user in state
        try {
          const meRes = await getMe();
          const meData = meRes.data?.data;
          if (meData && onAuthSuccess) {
            onAuthSuccess({
              studentId: meData.username,
              username: meData.username,
              role: meData.role === "voter" ? "student" : meData.role,
              hasVoted: !!meData.has_voted,
            });

            // Automatically enable multi-factor capability (QR & Push) so voter can freely use them anytime
            try {
              await enrollQR();
              await enrollPushDevice("My Mobile Device");
            } catch (_enErr) {
              // Ignore
            }
          }
        } catch (_mErr) {
          // Ignore
        }

        setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 800);
        return;
      } catch (_err) {
        // Fallback to login if auto-login fails
      }
    }

    // Default fallback
    setTimeout(() => {
      navigate("/login", {
        state: {
          successBanner: "Two-factor authentication configured! Please log in to your account.",
        },
      });
    }, 1000);
  };

  // 1. Activate TOTP
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
      setSuccessMsg("Authenticator App (TOTP) activated! Logging you in...");
      await handleSuccessRedirect("TOTP", token);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to confirm TOTP setup.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Activate QR
  const handleActivateQR = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await enrollQR();
      setSuccessMsg("QR Code authentication enabled! Proceeding to 2FA verification...");
      await handleSuccessRedirect("QR");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to enable QR code authentication.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Activate Push Device
  const handleActivatePush = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await enrollPushDevice(deviceName.trim() || "Trusted Device");
      setSuccessMsg("Push notification device enrolled! Proceeding to 2FA verification...");
      await handleSuccessRedirect("PUSH");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to enroll push device.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Activate Biometric WebAuthn
  const handleActivateBiometric = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const optionsRes = await getBiometricRegisterOptions();
      const options = optionsRes.data?.data;
      const credential = await performWebAuthnRegistration(options);
      await verifyBiometricRegistration(credential);
      setSuccessMsg("Biometric sensor enrolled! Proceeding to 2FA verification...");
      await handleSuccessRedirect("BIOMETRIC");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to register biometric authenticator.");
    } finally {
      setLoading(false);
    }
  };

  // 5. Activate Security Key WebAuthn
  const handleActivateSecurityKey = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const optionsRes = await getSecurityKeyRegisterOptions();
      const options = optionsRes.data?.data;
      const credential = await performWebAuthnRegistration(options);
      await verifySecurityKeyRegistration(credential);
      setSuccessMsg("Hardware Security Key enrolled! Proceeding to 2FA verification...");
      await handleSuccessRedirect("SECURITY_KEY");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to register security key.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-grow flex flex-col">
      <main className="flex-grow flex items-center justify-center py-stack-lg px-margin-page">
        <div className="max-w-3xl w-full border border-outline bg-surface-container-lowest flex flex-col">
          {/* Header */}
          <div className="bg-surface-container border-b border-outline p-stack-md flex items-center">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                security
              </span>
              <h1 className="font-headline-md text-headline-md text-primary m-0 uppercase tracking-tight font-semibold">
                Two-Factor Authentication Setup
              </h1>
            </div>
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
            {/* STEP 1: SELECT TECHNIQUE */}
            {!selectedTechnique ? (
              <div className="flex flex-col gap-stack-md">
                <div className="text-center mb-2">
                  <h2 className="font-headline-lg text-headline-lg text-primary mb-1 font-semibold">
                    Select Your 2FA Technique
                  </h2>
                  <p className="font-body-md text-body-md text-text-secondary">
                    Choose which secondary factor method you would like to configure for your voter account.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedTechnique(m.id);
                        setError("");
                        setSuccessMsg("");
                      }}
                      className="text-left p-4 border border-outline hover:border-primary hover:bg-surface-main transition-all flex items-start justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-surface-container border border-outline text-primary mt-0.5">
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
                      <span className="material-symbols-outlined text-text-secondary mt-2">
                        arrow_forward
                      </span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-outline pt-4 text-center mt-2">
                  <Link to="/login" className="text-xs text-text-secondary hover:text-primary underline font-semibold">
                    ← Already configured? Log in here
                  </Link>
                </div>
              </div>
            ) : (
              /* STEP 2: CONFIGURE SELECTED TECHNIQUE */
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
                        {qrCode ? (
                          <img className="w-48 h-48 object-contain" alt="2FA QR Code" src={qrCode} />
                        ) : (
                          <div className="w-48 h-48 flex items-center justify-center text-xs text-text-secondary">
                            Loading QR code...
                          </div>
                        )}
                      </div>

                      {/* Manual Key */}
                      <div className="w-full max-w-sm flex items-center justify-between border border-outline bg-surface-main p-2 text-xs font-mono">
                        <span className="truncate">{secret ? formatSecret(secret) : "Loading secret..."}</span>
                        <button
                          onClick={handleCopy}
                          disabled={!secret}
                          className="text-secondary hover:text-primary flex items-center ml-2"
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
                        className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-1 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        {loading ? "Activating..." : "Confirm & Proceed to 2FA Verify"}
                      </button>
                    </form>
                  </div>
                )}

                {/* 2. QR Code Setup */}
                {selectedTechnique === "QR" && (
                  <div className="flex flex-col gap-stack-md text-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary mx-auto">qr_code_2</span>
                    <div>
                      <h2 className="font-headline-md font-semibold text-primary">QR Code Authentication</h2>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1">
                        When you log in, a one-time dynamic QR code will be generated for you to scan and approve with your phone.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleActivateQR}
                      disabled={loading}
                      className="w-full max-w-xs mx-auto bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">verified</span>
                      {loading ? "Enabling..." : "Enable & Proceed to 2FA Verify"}
                    </button>
                  </div>
                )}

                {/* 3. Push Notification Device Setup */}
                {selectedTechnique === "PUSH" && (
                  <div className="flex flex-col gap-stack-md py-2 max-w-sm mx-auto w-full">
                    <div className="border-b border-outline pb-2 text-center">
                      <span className="material-symbols-outlined text-4xl text-primary mb-1">notifications_active</span>
                      <h2 className="font-headline-md font-semibold text-primary">Push Notification Device</h2>
                      <p className="text-xs text-text-secondary">
                        Register a trusted device name to receive real-time push login prompts.
                      </p>
                    </div>

                    <form onSubmit={handleActivatePush} className="flex flex-col gap-3 mt-2">
                      <div>
                        <label className="text-xs font-bold uppercase text-primary block mb-1">
                          Trusted Device Name
                        </label>
                        <input
                          type="text"
                          value={deviceName}
                          onChange={(e) => setDeviceName(e.target.value)}
                          placeholder="e.g., iPhone 15 Pro, Work Laptop"
                          required
                          className="w-full border border-outline p-2.5 text-sm bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">phonelink_setup</span>
                        {loading ? "Enrolling..." : "Enroll & Proceed to 2FA Verify"}
                      </button>
                    </form>
                  </div>
                )}

                {/* 4. Platform Biometric Setup */}
                {selectedTechnique === "BIOMETRIC" && (
                  <div className="flex flex-col gap-stack-md text-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary mx-auto">fingerprint</span>
                    <div>
                      <h2 className="font-headline-md font-semibold text-primary">Platform Biometrics</h2>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1">
                        Register Touch ID, Windows Hello, Fingerprint, or Face Unlock using WebAuthn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleActivateBiometric}
                      disabled={loading}
                      className="w-full max-w-xs mx-auto bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">fingerprint</span>
                      {loading ? "Registering Sensor..." : "Enroll Sensor & Proceed to 2FA Verify"}
                    </button>
                  </div>
                )}

                {/* 5. Hardware Security Key Setup */}
                {selectedTechnique === "SECURITY_KEY" && (
                  <div className="flex flex-col gap-stack-md text-center py-4">
                    <span className="material-symbols-outlined text-5xl text-primary mx-auto">key</span>
                    <div>
                      <h2 className="font-headline-md font-semibold text-primary">Hardware Security Key</h2>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1">
                        Insert your USB/NFC hardware key (YubiKey or FIDO2 token) and tap the contact point to register.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleActivateSecurityKey}
                      disabled={loading}
                      className="w-full max-w-xs mx-auto bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">usb</span>
                      {loading ? "Waiting for Key Tap..." : "Enroll Key & Proceed to 2FA Verify"}
                    </button>
                  </div>
                )}

                {/* Back to Technique Selection */}
                <div className="border-t border-outline pt-stack-md text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTechnique(null);
                      setError("");
                      setSuccessMsg("");
                    }}
                    className="font-label-md text-label-md text-text-secondary hover:text-primary underline underline-offset-4"
                  >
                    ← Choose a different 2FA technique to set up
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

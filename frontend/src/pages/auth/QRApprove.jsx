import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { getQRDetails, respondToQR, getMe } from "../../services/api";

export default function QRApprove() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("request_id") || "";
  const challenge = searchParams.get("challenge") || "";

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("PENDING"); // PENDING | APPROVED | DENIED | EXPIRED
  const [qrDeviceId, setQrDeviceId] = useState("");
  const [qrDeviceSecret, setQrDeviceSecret] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // Check if user is logged in or has a registered QR/trusted device identifier
    const checkAuthAndDevice = async () => {
      try {
        const meRes = await getMe();
        if (meRes.data?.data) {
          setCurrentUser(meRes.data.data);
        }
      } catch (_err) {
        // Not logged in on phone
      }

      const devId =
        localStorage.getItem("voting_qr_device_id") ||
        localStorage.getItem("voting_trusted_device_id") ||
        "";
      const devSecret =
        localStorage.getItem("voting_qr_device_secret") ||
        localStorage.getItem("voting_trusted_device_secret") ||
        "";

      setQrDeviceId(devId);
      setQrDeviceSecret(devSecret);
    };

    checkAuthAndDevice();
  }, []);

  useEffect(() => {
    if (!requestId && !challenge) {
      setError("Invalid QR Code link. Missing request ID or challenge token.");
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getQRDetails(requestId, challenge);
        const data = res.data?.data;
        if (data) {
          setDetails(data);
          setStatus(data.status || "PENDING");
        }
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load QR challenge details or challenge has expired.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [requestId, challenge]);

  const handleRespond = async (action) => {
    setActionLoading(true);
    setError("");
    try {
      const devId = qrDeviceId || localStorage.getItem("voting_qr_device_id") || localStorage.getItem("voting_trusted_device_id") || null;
      const devSecret = qrDeviceSecret || localStorage.getItem("voting_qr_device_secret") || localStorage.getItem("voting_trusted_device_secret") || null;

      await respondToQR(requestId, challenge, action, devId, devSecret);
      setStatus(action === "approve" ? "APPROVED" : "DENIED");
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} login request.`);
    } finally {
      setActionLoading(false);
    }
  };

  const isDeviceEnrolled = !!(currentUser?.username || qrDeviceId);

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full border border-outline bg-surface-container-lowest shadow-lg flex flex-col">
        {/* Header */}
        <div className="bg-surface-container border-b border-outline p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary text-2xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              qr_code_scanner
            </span>
            <h1 className="font-headline-md text-headline-md text-primary m-0 uppercase tracking-tight font-semibold">
              QR Login Approval
            </h1>
          </div>
          <span className="text-[10px] font-mono uppercase bg-primary text-on-primary px-2 py-0.5 rounded font-bold">
            Mobile Verification
          </span>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5">
          {loading ? (
            <div className="text-center py-8">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-2">progress_activity</span>
              <p className="text-sm text-text-secondary">Verifying QR challenge...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col gap-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto border border-error">
                <span className="material-symbols-outlined text-3xl">error</span>
              </div>
              <div>
                <h2 className="font-bold text-error text-base">Unable to Process Request</h2>
                <p className="text-xs text-text-secondary mt-1">{error}</p>
              </div>
              <Link
                to="/login"
                className="mt-2 py-2 px-4 bg-surface-container border border-outline text-text-primary text-xs font-bold uppercase tracking-wider hover:bg-surface-container-high mx-auto"
              >
                Go to Login
              </Link>
            </div>
          ) : status === "APPROVED" ? (
            <div className="flex flex-col gap-4 text-center py-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto border-2 border-primary">
                <span className="material-symbols-outlined text-4xl">check_circle</span>
              </div>
              <div>
                <h2 className="font-headline-md text-primary font-bold">Login Approved!</h2>
                <p className="text-sm text-text-secondary mt-1">
                  You have approved login for <strong>{details?.username}</strong>.
                </p>
                <p className="text-xs text-text-secondary mt-2">
                  Your computer browser has now been authenticated and transitioned to your dashboard.
                </p>
              </div>
            </div>
          ) : status === "DENIED" ? (
            <div className="flex flex-col gap-4 text-center py-6">
              <div className="w-16 h-16 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto border-2 border-error">
                <span className="material-symbols-outlined text-4xl">cancel</span>
              </div>
              <div>
                <h2 className="font-headline-md text-error font-bold">Login Denied</h2>
                <p className="text-sm text-text-secondary mt-1">
                  The login request was denied and the computer session blocked.
                </p>
              </div>
            </div>
          ) : (
            /* Pending Approval View */
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary mb-2">
                  <span className="material-symbols-outlined text-2xl">shield_person</span>
                </div>
                <h2 className="font-headline-md text-primary font-semibold">
                  Approve Login Request?
                </h2>
                <p className="text-xs text-text-secondary mt-1">
                  A computer is requesting to sign in to the Secure Voting System with your account.
                </p>
              </div>

              {/* Request Details Card */}
              <div className="bg-surface-container border border-outline p-4 rounded flex flex-col gap-2.5 text-xs">
                <div className="flex justify-between items-center border-b border-outline/50 pb-2">
                  <span className="text-text-secondary font-medium">Account:</span>
                  <span className="font-bold text-primary font-mono text-sm">{details?.username}</span>
                </div>
                <div className="flex justify-between items-center border-b border-outline/50 pb-2">
                  <span className="text-text-secondary font-medium">Request Time:</span>
                  <span className="text-text-primary font-mono">{details?.created_at ? new Date(details.created_at).toLocaleTimeString() : "Just now"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-outline/50 pb-2">
                  <span className="text-text-secondary font-medium">Status:</span>
                  <span className="inline-flex items-center gap-1 text-secondary font-bold font-mono">
                    <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                    PENDING APPROVAL
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">Challenge ID:</span>
                  <span className="font-mono text-[11px] text-text-secondary truncate max-w-[180px]">{requestId}</span>
                </div>
              </div>

              {/* Device Enrollment Status */}
              {!isDeviceEnrolled ? (
                <div className="text-xs text-error bg-error/10 p-3 border border-error flex items-start gap-2">
                  <span className="material-symbols-outlined text-base mt-0.5">warning</span>
                  <div>
                    <strong>Unenrolled Device Warning:</strong> This phone has not been paired as an authorized device for this account. To authorize, first pair this phone in 2FA Setup on your computer.
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-text-secondary bg-surface-container-highest/50 p-2.5 border border-outline flex items-start gap-2">
                  <span className="material-symbols-outlined text-base text-primary mt-0.5">verified_user</span>
                  <span>
                    {currentUser?.username
                      ? `Authenticated as ${currentUser.username} on this mobile browser.`
                      : `Verified via authorized device token (${localStorage.getItem("voting_qr_device_name") || "Mobile Scanner"}).`}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 mt-1">
                <button
                  type="button"
                  onClick={() => handleRespond("approve")}
                  disabled={actionLoading || !isDeviceEnrolled}
                  className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  {actionLoading ? "Processing Approval..." : "Approve Login"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRespond("deny")}
                  disabled={actionLoading}
                  className="w-full bg-error-container text-error py-2.5 uppercase tracking-wider text-xs font-bold border border-error hover:bg-error hover:text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">block</span>
                  Deny Request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from "react";
import { getPendingPushRequests, respondToPush } from "../../services/api";

export default function TrustedDeviceModal() {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const pollTimer = useRef(null);

  const checkPending = useCallback(async () => {
    const deviceId = localStorage.getItem("voting_trusted_device_id");
    const deviceSecret = localStorage.getItem("voting_trusted_device_secret");

    // Only poll if device credentials exist or we can poll for user
    if (!deviceId) {
      setPendingRequests([]);
      return;
    }

    try {
      const res = await getPendingPushRequests(deviceId, deviceSecret);
      const list = res.data?.data || [];
      // Only keep actual PENDING requests
      const active = list.filter((r) => r.status === "PENDING");
      setPendingRequests(active);
    } catch (_err) {
      // Ignore polling errors (e.g. 401 when not logged in / no creds)
    }
  }, []);

  useEffect(() => {
    checkPending();
    pollTimer.current = setInterval(checkPending, 2500);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [checkPending]);

  const handleAction = async (requestId, action) => {
    setSubmitting(true);
    setActionError("");

    const deviceId = localStorage.getItem("voting_trusted_device_id");
    const deviceSecret = localStorage.getItem("voting_trusted_device_secret");

    try {
      await respondToPush(requestId, action, deviceId, deviceSecret);
      // Immediately remove this request from view
      setPendingRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      // Re-check pending
      setTimeout(checkPending, 400);
    } catch (err) {
      setActionError(err.response?.data?.message || `Failed to ${action} login request.`);
    } finally {
      setSubmitting(false);
    }
  };

  // No pending request -> no approval buttons shown at all
  if (pendingRequests.length === 0) {
    return null;
  }

  const currentReq = pendingRequests[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trusted-device-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="bg-surface-container-lowest border-2 border-primary max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 text-left">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline pb-3">
          <span className="material-symbols-outlined text-3xl text-primary animate-pulse">
            lock_open
          </span>
          <div>
            <h2
              id="trusted-device-modal-title"
              className="font-headline-md font-bold text-primary tracking-tight"
            >
              🔐 Login Request
            </h2>
            <p className="text-xs text-text-secondary">
              A login attempt is waiting for your approval.
            </p>
          </div>
        </div>

        {/* Action Error Alert */}
        {actionError && (
          <div className="p-2 bg-error/10 border border-error text-error text-xs font-bold">
            {actionError}
          </div>
        )}

        {/* Request Details */}
        <div className="bg-surface-container border border-outline p-4 flex flex-col gap-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary font-medium uppercase tracking-wider">Account:</span>
            <span className="font-mono text-sm font-bold text-primary">
              {currentReq.username}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-text-secondary font-medium uppercase tracking-wider">Device Prompt:</span>
            <span className="font-mono text-xs text-text-primary">
              {localStorage.getItem("voting_trusted_device_name") || "This Trusted Device"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-text-secondary font-medium uppercase tracking-wider">Status:</span>
            <span className="inline-flex items-center gap-1 font-bold text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-ping" />
              Waiting for Your Decision
            </span>
          </div>
        </div>

        {/* Actions: Approve vs Deny */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleAction(currentReq.request_id, "deny")}
            className="flex-1 px-4 py-3 border-2 border-error text-error hover:bg-error hover:text-white uppercase font-bold text-xs tracking-wider transition-none disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">close</span>
            <span>{submitting ? "Processing..." : "✕ Deny"}</span>
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => handleAction(currentReq.request_id, "approve")}
            className="flex-1 px-4 py-3 bg-secondary text-on-secondary hover:bg-secondary/90 uppercase font-bold text-xs tracking-wider transition-none disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
          >
            <span className="material-symbols-outlined text-base">check</span>
            <span>{submitting ? "Approving..." : "✓ Approve Login"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

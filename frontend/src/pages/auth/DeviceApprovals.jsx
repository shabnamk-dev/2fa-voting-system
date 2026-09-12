import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  getPendingPushRequests,
  respondToPush,
  enrollPushDevice,
  getMe,
} from "../../services/api";

export default function DeviceApprovals() {
  const [deviceId, setDeviceId] = useState(localStorage.getItem("voting_trusted_device_id") || "");
  const [deviceName, setDeviceName] = useState(localStorage.getItem("voting_trusted_device_name") || "Trusted Device");
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const pollTimer = useRef(null);

  // Load session or device
  useEffect(() => {
    const checkMe = async () => {
      try {
        const res = await getMe();
        if (res.data?.data) {
          setCurrentUser(res.data.data);
        }
      } catch (_err) {
        // Not logged in in this browser
      }
    };
    checkMe();
  }, []);

  const fetchPending = useCallback(async () => {
    const currentDevId = deviceId || localStorage.getItem("voting_trusted_device_id");
    if (!currentDevId && !currentUser) return;

    try {
      const res = await getPendingPushRequests(currentDevId || null);
      const list = res.data?.data || [];
      setPendingRequests(list);
    } catch (_err) {
      // Ignore polling errors
    }
  }, [currentUser, deviceId]);

  useEffect(() => {
    fetchPending();
    pollTimer.current = setInterval(fetchPending, 2500);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [fetchPending]);

  const handleRegisterThisDevice = async () => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const name = deviceName || "My Trusted Browser Device";
      const res = await enrollPushDevice(name);
      const data = res.data?.data;
      if (data?.device_identifier) {
        localStorage.setItem("voting_trusted_device_id", data.device_identifier);
        localStorage.setItem("voting_trusted_device_secret", data.device_secret || "");
        localStorage.setItem("voting_trusted_device_name", name);
        setDeviceId(data.device_identifier);
        setSuccessMsg(`Device registered successfully: ${name}`);
        fetchPending();
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to register trusted device. Please log in first.");
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (requestId, action) => {
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const currentDevId = deviceId || localStorage.getItem("voting_trusted_device_id") || null;
      const currentDevSecret = localStorage.getItem("voting_trusted_device_secret") || null;
      await respondToPush(requestId, action, currentDevId, currentDevSecret);
      setSuccessMsg(`Login request ${action === "approve" ? "Approved" : "Denied"} successfully.`);
      fetchPending();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} login request.`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full flex-grow flex flex-col">
      <main className="flex-grow flex items-center justify-center py-stack-lg px-margin-page">
        <div className="max-w-xl w-full border border-outline bg-surface-container-lowest flex flex-col shadow-sm">
          {/* Header */}
          <div className="bg-surface-container border-b border-outline p-stack-md flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                devices
              </span>
              <h1 className="font-headline-md text-headline-md text-primary m-0 uppercase tracking-tight font-semibold">
                Trusted Device Approval Portal
              </h1>
            </div>
            <span className="text-[10px] font-mono uppercase bg-primary text-on-primary px-2 py-0.5 rounded font-bold">
              2FA Second Device
            </span>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="px-stack-lg pt-4">
              <div className="p-3 bg-error-container border border-error text-error text-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-base">error</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="px-stack-lg pt-4">
              <div className="p-3 bg-primary/10 border border-primary text-primary text-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>{successMsg}</span>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="p-stack-lg flex flex-col gap-6">
            {/* Registered Device Status */}
            <div className="bg-surface-container border border-outline p-4 rounded flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">phonelink_lock</span>
                  This Device's Status
                </span>
                {deviceId ? (
                  <span className="text-[10px] bg-primary text-on-primary font-mono font-bold px-2 py-0.5 rounded uppercase">
                    Enrolled
                  </span>
                ) : (
                  <span className="text-[10px] bg-surface-container-highest border border-outline text-text-secondary font-mono px-2 py-0.5 rounded uppercase">
                    Not Enrolled
                  </span>
                )}
              </div>

              {deviceId ? (
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Device Name:</span>
                    <span className="font-bold text-primary">{deviceName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Device Token:</span>
                    <span className="font-mono text-text-secondary text-[11px] truncate max-w-[200px]">{deviceId}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs text-text-secondary">
                    To receive and approve push login prompts on this device/browser, register it as a trusted device.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="Device Name (e.g. Phone, Laptop)"
                      className="border border-outline p-2 text-xs flex-1 bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleRegisterThisDevice}
                      disabled={loading}
                      className="bg-primary text-on-primary px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-on-primary-fixed-variant disabled:opacity-50 whitespace-nowrap"
                    >
                      {loading ? "Registering..." : "Register Device"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pending Login Requests Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm font-semibold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-secondary">notifications_active</span>
                  Pending Login Requests
                </h2>
                <span className="text-[11px] font-mono text-text-secondary flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                  Live Polling (2.5s)
                </span>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="border border-outline p-6 text-center bg-surface-container-lowest flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-text-secondary">inbox</span>
                  <p className="text-xs text-text-secondary">No pending login requests right now.</p>
                  <p className="text-[11px] text-text-secondary/70">
                    When you attempt to log in from a computer using "Trusted Device Approval", the prompt will appear here immediately.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendingRequests.map((req) => (
                    <div
                      key={req.request_id}
                      className="border-2 border-primary bg-surface-container p-4 rounded flex flex-col gap-3 shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-primary text-sm">
                              Login for {req.username || "Voter"}
                            </span>
                            <span className="text-[10px] font-bold bg-secondary text-on-secondary px-2 py-0.5 rounded uppercase">
                              Active
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-text-secondary block mt-0.5">
                            Requested at {req.created_at ? new Date(req.created_at).toLocaleTimeString() : "Just now"}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] bg-surface-container-highest px-1.5 py-0.5 border border-outline text-text-secondary">
                          ID: {req.request_id.substring(0, 10)}...
                        </span>
                      </div>

                      <div className="flex items-center gap-3 pt-2 border-t border-outline/50">
                        <button
                          type="button"
                          onClick={() => handleRespond(req.request_id, "approve")}
                          disabled={actionLoading}
                          className="flex-1 bg-primary text-on-primary py-2.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          Approve Login
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRespond(req.request_id, "deny")}
                          disabled={actionLoading}
                          className="flex-1 bg-error-container text-error py-2.5 uppercase tracking-wider text-xs font-bold border border-error hover:bg-error hover:text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">cancel</span>
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation Links */}
            <div className="border-t border-outline pt-4 flex justify-between text-xs text-text-secondary">
              <Link to="/login" className="hover:text-primary underline">
                ← Back to Login
              </Link>
              <Link to="/2fa-setup" className="hover:text-primary underline">
                Manage 2FA Methods →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

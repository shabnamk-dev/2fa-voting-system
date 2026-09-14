import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { enrollQRConfirm } from "../../services/api";

export default function QREnroll() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [deviceName, setDeviceName] = useState(() => {
    // Detect mobile OS/browser name as helpful default
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "Mobile Device (iPhone)";
    if (/Android/i.test(ua)) return "Mobile Device (Android)";
    return "Mobile Device";
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pairedData, setPairedData] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid enrollment link. Missing enrollment challenge token.");
    }
  }, [token]);

  const handlePairDevice = async (e) => {
    e.preventDefault();
    if (!token) return;

    setError("");
    setLoading(true);

    try {
      const res = await enrollQRConfirm(token, deviceName.trim());
      const data = res.data?.data;
      if (data) {
        // Securely persist server-generated device credentials in phone's local storage
        localStorage.setItem("voting_qr_device_id", data.device_identifier);
        localStorage.setItem("voting_qr_device_secret", data.device_secret);
        localStorage.setItem("voting_qr_device_name", data.device_name);

        setPairedData(data);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Failed to pair device. The enrollment QR code may have expired or already been used."
      );
    } finally {
      setLoading(false);
    }
  };

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
              phonelink_setup
            </span>
            <h1 className="font-headline-md text-headline-md text-primary m-0 uppercase tracking-tight font-semibold">
              Pair Trusted Device
            </h1>
          </div>
          <span className="text-[10px] font-mono uppercase bg-primary text-on-primary px-2 py-0.5 rounded font-bold">
            QR 2FA Setup
          </span>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5">
          {pairedData ? (
            <div className="flex flex-col gap-4 text-center py-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto border-2 border-primary">
                <span className="material-symbols-outlined text-4xl">verified</span>
              </div>
              <div>
                <h2 className="font-headline-md text-primary font-bold">Device Paired!</h2>
                <p className="text-sm text-text-secondary mt-1">
                  This phone is now authorized for voter account <strong>{pairedData.username}</strong>.
                </p>
                <div className="mt-3 p-3 bg-surface-container border border-outline text-left text-xs font-mono">
                  <div><strong>Device:</strong> {pairedData.device_name}</div>
                  <div className="truncate text-text-secondary mt-1">
                    <strong>ID:</strong> {pairedData.device_identifier}
                  </div>
                </div>
                <p className="text-xs text-text-secondary mt-3">
                  When you log in on your computer and choose <strong>QR Code Login</strong>, scan the login QR code with this phone to approve.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col gap-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto border border-error">
                <span className="material-symbols-outlined text-3xl">error</span>
              </div>
              <div>
                <h2 className="font-bold text-error text-base">Enrollment Failed</h2>
                <p className="text-xs text-text-secondary mt-1">{error}</p>
              </div>
              <p className="text-xs text-text-secondary">
                Please return to the 2FA Setup screen on your computer and generate a fresh enrollment QR code.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePairDevice} className="flex flex-col gap-4">
              <div className="text-center">
                <span className="material-symbols-outlined text-4xl text-primary mb-1">
                  smartphone
                </span>
                <h2 className="font-headline-md font-semibold text-primary">
                  Authorize Mobile Device
                </h2>
                <p className="text-xs text-text-secondary mt-1">
                  You are pairing this phone to approve QR code logins for your voter account.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold uppercase text-primary">
                  Device Label
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Shabnam's iPhone"
                  required
                  className="w-full border border-outline p-2.5 text-sm bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-on-primary py-3.5 uppercase tracking-wider text-xs font-bold border border-primary hover:bg-on-primary-fixed-variant transition-none flex items-center justify-center gap-2 mt-2 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">link</span>
                {loading ? "Pairing Device..." : "Authorize This Device"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import {
  getCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  getElection,
  updateElectionStatus,
  getSecurityStats,
  getSecurityEvents,
} from "../../services/api";

const POSITION_OPTIONS = [
  "President",
  "Vice President",
  "General Secretary",
  "Treasurer",
  "Arts Representative",
  "Science Representative",
  "Engineering Representative",
];

const EMPTY_FORM = { name: "", party: "", description: "", position: POSITION_OPTIONS[0] };

export default function AdminDashboard() {
  // -------------------- Candidates --------------------
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [candidateError, setCandidateError] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // -------------------- Election control --------------------
  const [election, setElection] = useState(null);
  const [electionUpdating, setElectionUpdating] = useState(false);

  // -------------------- Login activity --------------------
  const [securityStats, setSecurityStats] = useState(null);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [securityError, setSecurityError] = useState("");
  const [securityLoading, setSecurityLoading] = useState(true);

  const loadCandidates = useCallback(async () => {
    setCandidateLoading(true);
    setCandidateError("");
    try {
      const response = await getCandidates();
      const list = response.data?.data || [];
      setCandidates(list);
    } catch (err) {
      console.error("Failed to fetch candidates", err);
      setCandidateError("Failed to load candidates.");
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  const loadElection = useCallback(async () => {
    try {
      const response = await getElection();
      setElection(response.data?.data || null);
    } catch (err) {
      console.error("Failed to fetch election status", err);
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    setSecurityLoading(true);
    setSecurityError("");
    try {
      const [statsRes, eventsRes] = await Promise.all([
        getSecurityStats(),
        getSecurityEvents(25),
      ]);
      setSecurityStats(statsRes.data?.data || null);
      setSecurityEvents(eventsRes.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch login activity", err);
      setSecurityError("Failed to load login activity.");
    } finally {
      setSecurityLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCandidates();
    loadElection();
    loadSecurity();
  }, [loadCandidates, loadElection, loadSecurity]);

  const handleSelectCandidate = (cand) => {
    setSelectedCandidate(cand);
    setForm({
      name: cand.name || "",
      party: cand.party || "",
      description: cand.description || "",
      position: cand.position || POSITION_OPTIONS[0],
    });
    setCandidateError("");
  };

  const handleNewCandidate = () => {
    setSelectedCandidate(null);
    setForm(EMPTY_FORM);
    setCandidateError("");
  };

  const handleDiscard = () => {
    if (selectedCandidate) {
      handleSelectCandidate(selectedCandidate);
    } else {
      handleNewCandidate();
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setCandidateError("");

    if (form.name.trim() === "") {
      setCandidateError("Candidate name is required.");
      return;
    }

    setSaving(true);
    try {
      if (selectedCandidate) {
        await updateCandidate(
          selectedCandidate.id,
          form.name.trim(),
          form.party.trim() || null,
          form.description.trim() || null,
          selectedCandidate.image_url || null,
          form.position
        );
      } else {
        await createCandidate(
          form.name.trim(),
          form.party.trim() || null,
          form.description.trim() || null,
          null,
          form.position
        );
      }
      await loadCandidates();
      handleNewCandidate();
    } catch (err) {
      console.error("Failed to save candidate", err);
      setCandidateError(
        err.response?.data?.message || "Failed to save candidate. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove ${name} from the ballot?`)) {
      return;
    }
    try {
      await deleteCandidate(id);
      if (selectedCandidate?.id === id) {
        handleNewCandidate();
      }
      await loadCandidates();
    } catch (err) {
      console.error("Failed to delete candidate", err);
      alert(err.response?.data?.message || "Failed to delete candidate.");
    }
  };

  const handleToggleElection = async (nextStatus) => {
    setElectionUpdating(true);
    try {
      await updateElectionStatus(nextStatus);
      await loadElection();
    } catch (err) {
      console.error("Failed to update election status", err);
      alert(err.response?.data?.message || "Failed to update voting status.");
    } finally {
      setElectionUpdating(false);
    }
  };

  const statusBadgeClasses = (status) => {
    if (status === "OPEN") return "bg-secondary-fixed text-on-secondary-fixed";
    if (status === "CLOSED") return "bg-error text-on-error";
    return "bg-surface-variant text-text-secondary";
  };

  return (
    <div className="max-w-container-max mx-auto px-margin-page py-stack-lg w-full flex-grow flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-outline pb-stack-sm gap-4">
        <div>
          <h2 className="font-display text-display text-primary m-0 font-bold">Admin Dashboard</h2>
          <p className="font-body-md text-body-md text-text-secondary mt-1">
            Manage candidates, control voting, and review login activity.
          </p>
        </div>
        <button
          onClick={handleNewCandidate}
          className="bg-primary text-on-primary py-2 px-4 font-label-lg text-label-lg border border-primary hover:bg-on-primary-fixed-variant transition-none rounded-none flex items-center"
        >
          <span className="material-symbols-outlined mr-2">add</span>
          New Candidate
        </button>
      </div>

      {/* Election Control */}
      <div className="border border-outline bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-gutter">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            how_to_vote
          </span>
          <div>
            <h3 className="font-headline-md text-headline-md text-primary font-semibold m-0">
              {election?.name || "Election"} Status
            </h3>
            <span className={`inline-block mt-1 px-2 py-1 font-label-md text-label-md uppercase border border-outline ${statusBadgeClasses(election?.status)}`}>
              {election?.status || "UNKNOWN"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={electionUpdating || election?.status === "OPEN"}
            onClick={() => handleToggleElection("OPEN")}
            className="border border-outline bg-surface-container-lowest text-primary py-2 px-4 font-label-md text-label-md uppercase hover:bg-surface-variant transition-none rounded-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Open Voting
          </button>
          <button
            disabled={electionUpdating || election?.status === "CLOSED"}
            onClick={() => handleToggleElection("CLOSED")}
            className="border border-error text-error py-2 px-4 font-label-md text-label-md uppercase hover:bg-error-container transition-none rounded-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Close Voting
          </button>
        </div>
      </div>

      {candidateError && (
        <div className="p-3 bg-error-container border border-error text-error text-sm font-bold">
          {candidateError}
        </div>
      )}

      {/* Candidates: List + Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 border border-outline bg-surface-container-lowest flex flex-col">
          <div className="bg-surface-container-low border-b border-outline px-gutter py-stack-sm">
            <h3 className="font-headline-md text-headline-md text-primary m-0 font-semibold">Candidates</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container-lowest text-text-secondary font-label-md text-label-md uppercase">
                  <th className="py-3 px-gutter font-semibold">ID</th>
                  <th className="py-3 px-gutter font-semibold">Name</th>
                  <th className="py-3 px-gutter font-semibold">Party</th>
                  <th className="py-3 px-gutter font-semibold">Position</th>
                  <th className="py-3 px-gutter font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-primary">
                {candidateLoading && (
                  <tr><td className="py-4 px-gutter text-text-secondary" colSpan={5}>Loading candidates…</td></tr>
                )}
                {!candidateLoading && candidates.length === 0 && (
                  <tr><td className="py-4 px-gutter text-text-secondary" colSpan={5}>No candidates yet. Add one to get started.</td></tr>
                )}
                {candidates.map((cand) => (
                  <tr
                    key={cand.id}
                    className={`border-b border-outline hover:bg-surface-container-high cursor-pointer ${selectedCandidate?.id === cand.id ? "bg-secondary/10" : "even:bg-surface-main odd:bg-surface-container-lowest"}`}
                    onClick={() => handleSelectCandidate(cand)}
                  >
                    <td className="py-3 px-gutter font-mono text-sm">#{String(cand.id).padStart(4, "0")}</td>
                    <td className="py-3 px-gutter font-semibold">{cand.name}</td>
                    <td className="py-3 px-gutter">{cand.party || "-"}</td>
                    <td className="py-3 px-gutter">{cand.position || "-"}</td>
                    <td className="py-3 px-gutter text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleSelectCandidate(cand)}
                        aria-label="Edit"
                        className="text-text-secondary hover:text-primary transition-none mr-3"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(cand.id, cand.name)}
                        aria-label="Delete"
                        className="text-text-secondary hover:text-error transition-none"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Editor Form */}
        <div className="lg:col-span-4 flex flex-col gap-gutter">
          <div className="border border-outline bg-surface-container-lowest flex flex-col h-full">
            <div className="bg-surface-container-low border-b border-outline px-gutter py-stack-sm">
              <h3 className="font-headline-md text-headline-md text-primary m-0 flex items-center font-semibold">
                <span className="material-symbols-outlined mr-2">edit_document</span>
                {selectedCandidate ? "Edit Candidate" : "New Candidate"}
              </h3>
            </div>

            <div className="p-gutter flex-grow">
              <form onSubmit={handleSave} className="flex flex-col gap-stack-md">
                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Name
                  </label>
                  <input
                    className="border border-outline bg-surface-container-lowest p-2 font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Candidate name"
                    required
                  />
                </div>

                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Party / Affiliation
                  </label>
                  <input
                    className="border border-outline bg-surface-container-lowest p-2 font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none"
                    type="text"
                    value={form.party}
                    onChange={(e) => setForm({ ...form, party: e.target.value })}
                    placeholder="e.g. Tech & Hackathon Club"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Position Contested
                  </label>
                  <select
                    className="border border-outline bg-surface-container-lowest p-2 font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none"
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  >
                    {POSITION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Platform
                  </label>
                  <textarea
                    className="border border-outline bg-surface-container-lowest p-2 font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none resize-none"
                    rows="4"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Platform / agenda details..."
                  />
                </div>

                <div className="border-t border-outline bg-surface-container-low p-gutter flex justify-end gap-stack-sm mt-4 -mx-gutter -mb-gutter">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="bg-surface-container-lowest text-primary py-2 px-4 font-label-lg text-label-lg border border-outline hover:bg-surface-variant transition-none rounded-none"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-secondary text-on-secondary py-2 px-4 font-label-lg text-label-lg border border-primary hover:bg-on-secondary-fixed-variant transition-none rounded-none font-semibold disabled:opacity-50"
                  >
                    {saving ? "Saving…" : selectedCandidate ? "Save Changes" : "Create Candidate"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Login Activity / Security */}
      <div className="border border-outline bg-surface-container-lowest flex flex-col">
        <div className="bg-surface-container-low border-b border-outline px-gutter py-stack-sm flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-primary m-0 flex items-center font-semibold">
            <span className="material-symbols-outlined mr-2">security</span>
            Login Activity
          </h3>
          <button
            onClick={loadSecurity}
            className="text-text-secondary hover:text-primary transition-none flex items-center gap-1 font-label-md text-label-md uppercase"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </div>

        <div className="p-gutter flex flex-col gap-stack-md">
          {securityError && (
            <div className="p-3 bg-error-container border border-error text-error text-sm font-bold">
              {securityError}
            </div>
          )}

          {securityLoading ? (
            <p className="font-body-md text-body-md text-text-secondary">Loading login activity…</p>
          ) : (
            <>
              {/* Stat tiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-gutter">
                <StatTile label="Successful Logins" value={securityStats?.successful_logins} accent="secondary" />
                <StatTile label="Failed Logins" value={securityStats?.failed_logins} accent="error" />
                <StatTile label="Failed 2FA Codes" value={securityStats?.failed_totp} accent="error" />
                <StatTile label="Locked Accounts" value={securityStats?.locked_accounts} accent="error" />
                <StatTile label="Unauthorized Admin Attempts" value={securityStats?.unauthorized_admin_access} accent="error" />
                <StatTile label="Total Events Logged" value={securityStats?.total_security_events} accent="primary" />
              </div>

              {/* Recent events table */}
              <div className="overflow-x-auto border border-outline">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline bg-surface-main text-text-secondary font-label-md text-label-md uppercase">
                      <th className="py-2 px-gutter font-semibold">Timestamp</th>
                      <th className="py-2 px-gutter font-semibold">Username</th>
                      <th className="py-2 px-gutter font-semibold">Event</th>
                      <th className="py-2 px-gutter font-semibold text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md">
                    {securityEvents.length === 0 && (
                      <tr><td className="py-3 px-gutter text-text-secondary" colSpan={4}>No login activity recorded yet.</td></tr>
                    )}
                    {securityEvents.map((evt) => (
                      <tr key={evt.id} className="border-b border-outline last:border-0">
                        <td className="py-2 px-gutter font-mono text-sm text-text-secondary">{evt.timestamp}</td>
                        <td className="py-2 px-gutter">{evt.username || "—"}</td>
                        <td className="py-2 px-gutter">{evt.event_type}</td>
                        <td className="py-2 px-gutter text-right">
                          <span className={`inline-block px-2 py-0.5 font-label-md text-label-md uppercase border border-outline ${evt.success ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-error text-on-error"}`}>
                            {evt.success ? "Success" : "Failed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent = "primary" }) {
  const accentClass = {
    primary: "text-primary",
    secondary: "text-secondary",
    error: "text-error",
  }[accent] || "text-primary";

  return (
    <div className="border border-outline bg-surface-main p-stack-sm flex flex-col gap-1">
      <span className="font-label-md text-label-md text-text-secondary uppercase">{label}</span>
      <span className={`font-headline-lg text-headline-lg font-bold ${accentClass}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

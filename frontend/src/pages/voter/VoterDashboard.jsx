import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getElection, getCandidates } from "../../services/api";

export default function VoterDashboard({ user }) {
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [candidateCount, setCandidateCount] = useState(null);
  const [loading, setLoading] = useState(true);

  const hasVoted = !!user?.hasVoted;

  useEffect(() => {
    const load = async () => {
      try {
        const [electionRes, candidatesRes] = await Promise.all([
          getElection(),
          getCandidates(),
        ]);
        setElection(electionRes.data?.data || null);
        setCandidateCount((candidatesRes.data?.data || []).length);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const status = election?.status || "UPCOMING";
  const votingOpen = status === "OPEN";

  const handleCastBallot = () => {
    navigate("/ballot");
  };

  return (
    <main className="flex-grow max-w-container-max mx-auto w-full px-margin-page py-stack-lg">
      <div className="mb-stack-lg border-b border-outline pb-stack-sm">
        <h1 className="font-display text-display text-primary font-bold">Voter Dashboard</h1>
        <p className="font-body-lg text-body-lg text-text-secondary mt-2">
          Welcome, {user?.studentId}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        {/* Election Card */}
        <div className="col-span-1 md:col-span-8 flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary mb-stack-sm font-semibold">Election</h2>

          <div className="border border-outline bg-surface-container-lowest p-stack-md flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {hasVoted ? (
                  <span className="bg-secondary text-on-secondary font-label-md text-label-md px-2 py-1 uppercase tracking-wide">
                    Completed
                  </span>
                ) : votingOpen ? (
                  <span className="bg-error text-on-error font-label-md text-label-md px-2 py-1 uppercase tracking-wide">
                    Action Required
                  </span>
                ) : (
                  <span className="bg-surface-variant text-text-secondary font-label-md text-label-md px-2 py-1 uppercase tracking-wide">
                    {status === "UPCOMING" ? "Not Yet Open" : "Voting Closed"}
                  </span>
                )}
                {!loading && (
                  <span className="text-text-secondary font-label-md text-label-md">
                    {candidateCount ?? 0} candidate{candidateCount === 1 ? "" : "s"} on the ballot
                  </span>
                )}
              </div>
              <h3 className="font-headline-md text-headline-md text-primary font-semibold">
                {election?.name || "College Election"}
              </h3>
              <p className="font-body-md text-body-md text-text-secondary mt-1">
                {hasVoted
                  ? "Thank you for participating. Your ballot has been securely recorded."
                  : votingOpen
                  ? "Select one candidate (or abstain) to cast your ballot."
                  : "Voting is not currently open. Check back once the administrator opens the election."}
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex flex-col items-end w-full md:w-auto">
              <span className={`font-label-lg text-label-lg font-bold mb-2 ${hasVoted ? "text-secondary" : "text-error-base"}`}>
                Status: {hasVoted ? "Voted" : "Not Voted"}
              </span>
              {hasVoted ? (
                <button
                  onClick={() => navigate("/receipt")}
                  className="w-full md:w-auto bg-surface-variant hover:bg-surface-container-highest text-text-primary font-label-md text-label-md px-4 py-2 uppercase tracking-wider border border-outline transition-none"
                >
                  View Receipt
                </button>
              ) : (
                <button
                  onClick={handleCastBallot}
                  disabled={!votingOpen}
                  className="w-full md:w-auto bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md px-4 py-2 uppercase tracking-wider border border-primary transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cast Ballot
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Info Column */}
        <div className="col-span-1 md:col-span-4 flex flex-col gap-stack-md">
          <div className="border border-outline bg-surface-container-lowest">
            <div className="bg-surface-container-high border-b border-outline p-stack-sm px-stack-md">
              <h2 className="font-label-lg text-label-lg text-primary uppercase tracking-wide flex items-center gap-2 font-semibold">
                <span className="material-symbols-outlined text-[18px]">security</span> Your Security
              </h2>
            </div>
            <div className="p-stack-md flex flex-col gap-stack-sm">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified_user
                </span>
                <p className="font-body-md text-body-md text-text-secondary">
                  Your account is protected by two-factor authentication. Every login requires your
                  password plus a live code from your authenticator app.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  how_to_vote
                </span>
                <p className="font-body-md text-body-md text-text-secondary">
                  You can cast exactly one ballot for this election. Once submitted, it can't be changed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

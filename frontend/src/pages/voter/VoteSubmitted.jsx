import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyVote } from "../../services/api";

export default function VoteSubmitted({ receipt, onResetBallot }) {
  const navigate = useNavigate();
  const [resolvedReceipt, setResolvedReceipt] = useState(receipt || null);
  const [loading, setLoading] = useState(!receipt);
  const [error, setError] = useState("");

  useEffect(() => {
    if (receipt) {
      setResolvedReceipt(receipt);
      setLoading(false);
      return;
    }

    // Page was refreshed / navigated to directly — fetch the receipt from
    // the backend instead of showing a fabricated placeholder.
    const fetchReceipt = async () => {
      try {
        const response = await getMyVote();
        setResolvedReceipt(response.data?.data || null);
      } catch (err) {
        setError("We couldn't find a recorded vote for your account.");
      } finally {
        setLoading(false);
      }
    };
    fetchReceipt();
  }, [receipt]);

  const handleReturn = () => {
    if (onResetBallot) onResetBallot();
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <main className="flex-grow flex items-center justify-center p-margin-page">
        <p className="font-body-lg text-body-lg text-text-secondary">Loading your receipt…</p>
      </main>
    );
  }

  if (error || !resolvedReceipt) {
    return (
      <main className="flex-grow flex items-center justify-center p-margin-page">
        <div className="w-full max-w-[560px] border border-error bg-error-container p-stack-lg text-error font-bold text-center">
          {error || "No vote receipt found."}
          <div className="mt-stack-md">
            <button
              onClick={handleReturn}
              className="inline-flex items-center gap-2 bg-primary text-on-primary font-label-lg text-label-lg px-6 py-3 border border-primary hover:bg-on-primary-fixed-variant transition-none uppercase tracking-wider"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isAbstain = resolvedReceipt.candidate_id === null || resolvedReceipt.candidate_id === undefined;
  const timestamp = resolvedReceipt.timestamp ? new Date(resolvedReceipt.timestamp.replace(" ", "T") + "Z") : new Date();

  return (
    <main className="flex-grow flex items-center justify-center p-margin-page">
      <div className="w-full max-w-[720px] flex flex-col gap-stack-lg">
        {/* System Notice */}
        <div className="bg-surface-container-lowest border border-outline flex flex-col md:flex-row items-stretch">
          {/* Status Indicator Strip */}
          <div className="bg-primary w-full md:w-3 min-h-[8px] md:min-h-full flex-shrink-0"></div>

          <div className="p-stack-lg w-full">
            <div className="flex items-center gap-stack-sm mb-stack-md border-b border-outline-variant pb-stack-sm">
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <h1 className="font-headline-lg text-headline-lg text-primary m-0 font-semibold">
                Ballot Submitted
              </h1>
            </div>

            <div className="flex flex-col gap-stack-md mt-stack-md">
              <div className="flex items-start gap-gutter">
                <span className="material-symbols-outlined text-outline mt-1">info</span>
                <div>
                  <h2 className="font-label-lg text-label-lg text-primary mb-1 uppercase font-semibold">
                    Status: Ballot Recorded
                  </h2>
                  <p className="font-body-md text-body-md text-text-secondary m-0">
                    Your selection has been securely recorded in the database. This election allows only
                    one ballot per verified voter, so no further submissions are possible.
                  </p>
                </div>
              </div>

              {/* Selection Summary */}
              <div className="border border-outline mt-stack-sm p-gutter bg-surface-main">
                <span className="font-label-md text-label-md text-text-secondary uppercase">Your Selection</span>
                <p className={`font-headline-md text-headline-md text-primary font-bold mt-1 ${isAbstain ? "italic" : ""}`}>
                  {isAbstain ? "Abstained (None of the Above)" : resolvedReceipt.candidate_name}
                </p>
                {!isAbstain && resolvedReceipt.candidate_party && (
                  <p className="font-body-md text-body-md text-text-secondary">{resolvedReceipt.candidate_party}</p>
                )}
              </div>

              {/* Audit Metadata Table */}
              <div className="border border-outline mt-stack-md">
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="p-gutter border-b sm:border-b-0 sm:border-r border-outline flex flex-col gap-1">
                    <span className="font-label-md text-label-md text-text-secondary">Timestamp (UTC)</span>
                    <span className="font-body-md text-body-md text-primary font-medium">
                      {isNaN(timestamp.getTime())
                        ? resolvedReceipt.timestamp
                        : timestamp.toISOString().replace("T", " ").substring(0, 19) + "Z"}
                    </span>
                  </div>
                  <div className="p-gutter flex flex-col gap-1">
                    <span className="font-label-md text-label-md text-text-secondary">Receipt Code</span>
                    <span className="font-body-md text-body-md text-primary font-medium break-all select-all">
                      {resolvedReceipt.receipt_code}
                    </span>
                  </div>
                </div>
              </div>

              <p className="font-body-md text-body-md text-text-secondary">
                Save this receipt code as proof your ballot was recorded. It does not reveal your
                selection to anyone else and cannot be used to change your vote.
              </p>

              {/* Primary Action */}
              <div className="mt-stack-lg pt-stack-md border-t border-outline flex justify-end">
                <button
                  onClick={handleReturn}
                  className="inline-flex items-center justify-center gap-2 bg-primary text-on-primary font-label-lg text-label-lg px-margin-page py-3 border border-primary hover:bg-on-primary-fixed-variant transition-none w-full sm:w-auto uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

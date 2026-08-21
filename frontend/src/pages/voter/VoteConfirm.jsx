import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mockApi } from "../../services/mockApi";

export default function VoteConfirm({ user, selectedCandidate, onVoteCompleted }) {
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");

  const handleFinalSubmit = () => {
    if (!verified) return;
    setError("");

    try {
      const candidateId = selectedCandidate?.id || "nota";
      const receipt = mockApi.submitVote(user.studentId, candidateId);
      onVoteCompleted(receipt);
      navigate("/receipt");
    } catch (err) {
      setError(err.message || "Failed to record ballot.");
    }
  };

  const isNota = !selectedCandidate || selectedCandidate.id === "nota";

  return (
    <main className="flex-grow w-full max-w-container-max mx-auto px-margin-page py-stack-lg md:py-[64px]">
      <div className="mb-stack-lg border-b border-outline pb-stack-md">
        <h1 className="font-display text-display mb-stack-sm font-bold">Vote Confirmation</h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          Please review your selection carefully before submitting. This action is immutable.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error-container border border-error text-error text-sm font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        {/* Review Section */}
        <div className="md:col-span-8 flex flex-col gap-stack-md">
          <div className={`border border-outline p-stack-md rounded-none flex flex-col sm:flex-row justify-between items-start sm:items-center gap-stack-md ${
            isNota ? "bg-surface-container-low" : "bg-surface-container-lowest"
          }`}>
            <div>
              <h2 className="font-label-lg text-label-lg uppercase tracking-wider text-text-secondary mb-1">
                Student Council General Secretary 2026 Selection
              </h2>
              {isNota ? (
                <p className="font-headline-md text-headline-md text-text-secondary italic">Abstained</p>
              ) : (
                <>
                  <p className="font-headline-md text-headline-md text-primary font-bold">{selectedCandidate.name}</p>
                  <p className="font-body-md text-body-md text-text-secondary">
                    {selectedCandidate.affiliation}
                  </p>
                </>
              )}
            </div>
            <button 
              onClick={() => navigate("/ballot")}
              className="border border-outline px-4 py-2 font-label-md text-label-md uppercase tracking-wider hover:bg-surface-variant transition-none rounded-none text-primary"
            >
              Edit Selection
            </button>
          </div>
        </div>

        {/* Action Panel */}
        <div className="md:col-span-4">
          <div className="border border-error bg-error-container p-stack-md rounded-none flex flex-col gap-stack-md sticky top-[100px]">
            <div className="flex items-center gap-stack-sm text-error">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
              <h3 className="font-headline-md text-headline-md font-semibold">Final Submission</h3>
            </div>
            <p className="font-body-md text-body-md text-on-error-container">
              By clicking "Submit Final Vote", you cast your ballot. This action is permanent and cannot be undone. Ensure your selection above is accurate.
            </p>
            <div className="mt-stack-sm pt-stack-sm border-t border-error/30">
              <label className="flex items-start gap-stack-sm cursor-pointer select-none">
                <input 
                  className="mt-1 rounded-none border-error text-error focus:ring-error focus:ring-offset-0 bg-transparent cursor-pointer" 
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                <span className="font-body-md text-body-md text-on-error-container">
                  I verify that I have reviewed my selection and authorize this submission.
                </span>
              </label>
            </div>
            <button 
              onClick={handleFinalSubmit}
              disabled={!verified}
              className="w-full bg-error text-on-error py-4 font-headline-md text-headline-md rounded-none hover:bg-error-base transition-none mt-stack-md disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              Submit Final Vote
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

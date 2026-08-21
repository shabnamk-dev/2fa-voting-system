import React from "react";
import { useNavigate } from "react-router-dom";

export default function VoteSubmitted({ receipt, onResetBallot }) {
  const navigate = useNavigate();

  // Generate fallback receipt if none exists
  const finalReceipt = receipt || {
    timestamp: new Date().toISOString(),
    electionId: "ELC-2026-SYS-BETA"
  };

  const handleReturn = () => {
    if (onResetBallot) onResetBallot();
    navigate("/dashboard");
  };

  return (
    <main className="flex-grow flex items-center justify-center p-margin-page">
      <div className="w-full max-w-[720px] flex flex-col gap-stack-lg">
        {/* System Notice */}
        <div className="bg-surface-container-lowest border border-outline flex flex-col md:flex-row items-stretch">
          {/* Status Indicator Strip */}
          <div className="bg-primary w-full md:w-3 min-h-[8px] md:min-h-full flex-shrink-0"></div>
          
          <div className="p-stack-lg w-full">
            <div className="flex items-center gap-stack-sm mb-stack-md border-b border-outline-variant pb-stack-sm">
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
                    Your selections have been successfully recorded. An active ballot session has been completed for this election cycle. Multiple submissions are prohibited.
                  </p>
                </div>
              </div>

              {/* Audit Metadata Table */}
              <div className="border border-outline mt-stack-md">
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="p-gutter border-b sm:border-b-0 sm:border-r border-outline flex flex-col gap-1">
                    <span className="font-label-md text-label-md text-text-secondary">Timestamp (UTC)</span>
                    <span className="font-body-md text-body-md text-primary font-medium">
                      {new Date(finalReceipt.timestamp).toISOString().replace("T", " ").substring(0, 19)}Z
                    </span>
                  </div>
                  <div className="p-gutter flex flex-col gap-1">
                    <span className="font-label-md text-label-md text-text-secondary">Election Identifier</span>
                    <span className="font-body-md text-body-md text-primary font-medium">
                      {finalReceipt.electionId}
                    </span>
                  </div>
                </div>
              </div>

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

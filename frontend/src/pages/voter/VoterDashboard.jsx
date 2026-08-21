import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function VoterDashboard({ user }) {
  const navigate = useNavigate();
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    if (user) {
      setHasVoted(user.hasVoted);
    }
  }, [user]);

  const handleCastBallot = () => {
    navigate("/ballot");
  };

  return (
    <main className="flex-grow max-w-container-max mx-auto w-full px-margin-page py-stack-lg">
      <div className="mb-stack-lg border-b border-outline pb-stack-sm">
        <h1 className="font-display text-display text-primary font-bold">Voter Dashboard</h1>
        <p className="font-body-lg text-body-lg text-text-secondary mt-2">
          Welcome, Student ID: {user?.studentId || "90210"}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        {/* Active Elections Column */}
        <div className="col-span-1 md:col-span-8 flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary mb-stack-sm font-semibold">Active Elections</h2>

          {/* Election Card 1 */}
          <div className="border border-outline bg-surface-container-lowest p-stack-md flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {!hasVoted ? (
                  <span className="bg-error text-on-error font-label-md text-label-md px-2 py-1 uppercase tracking-wide">
                    Action Required
                  </span>
                ) : (
                  <span className="bg-secondary text-on-secondary font-label-md text-label-md px-2 py-1 uppercase tracking-wide">
                    Completed
                  </span>
                )}
                <span className="text-text-secondary font-label-md text-label-md">Closes in 48 Hours</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-primary font-semibold">Student Council General Secretary 2026</h3>
              <p className="font-body-md text-body-md text-text-secondary mt-1">
                Select one candidate to represent the undergraduate student body.
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex flex-col items-end w-full md:w-auto">
              <span className={`font-label-lg text-label-lg font-bold mb-2 ${!hasVoted ? "text-error-base" : "text-secondary"}`}>
                Status: {hasVoted ? "Voted" : "Not Voted"}
              </span>
              {!hasVoted ? (
                <button
                  onClick={handleCastBallot}
                  className="w-full md:w-auto bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md px-4 py-2 uppercase tracking-wider border border-primary transition-none"
                >
                  Cast Ballot
                </button>
              ) : (
                <button
                  onClick={() => navigate("/receipt")}
                  className="w-full md:w-auto bg-surface-variant hover:bg-surface-container-highest text-text-primary font-label-md text-label-md px-4 py-2 uppercase tracking-wider border border-outline transition-none"
                >
                  View Receipt
                </button>
              )}
            </div>
          </div>

          {/* Election Card 2 */}
          <div className="border border-outline bg-surface-container-lowest p-stack-md flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-secondary text-on-secondary font-label-md text-label-md px-2 py-1 uppercase tracking-wide">
                  Completed
                </span>
                <span className="text-text-secondary font-label-md text-label-md">Closes in 5 Days</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-primary font-semibold">Referendum: Campus Facility Upgrade</h3>
              <p className="font-body-md text-body-md text-text-secondary mt-1">
                Vote on the proposed funding allocation for the new science center.
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex flex-col items-end w-full md:w-auto">
              <span className="font-label-lg text-label-lg text-secondary font-bold mb-2">Status: Voted</span>
              <button
                className="w-full md:w-auto bg-surface-variant hover:bg-surface-container-highest text-text-primary font-label-md text-label-md px-4 py-2 uppercase tracking-wider border border-outline transition-none"
                disabled
              >
                View Receipt
              </button>
            </div>
          </div>
        </div>

        {/* Announcements & Info Column */}
        <div className="col-span-1 md:col-span-4 flex flex-col gap-stack-md">
          <div className="border border-outline bg-surface-container-lowest">
            <div className="bg-surface-container-high border-b border-outline p-stack-sm px-stack-md">
              <h2 className="font-label-lg text-label-lg text-primary uppercase tracking-wide flex items-center gap-2 font-semibold">
                <span className="material-symbols-outlined text-[18px]">campaign</span> Institutional Announcements
              </h2>
            </div>
            <div className="p-stack-md flex flex-col gap-stack-md">
              {/* Announcement 1 */}
              <div className="border-b border-outline-variant pb-stack-sm last:border-0 last:pb-0">
                <div className="flex justify-between items-start gap-2 flex-wrap mb-1">
                  <span className="font-label-sm text-label-sm text-text-secondary">Start: Aug 15, 2026 | End: Aug 24, 2026</span>
                </div>
                <h4 className="font-body-lg text-body-lg font-bold text-primary leading-tight">Student Council General Secretary 2026</h4>
                <p className="font-body-md text-body-md text-text-secondary mt-1 text-sm">
                  Status: {hasVoted ? "Voted (Receipt available)" : "Not Voted (Action required)"}
                </p>
              </div>

              {/* Announcement 2 */}
              <div className="border-b border-outline-variant pb-stack-sm last:border-0 last:pb-0">
                <div className="flex justify-between items-start gap-2 flex-wrap mb-1">
                  <span className="font-label-sm text-label-sm text-text-secondary">Start: Aug 10, 2026 | End: Aug 28, 2026</span>
                </div>
                <h4 className="font-body-lg text-body-lg font-bold text-primary leading-tight">Referendum: Campus Facility Upgrade</h4>
                <p className="font-body-md text-body-md text-text-secondary mt-1 text-sm">
                  Status: Voted (Completed)
                </p>
              </div>

              {/* Announcement 3 */}
              <div className="border-b border-outline-variant pb-stack-sm last:border-0 last:pb-0">
                <div className="flex justify-between items-start gap-2 flex-wrap mb-1">
                  <span className="font-label-sm text-label-sm text-text-secondary">Start: Jul 12, 2026 | End: Jul 18, 2026</span>
                </div>
                <h4 className="font-body-lg text-body-lg font-bold text-primary leading-tight opacity-70">Science Department Representative Election</h4>
                <p className="font-body-md text-body-md text-text-secondary mt-1 text-sm opacity-70">
                  Status: Closed (Results archived)
                </p>
              </div>
            </div>
          </div>


        </div>
      </div>


    </main>
  );
}

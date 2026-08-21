import React, { useState, useEffect } from "react";
import { mockApi } from "../../services/mockApi";

export default function Results() {
  const [candidates, setCandidates] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = () => {
    const list = mockApi.getCandidates();
    setCandidates(list);
    const sum = list.reduce((acc, c) => acc + (c.votes || 0), 0) + 287; // Adding 287 for abstain fallback
    setTotalVotes(sum);
  };

  return (
    <main className="flex-1 flex flex-col gap-stack-lg max-w-container-max mx-auto px-margin-page py-stack-lg w-full">
      <div>
        <h1 className="font-display text-display text-text-primary mb-stack-sm font-bold">General Secretary Election 2026</h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          Real-time vote tabulation.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="border border-outline bg-surface-container-lowest p-stack-md">
          <div className="font-label-md text-label-md text-text-secondary uppercase mb-stack-sm font-semibold">
            Total Ballots Cast
          </div>
          <div className="font-headline-lg text-headline-lg text-text-primary font-bold">
            {totalVotes.toLocaleString()}
          </div>
        </div>

        <div className="border border-outline bg-surface-container-lowest p-stack-md">
          <div className="font-label-md text-label-md text-text-secondary uppercase mb-stack-sm font-semibold">
            Turnout Rate
          </div>
          <div className="font-headline-lg text-headline-lg text-text-primary font-bold">68.4%</div>
        </div>

        <div className="border border-outline bg-surface-container-lowest p-stack-md">
          <div className="font-label-md text-label-md text-text-secondary uppercase mb-stack-sm font-semibold">
            Verification Status
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <div className="font-headline-md text-headline-md text-text-primary font-semibold">Secured</div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="border border-outline bg-surface-container-lowest flex flex-col">
        <div className="bg-surface-container-low p-stack-md border-b border-outline">
          <h2 className="font-headline-md text-headline-md text-text-primary font-semibold">Live Candidate Results</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline bg-surface-main">
                <th className="p-stack-md font-label-lg text-label-lg text-text-secondary uppercase font-semibold">Candidate</th>
                <th className="p-stack-md font-label-lg text-label-lg text-text-secondary uppercase font-semibold">Party / Affiliation</th>
                <th className="p-stack-md font-label-lg text-label-lg text-text-secondary uppercase text-right font-semibold">Votes</th>
                <th className="p-stack-md font-label-lg text-label-lg text-text-secondary uppercase text-right font-semibold">Percentage</th>
                <th className="p-stack-md font-label-lg text-label-lg text-text-secondary uppercase w-1/3 font-semibold">Visualization</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((cand, idx) => {
                const percentage = totalVotes > 0 ? ((cand.votes / totalVotes) * 100) : 0;
                const barColor = idx === 0 ? "bg-secondary" : "bg-primary";
                return (
                  <tr key={cand.id} className="border-b border-outline hover:bg-surface-main transition-none">
                    <td className="p-stack-md font-body-md text-body-md text-text-primary font-bold">
                      {cand.name}
                    </td>
                    <td className="p-stack-md font-body-md text-body-md text-text-secondary">
                      {cand.affiliation}
                    </td>
                    <td className="p-stack-md font-body-md text-body-md text-text-primary text-right">
                      {cand.votes.toLocaleString()}
                    </td>
                    <td className="p-stack-md font-body-md text-body-md text-text-primary text-right font-bold">
                      {percentage.toFixed(2)}%
                    </td>
                    <td className="p-stack-md">
                      <div className="w-full bg-surface-variant h-4">
                        <div className={`${barColor} h-4`} style={{ width: `${percentage}%` }}></div>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Abstains Row */}
              <tr className="hover:bg-surface-main transition-none">
                <td className="p-stack-md font-body-md text-body-md text-text-primary font-bold">Abstains (NOTA)</td>
                <td className="p-stack-md font-body-md text-body-md text-text-secondary">—</td>
                <td className="p-stack-md font-body-md text-body-md text-text-primary text-right">287</td>
                <td className="p-stack-md font-body-md text-body-md text-text-primary text-right font-bold">
                  {((287 / totalVotes) * 100).toFixed(2)}%
                </td>
                <td className="p-stack-md">
                  <div className="w-full bg-surface-variant h-4">
                    <div className="bg-surface-tint h-4" style={{ width: `${((287 / totalVotes) * 100)}%` }}></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

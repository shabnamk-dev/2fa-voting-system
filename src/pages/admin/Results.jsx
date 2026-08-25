import React, { useState, useEffect } from "react";
import { getResult } from "../../services/api";

export default function Results() {
  const [results, setResults] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getResult();
      const data = response.data?.data;
      setResults(data?.results || []);
      setTotalVotes(data?.total_votes || 0);
    } catch (err) {
      console.error("Failed to fetch results", err);
      setError("Failed to load election results.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center max-w-container-max mx-auto px-margin-page py-stack-lg w-full">
        <p className="font-body-lg text-body-lg text-text-secondary">Loading results…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 max-w-container-max mx-auto px-margin-page py-stack-lg w-full">
        <div className="border border-error bg-error-container p-4 text-error font-bold">{error}</div>
      </main>
    );
  }

  const leaderId = results.length > 0
    ? [...results].sort((a, b) => b.votes - a.votes)[0].candidate_id
    : null;

  return (
    <main className="flex-1 flex flex-col gap-stack-lg max-w-container-max mx-auto px-margin-page py-stack-lg w-full">
      <div>
        <h1 className="font-display text-display text-text-primary mb-stack-sm font-bold">Election Results</h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          Live vote tabulation, pulled directly from the database.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
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
            Verification Status
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <div className="font-headline-md text-headline-md text-text-primary font-semibold">
              Secured — 2FA Verified Voters Only
            </div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="border border-outline bg-surface-container-lowest flex flex-col">
        <div className="bg-surface-container-low p-stack-md border-b border-outline">
          <h2 className="font-headline-md text-headline-md text-text-primary font-semibold">Candidate Results</h2>
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
              {results.length === 0 && (
                <tr>
                  <td className="p-stack-md text-text-secondary" colSpan={5}>No results to display yet.</td>
                </tr>
              )}
              {results.map((row) => {
                const isAbstain = row.candidate_id === null;
                const isLeader = !isAbstain && row.candidate_id === leaderId && row.votes > 0;
                const barColor = isAbstain ? "bg-surface-tint" : isLeader ? "bg-secondary" : "bg-primary";
                return (
                  <tr key={row.candidate_id ?? "abstain"} className="border-b border-outline hover:bg-surface-main transition-none">
                    <td className={`p-stack-md font-body-md text-body-md text-text-primary font-bold ${isAbstain ? "italic" : ""}`}>
                      {row.name}
                    </td>
                    <td className="p-stack-md font-body-md text-body-md text-text-secondary">
                      {row.party || "—"}
                    </td>
                    <td className="p-stack-md font-body-md text-body-md text-text-primary text-right">
                      {row.votes.toLocaleString()}
                    </td>
                    <td className="p-stack-md font-body-md text-body-md text-text-primary text-right font-bold">
                      {row.percentage.toFixed(2)}%
                    </td>
                    <td className="p-stack-md">
                      <div className="w-full bg-surface-variant h-4">
                        <div className={`${barColor} h-4`} style={{ width: `${row.percentage}%` }}></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

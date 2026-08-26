import React, {useEffect, useState} from "react";
import { useNavigate } from "react-router-dom";
import { getCandidates, getElection } from "../../services/api";

export default function Candidates({ selectedCandidate, onSelectCandidate }) {
  const navigate = useNavigate();

  const [candidates, setCandidates] = useState([]);
  const [electionName, setElectionName] = useState("College Election");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [candidatesRes, electionRes] = await Promise.all([
          getCandidates(),
          getElection(),
        ]);

        // Backend returns candidates inside data.data
        const list = candidatesRes.data?.data || [];
        setCandidates(list);

        if (electionRes.data?.data?.name) {
          setElectionName(electionRes.data.data.name);
        }
      } catch (err) {
        console.error("Failed to fetch candidates:", err);
        setError("Failed to load candidates.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const notaCandidate = {
    id: "nota",
    name: "None of the Above",
    position: "Abstain",
    description:
      "Select this option to submit an abstained (blank) vote for this election.",
    image_url: null,
  };

  const allCandidates = [...candidates, notaCandidate];

  const handleSelect = (candidate) => {
    onSelectCandidate(candidate);
  };

  const handleNext = () => {
    if (!selectedCandidate) {
      alert("Please select a candidate or select Abstain before proceeding.");
      return;
    }

    navigate("/confirm-vote");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <main className="flex-grow w-full max-w-container-max mx-auto px-margin-page py-stack-lg">
        <h1 className="font-display text-display text-primary font-bold">
          Loading candidates...
        </h1>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-grow w-full max-w-container-max mx-auto px-margin-page py-stack-lg">
        <div className="border border-error bg-error-container p-4 text-error font-bold">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow w-full max-w-container-max mx-auto px-margin-page py-stack-lg grid grid-cols-1 md:grid-cols-12 gap-gutter">
      <div className="md:col-span-12 space-y-stack-lg">

        <header className="border-b border-outline pb-stack-sm mb-stack-md flex justify-between items-end flex-wrap gap-4">
          <div>
            <span className="font-label-md text-label-md text-text-secondary uppercase tracking-widest font-bold">
              Official Ballot
            </span>

            <h1 className="font-display text-display text-primary font-bold mt-1">
              {electionName}
            </h1>

            <p className="font-body-lg text-body-lg text-text-secondary mt-2">
              Select your preferred candidate or abstain from voting. All selections are hidden
              from others, and you may only submit once.
            </p>
          </div>
        </header>

        {/* Candidate Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">

          {allCandidates.map((cand) => {
            const isSelected =
              selectedCandidate && selectedCandidate.id === cand.id;

            const isNota = cand.id === "nota";

            return (
              <article
                key={cand.id}
                className={`flex flex-col h-full group relative transition-none ${
                  isSelected
                    ? "border-[4px] border-secondary bg-surface-container-lowest"
                    : "border border-outline bg-surface-container-lowest"
                }`}
              >

                {isSelected && (
                  <div className="absolute top-0 right-0 bg-secondary text-primary font-label-md text-label-md px-2 py-1 flex items-center gap-1 z-10 font-bold uppercase tracking-wider">
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{
                        fontVariationSettings: "'FILL' 1, 'wght' 700",
                      }}
                    >
                      check
                    </span>
                    Selected
                  </div>
                )}

                <div
                  className={`p-stack-md border-b border-outline ${
                    isSelected
                      ? "bg-secondary/15"
                      : "bg-surface-main"
                  }`}
                >
                  <h2 className="font-headline-md text-headline-md text-primary font-semibold">
                    {cand.name}
                  </h2>

                  <p className="font-label-lg text-label-lg text-text-secondary mt-1 uppercase tracking-wide">
                    {cand.position || cand.affiliation || "Candidate"}
                  </p>
                </div>

                <div className="p-stack-md flex-grow space-y-stack-sm flex flex-col justify-between">

                  <div>

                    <div className="w-full h-48 bg-surface-variant mb-4 border border-outline relative overflow-hidden flex items-center justify-center">

                      {cand.image_url ? (
                        <img
                          alt="Candidate"
                          className="object-cover w-full h-full grayscale"
                          src={cand.image_url}
                        />
                      ) : (
                        <span className="material-symbols-outlined text-[64px] text-text-secondary">
                          {isNota ? "block" : "person"}
                        </span>
                      )}

                    </div>

                    <p className="font-body-md text-body-md text-text-primary">
                      {cand.description || cand.platform || "No platform information available."}
                    </p>

                  </div>
                </div>

                <div className="p-stack-md pt-0">

                  <button
                    onClick={() => handleSelect(cand)}
                    className={`w-full font-label-lg text-label-lg py-3 transition-none text-center border ${
                      isSelected
                        ? "bg-secondary text-primary border-secondary cursor-default font-bold uppercase tracking-wider"
                        : "bg-surface-container-lowest text-primary border-outline hover:bg-surface-variant"
                    }`}
                  >
                    {isSelected
                      ? "Selected"
                      : isNota
                      ? "Abstain"
                      : "Select Candidate"}
                  </button>

                </div>

              </article>
            );
          })}

        </div>

        {/* Action Bar */}
        <div className="mt-stack-lg pt-stack-md border-t border-outline flex flex-col sm:flex-row justify-between items-center gap-4">

          <button
            onClick={handleBack}
            className="w-full sm:w-auto bg-surface-container-lowest text-primary border border-outline font-label-lg text-label-lg py-2 px-6 hover:bg-surface-variant transition-none flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">
              arrow_back
            </span>
            Cancel
          </button>

          <button
            onClick={handleNext}
            className="w-full sm:w-auto bg-primary text-on-primary font-label-lg text-label-lg py-2 px-8 border border-primary hover:bg-primary-container transition-none flex items-center justify-center gap-2"
          >
            Review Ballot
            <span className="material-symbols-outlined text-sm">
              arrow_forward
            </span>
          </button>

        </div>

      </div>
    </main>
  );
}

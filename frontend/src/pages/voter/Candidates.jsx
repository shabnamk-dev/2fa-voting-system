import React from "react";
import { useNavigate } from "react-router-dom";
import candidate1 from "../../assets/candidate1.png";
import candidate2 from "../../assets/candidate2.png";
import candidate3 from "../../assets/candidate3.png";

export default function Candidates({ selectedCandidate, onSelectCandidate }) {
  const navigate = useNavigate();

  // Base list of the 3 candidates for student council general secretary
  const baseCandidates = [
    {
      id: "sophia_martinez",
      name: "Sophia Martinez",
      affiliation: "General Secretary Candidate / Student Arts Union",
      platform: "Focus on organizing monthly cultural festivals, expanding campus common rooms, and introducing student-run project spaces.",
      image: candidate1
    },
    {
      id: "liam_zhang",
      name: "Liam Zhang",
      affiliation: "General Secretary Candidate / Tech & Hackathon Club",
      platform: "Advocates for developer laptops, campus-wide coding challenges, student incubator fund, and 24/7 library keycard access.",
      image: candidate2
    },
    {
      id: "marcus_thorne",
      name: "Marcus Thorne",
      affiliation: "General Secretary Candidate / Society of Student Engineers",
      platform: "Campaigns for parking subsidies, student engineering workshops, laboratory equipment upgrades, and campus green energy initiatives.",
      image: candidate3
    }
  ];

  // NOTA candidate object definition
  const notaCandidate = {
    id: "nota",
    name: "None of the Above",
    affiliation: "Abstain",
    platform: "Select this option to submit an abstained (blank) vote for this position.",
    image: null
  };

  const allCandidatesWithNota = [...baseCandidates, notaCandidate];

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

  return (
    <main className="flex-grow w-full max-w-container-max mx-auto px-margin-page py-stack-lg grid grid-cols-1 md:grid-cols-12 gap-gutter">
      <div className="md:col-span-12 space-y-stack-lg">
        <header className="border-b border-outline pb-stack-sm mb-stack-md flex justify-between items-end flex-wrap gap-4">
          <div>
            <span className="font-label-md text-label-md text-text-secondary uppercase tracking-widest font-bold">
              Official General Secretary Ballot
            </span>
            <h1 className="font-display text-display text-primary font-bold mt-1">Student Council General Secretary 2026</h1>
            <p className="font-body-lg text-body-lg text-text-secondary mt-2">
              Select your preferred candidate or abstain from voting for this position. All selections are hidden from others.
            </p>
          </div>
        </header>

        {/* Candidate Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
          {allCandidatesWithNota.map((cand) => {
            const isSelected = selectedCandidate && selectedCandidate.id === cand.id;
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
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}>check</span> Selected
                  </div>
                )}
                
                <div className={`p-stack-md border-b border-outline ${
                  isSelected ? "bg-secondary/15" : "bg-surface-main"
                }`}>
                  <h2 className="font-headline-md text-headline-md text-primary font-semibold">{cand.name}</h2>
                  <p className="font-label-lg text-label-lg text-text-secondary mt-1 uppercase tracking-wide">
                    {cand.affiliation}
                  </p>
                </div>

                <div className="p-stack-md flex-grow space-y-stack-sm flex flex-col justify-between">
                  <div>
                    <div className="w-full h-48 bg-surface-variant mb-4 border border-outline relative overflow-hidden flex items-center justify-center">
                      {cand.image ? (
                        <img 
                          alt={`Campaign Graphic`} 
                          className="object-cover w-full h-full grayscale" 
                          src={cand.image} 
                        />
                      ) : (
                        <span className="material-symbols-outlined text-[64px] text-text-secondary">
                          block
                        </span>
                      )}
                    </div>
                    <p className="font-body-md text-body-md text-text-primary">
                      {cand.platform}
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
                    {isSelected ? "Selected" : isNota ? "Abstain" : "Select Candidate"}
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
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Cancel
          </button>
          <button 
            onClick={handleNext}
            className="w-full sm:w-auto bg-primary text-on-primary font-label-lg text-label-lg py-2 px-8 border border-primary hover:bg-primary-container transition-none flex items-center justify-center gap-2"
          >
            Review Ballot
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>
    </main>
  );
}

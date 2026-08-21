import React, { useState, useEffect } from "react";
import { mockApi } from "../../services/mockApi";

export default function AdminDashboard() {
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  // Form Fields
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("General Secretary Candidate");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("Verified");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadCandidates();
  }, []);

  const loadCandidates = () => {
    const list = mockApi.getCandidates();
    setCandidates(list);
    if (list.length > 0) {
      handleSelectCandidate(list[0]);
    }
  };

  const handleSelectCandidate = (cand) => {
    setSelectedCandidate(cand);
    setName(cand.name);
    setAffiliation(cand.affiliation.split(" / ")[0]);
    setPlatform(cand.platform);
    setStatus(cand.status || "Verified");
    setIsEditing(true);
  };

  const handleNewCandidate = () => {
    setSelectedCandidate(null);
    setName("");
    setAffiliation("General Secretary Candidate");
    setPlatform("");
    setStatus("Pending");
    setIsEditing(false);
  };

  const handleDiscard = () => {
    if (selectedCandidate) {
      handleSelectCandidate(selectedCandidate);
    } else {
      handleNewCandidate();
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (name.trim() === "" || platform.trim() === "") {
      alert("Please fill in all candidate details.");
      return;
    }

    if (selectedCandidate) {
      // Update Candidate
      mockApi.updateCandidate(selectedCandidate.id, {
        name,
        affiliation: `${affiliation} / Faculty Candidate`,
        platform,
        status
      });
      alert("Candidate record updated successfully.");
    } else {
      // Add New Candidate
      mockApi.addCandidate(name, affiliation, platform);
      alert("New candidate created successfully.");
    }
    loadCandidates();
  };

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to revoke registration for ${name}?`)) {
      mockApi.deleteCandidate(id);
      loadCandidates();
    }
  };

  return (
    <div className="max-w-container-max mx-auto px-margin-page py-stack-lg w-full flex-grow">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-stack-lg border-b border-outline pb-stack-sm gap-4">
        <div>
          <h2 className="font-display text-display text-primary m-0 font-bold">Candidate Management</h2>
          <p className="font-body-md text-body-md text-text-secondary mt-1">
            Manage active candidates and review associated platform data.
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

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* Candidate List (Main Data Table) */}
        <div className="lg:col-span-8 border border-outline bg-surface-container-lowest flex flex-col">
          <div className="bg-surface-container-low border-b border-outline px-gutter py-stack-sm flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-headline-md text-headline-md text-primary m-0 font-semibold">Active Roster</h3>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2 top-1/2 transform -translate-y-1/2 text-text-secondary">
                search
              </span>
              <input
                className="pl-8 pr-3 py-1 border border-outline bg-surface-container-lowest font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none"
                placeholder="Search Candidate..."
                type="text"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container-lowest text-text-secondary font-label-md text-label-md uppercase">
                  <th className="py-3 px-gutter font-semibold">Reg ID</th>
                  <th className="py-3 px-gutter font-semibold">Candidate Name</th>
                  <th className="py-3 px-gutter font-semibold">Position</th>
                  <th className="py-3 px-gutter font-semibold">Status</th>
                  <th className="py-3 px-gutter font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-primary">
                {candidates.map((cand) => (
                  <tr 
                    key={cand.id} 
                    className="border-b border-outline even:bg-surface-main odd:bg-surface-container-lowest hover:bg-surface-container-high cursor-pointer"
                    onClick={() => handleSelectCandidate(cand)}
                  >
                    <td className="py-3 px-gutter font-mono text-sm">#{cand.id.substring(0, 6).toUpperCase()}</td>
                    <td className="py-3 px-gutter font-semibold">{cand.name}</td>
                    <td className="py-3 px-gutter">{cand.affiliation.split(" / ")[0]}</td>
                    <td className="py-3 px-gutter">
                      <span className={`inline-block px-2 py-1 font-label-md text-label-md uppercase border border-outline ${
                        cand.status === "Disqualified" 
                          ? "bg-error text-on-error" 
                          : cand.status === "Pending" 
                          ? "bg-surface-variant text-text-secondary" 
                          : "bg-secondary-fixed text-on-secondary-fixed"
                      }`}>
                        {cand.status || "Verified"}
                      </span>
                    </td>
                    <td className="py-3 px-gutter text-right" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => handleSelectCandidate(cand)}
                        aria-label="Edit" 
                        className="text-text-secondary hover:text-primary transition-none mr-2"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button 
                        onClick={() => handleDelete(cand.id, cand.name)}
                        aria-label="Revoke" 
                        className="text-text-secondary hover:text-error transition-none"
                      >
                        <span className="material-symbols-outlined text-sm">block</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Editor Form (Right Column) */}
        <div className="lg:col-span-4 flex flex-col gap-gutter">
          <div className="border border-outline bg-surface-container-lowest flex flex-col h-full">
            <div className="bg-surface-container-low border-b border-outline px-gutter py-stack-sm flex justify-between items-center">
              <h3 className="font-headline-md text-headline-md text-primary m-0 flex items-center font-semibold">
                <span className="material-symbols-outlined mr-2">edit_document</span>
                Record Editor
              </h3>
            </div>
            
            <div className="p-gutter flex-grow">
              <form onSubmit={handleSave} className="flex flex-col gap-stack-md">
                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Full Legal Name
                  </label>
                  <input
                    className="border border-outline bg-surface-container-lowest p-2 font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter Candidate Name"
                    required
                  />
                </div>

                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Position Contested
                  </label>
                  <select
                    className="border border-outline bg-surface-container-lowest p-2 font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none"
                    value={affiliation}
                    onChange={(e) => setAffiliation(e.target.value)}
                  >
                    <option value="General Secretary Candidate">General Secretary Candidate</option>
                    <option value="Vice General Secretary">Vice General Secretary</option>
                    <option value="Treasurer">Treasurer</option>
                    <option value="Arts Representative">Arts Representative</option>
                    <option value="Science Representative">Science Representative</option>
                    <option value="Engineering Representative">Engineering Representative</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Platform Abstract
                  </label>
                  <textarea
                    className="border border-outline bg-surface-container-lowest p-2 font-body-md text-body-md text-primary focus:outline-none focus:border-primary rounded-none resize-none"
                    rows="4"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    placeholder="Platform agenda details..."
                    required
                  />
                </div>

                <div className="flex flex-col">
                  <label className="font-label-lg text-label-lg text-primary mb-1 uppercase tracking-tight font-semibold">
                    Verification Status
                  </label>
                  <div className="flex items-center gap-4 border border-outline p-2 bg-surface-main">
                    <label className="flex items-center font-body-md text-body-md text-primary cursor-pointer select-none">
                      <input
                        checked={status === "Verified"}
                        onChange={() => setStatus("Verified")}
                        className="mr-2 appearance-none w-4 h-4 border border-outline checked:bg-secondary rounded-none cursor-pointer"
                        name="status"
                        type="radio"
                      />
                      Verified
                    </label>
                    <label className="flex items-center font-body-md text-body-md text-text-secondary cursor-pointer select-none">
                      <input
                        checked={status === "Pending"}
                        onChange={() => setStatus("Pending")}
                        className="mr-2 appearance-none w-4 h-4 border border-outline checked:bg-secondary rounded-none cursor-pointer"
                        name="status"
                        type="radio"
                      />
                      Pending
                    </label>
                    <label className="flex items-center font-body-md text-body-md text-text-secondary cursor-pointer select-none">
                      <input
                        checked={status === "Disqualified"}
                        onChange={() => setStatus("Disqualified")}
                        className="mr-2 appearance-none w-4 h-4 border border-outline checked:bg-secondary rounded-none cursor-pointer"
                        name="status"
                        type="radio"
                      />
                      Disqualified
                    </label>
                  </div>
                </div>

                <div className="border-t border-outline bg-surface-container-low p-gutter flex justify-end gap-stack-sm mt-8">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="bg-surface-container-lowest text-primary py-2 px-4 font-label-lg text-label-lg border border-outline hover:bg-surface-variant transition-none rounded-none"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    className="bg-secondary text-on-secondary py-2 px-4 font-label-lg text-label-lg border border-primary hover:bg-on-secondary-fixed-variant transition-none rounded-none font-semibold"
                  >
                    {selectedCandidate ? "Commit Changes" : "Create Candidate"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

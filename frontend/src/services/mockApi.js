import candidate1 from "../assets/candidate1.png";
import candidate2 from "../assets/candidate2.png";
import candidate3 from "../assets/candidate3.png";

// Mock Data and State Management for the Election Portal Prototype

// Initial default candidates
const DEFAULT_CANDIDATES = [
  {
    id: "sophia_martinez",
    name: "Sophia Martinez",
    affiliation: "General Secretary Candidate / Student Arts Union",
    platform: "Focus on organizing monthly cultural festivals, expanding campus common rooms, and introducing student-run project spaces.",
    image: candidate1,
    endorsements: "ArtsUnion, DramaSoc",
    votes: 6428,
  },
  {
    id: "liam_zhang",
    name: "Liam Zhang",
    affiliation: "General Secretary Candidate / Tech & Hackathon Club",
    platform: "Advocates for developer laptops, campus-wide coding challenges, student incubator fund, and 24/7 library keycard access.",
    image: candidate2,
    endorsements: "TechClub, HackersGroup",
    votes: 5142,
  },
  {
    id: "marcus_thorne",
    name: "Marcus Thorne",
    affiliation: "General Secretary Candidate / Society of Student Engineers",
    platform: "Campaigns for parking subsidies, student engineering workshops, laboratory equipment upgrades, and campus green energy initiatives.",
    image: candidate3,
    endorsements: "EngSoc, GreenCampus",
    votes: 2428,
  }
];

const getLocalStorage = (key, fallback) => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : fallback;
};

const setLocalStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const initializeMockDatabase = () => {
  if (!localStorage.getItem("avp_candidates")) {
    setLocalStorage("avp_candidates", DEFAULT_CANDIDATES);
  }
  if (!localStorage.getItem("avp_users")) {
    setLocalStorage("avp_users", [
      { studentId: "90210", email: "student@university.edu", password: "password123", role: "student", is2faSetup: true, hasVoted: false },
      { studentId: "admin", email: "admin@university.edu", password: "admin", role: "admin", is2faSetup: true }
    ]);
  }
};

export const mockApi = {
  login: (studentId, password) => {
    initializeMockDatabase();
    const users = getLocalStorage("avp_users", []);
    const user = users.find(u => u.studentId === studentId && u.password === password);
    if (!user) {
      throw new Error("Invalid Student ID or password.");
    }
    return { ...user };
  },

  register: (studentId, email, password) => {
    initializeMockDatabase();
    const users = getLocalStorage("avp_users", []);
    if (users.find(u => u.studentId === studentId)) {
      throw new Error("Student ID is already registered.");
    }
    const newUser = { studentId, email, password, role: "student", is2faSetup: false, hasVoted: false };
    users.push(newUser);
    setLocalStorage("avp_users", users);
    return newUser;
  },

  setup2fa: (studentId) => {
    initializeMockDatabase();
    const users = getLocalStorage("avp_users", []);
    const idx = users.findIndex(u => u.studentId === studentId);
    if (idx !== -1) {
      users[idx].is2faSetup = true;
      setLocalStorage("avp_users", users);
      return { ...users[idx] };
    }
    throw new Error("User not found.");
  },

  getCandidates: () => {
    initializeMockDatabase();
    return getLocalStorage("avp_candidates", []);
  },

  addCandidate: (name, affiliation, platform) => {
    initializeMockDatabase();
    const candidates = getLocalStorage("avp_candidates", []);
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const newCand = {
      id,
      name,
      affiliation,
      platform,
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop",
      endorsements: "General Faculty Council",
      votes: 0
    };
    candidates.push(newCand);
    setLocalStorage("avp_candidates", candidates);
    return newCand;
  },

  updateCandidate: (id, updatedFields) => {
    initializeMockDatabase();
    const candidates = getLocalStorage("avp_candidates", []);
    const idx = candidates.findIndex(c => c.id === id);
    if (idx !== -1) {
      candidates[idx] = { ...candidates[idx], ...updatedFields };
      setLocalStorage("avp_candidates", candidates);
      return candidates[idx];
    }
    throw new Error("Candidate not found.");
  },

  deleteCandidate: (id) => {
    initializeMockDatabase();
    let candidates = getLocalStorage("avp_candidates", []);
    candidates = candidates.filter(c => c.id !== id);
    setLocalStorage("avp_candidates", candidates);
  },

  submitVote: (studentId, candidateId) => {
    initializeMockDatabase();
    // 1. Mark student as voted
    const users = getLocalStorage("avp_users", []);
    const userIdx = users.findIndex(u => u.studentId === studentId);
    if (userIdx !== -1) {
      users[userIdx].hasVoted = true;
      setLocalStorage("avp_users", users);
    }

    // 2. Increment candidate votes if not an abstain (NOTA)
    const candidates = getLocalStorage("avp_candidates", []);
    const candIdx = candidates.findIndex(c => c.id === candidateId);
    if (candIdx !== -1) {
      candidates[candIdx].votes += 1;
      setLocalStorage("avp_candidates", candidates);
    }

    // 3. Generate transaction receipt
    const txHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return {
      txHash,
      timestamp: new Date().toISOString(),
      electionId: "ELC-2026-SYS-BETA"
    };
  }
};

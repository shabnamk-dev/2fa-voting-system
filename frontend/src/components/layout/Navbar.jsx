import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isActive = (path) => location.pathname === path;

  const isVotingActive = () => {
    return ["/dashboard", "/ballot", "/confirm-vote", "/receipt"].includes(location.pathname);
  };

  return (
    <>
      <header className="bg-primary text-on-primary font-body w-full top-0 border-b border-outline z-50 sticky">
        <div className="flex justify-between items-center w-full px-margin-page h-16">
          {/* Brand Logo */}
          <div
            onClick={() => navigate(user?.role === "admin" ? "/admin" : "/dashboard")}
            className="font-headline-md text-headline-md font-bold uppercase tracking-tight text-on-primary cursor-pointer select-none"
          >
            Academic Voting Portal
          </div>

          {/* Navigation Links (Desktop) */}
          {user && (
            <nav className="hidden md:flex space-x-6 h-full items-end">
              {user.role === "student" ? (
                <>
                  <Link
                    to="/dashboard"
                    className={`pb-3 border-b-2 transition-none text-body-md ${isVotingActive() ? "border-on-primary text-on-primary font-bold" : "border-transparent text-on-primary-container opacity-80 hover:opacity-100"
                      }`}
                  >
                    Voting
                  </Link>
                  <Link
                    to="/results"
                    className={`pb-3 border-b-2 transition-none text-body-md ${isActive("/results") ? "border-on-primary text-on-primary font-bold" : "border-transparent text-on-primary-container opacity-80 hover:opacity-100"
                      }`}
                  >
                    Results
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/admin"
                    className={`pb-3 border-b-2 transition-none text-body-md ${isActive("/admin") ? "border-on-primary text-on-primary font-bold" : "border-transparent text-on-primary-container opacity-80 hover:opacity-100"
                      }`}
                  >
                    Candidates
                  </Link>
                  <Link
                    to="/results"
                    className={`pb-3 border-b-2 transition-none text-body-md ${isActive("/results") ? "border-on-primary text-on-primary font-bold" : "border-transparent text-on-primary-container opacity-80 hover:opacity-100"
                      }`}
                  >
                    Results
                  </Link>
                </>
              )}
            </nav>
          )}

          {/* Trailing Actions */}
          <div className="flex items-center space-x-4">
            {user && (
              <>
                <button
                  onClick={onLogout}
                  className="bg-transparent border border-on-primary text-on-primary hover:bg-on-primary hover:text-primary transition-none font-label-md text-label-md uppercase tracking-wider px-4 py-2"
                >
                  Logout
                </button>
              </>
            )}

            {/* Mobile Menu Toggle */}
            {user && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 border border-outline text-on-primary hover:bg-on-primary-fixed-variant transition-none"
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer (Responsive Nav) */}
      {mobileMenuOpen && user && (
        <div className="md:hidden border-b border-outline bg-surface-container-high w-full z-40">
          <ul className="flex flex-col p-4 space-y-3 font-label-lg">
            {user.role === "student" ? (
              <>
                <li>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block py-2 ${isVotingActive() ? "font-bold text-primary" : "text-text-secondary"}`}
                  >
                    Voting
                  </Link>
                </li>
                <li>
                  <Link
                    to="/results"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block py-2 ${isActive("/results") ? "font-bold text-primary" : "text-text-secondary"}`}
                  >
                    Results
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block py-2 ${isActive("/admin") ? "font-bold text-primary" : "text-text-secondary"}`}
                  >
                    Candidate Management
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </>
  );
}

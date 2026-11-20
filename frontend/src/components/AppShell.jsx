import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Brand from "./Brand";
import { useAuth } from "../context/AuthContext";

const navigationGroups = [
  {
    label: "Workspace",
    items: [{ label: "Dashboard", icon: "dashboard", path: "/dashboard" }],
  },
  {
    label: "Money",
    items: [
      {
        label: "Transactions",
        icon: "transactions",
        path: "/transactions",
      },
      { label: "Budgets", icon: "budgets", path: "/budgets" },
      {
        label: "Savings Goals",
        icon: "savings",
        path: "/savings-goals",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", icon: "analytics", path: "/analytics" },
      { label: "Reports", icon: "reports", path: "/reports" },
      { label: "AI Financial Advisor", icon: "advisor", path: "/advisor" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", icon: "profile", path: "/profile" },
      { label: "Settings", icon: "settings", path: "/settings" },
    ],
  },
];

const navigationIcons = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  transactions: (
    <>
      <path d="M5 7h14M5 12h14M5 17h8" />
      <circle cx="18" cy="17" r="2" />
    </>
  ),
  budgets: (
    <>
      <path d="M4 19.5h16M6.5 16V10m5 6V5m5 11v-4" />
      <path d="M4 7.5 10 4l5 4 5-3" />
    </>
  ),
  savings: (
    <>
      <path d="M4 10.5h16v9H4zM6.5 10.5V7.8A2.8 2.8 0 0 1 9.3 5h5.4a2.8 2.8 0 0 1 2.8 2.8v2.7" />
      <path d="M10 15h4m-2-2v4" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 19.5h16M6.5 16v-4m5 4V6m5 10V9" />
      <path d="m5 8 5-3 5 2 4-4" />
    </>
  ),
  reports: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4M9 12h6m-6 4h6" />
    </>
  ),
  advisor: (
    <>
      <path d="M12 3.5a7.5 7.5 0 0 0-4.2 13.7V20h8.4v-2.8A7.5 7.5 0 0 0 12 3.5Z" />
      <path d="M9.5 20v1.5h5V20m-2.5-12v5m-2.2-2.5L12 13l2.2-2.5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  settings: (
    <>
      <path d="M12 3.5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.4 1.4m-9.2 9.2L6 18m12 0-1.4-1.4m-9.2-9.2L6 6" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
};

function NavigationIcon({ name }) {
  return (
    <svg
      className="navigation-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {navigationIcons[name]}
    </svg>
  );
}

function AppShell({ pageTitle, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const metadataName = user?.user_metadata?.full_name;
  const accountName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    user?.email ||
    "Account";
  const accountInitial = accountName.charAt(0).toUpperCase() || "A";

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSignOutError("");

    try {
      const { error } = await logout();

      if (error) {
        setSignOutError("We couldn't log you out. Please try again.");
        return;
      }

      navigate("/login", { replace: true });
    } catch {
      setSignOutError("We couldn't log you out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-brand">
          <Brand />
        </div>

        <nav className="sidebar-navigation" aria-label="Main navigation">
          {navigationGroups.map((group) => (
            <section className="navigation-group" key={group.label}>
              <h2 className="navigation-group-label">{group.label}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.label}>
                    {item.path ? (
                      <NavLink
                        to={item.path}
                        end
                        className={({ isActive }) =>
                          `navigation-link${isActive ? " is-active" : ""}`
                        }
                      >
                        <NavigationIcon name={item.icon} />
                        <span>{item.label}</span>
                      </NavLink>
                    ) : (
                      <div
                        className="navigation-link is-unavailable"
                        aria-disabled="true"
                        title={`${item.label} isn't available yet`}
                      >
                        <NavigationIcon name={item.icon} />
                        <span>{item.label}</span>
                        <span className="navigation-status">Soon</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className="sidebar-footnote">
          <span className="sidebar-footnote-mark" aria-hidden="true" />
          <span>A focused space for your finances</span>
        </div>
      </aside>

      <div className="dashboard-workspace">
        <header className="dashboard-topbar">
          <div className="topbar-location">
            <span>Workspace</span>
            <span className="topbar-separator" aria-hidden="true">
              /
            </span>
            <strong>{pageTitle}</strong>
          </div>

          <details className="account-menu">
            <summary aria-label="Open account menu">
              <span className="account-avatar" aria-hidden="true">
                {accountInitial}
              </span>
              <span className="account-menu-name">{accountName}</span>
              <svg
                className="account-menu-chevron"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m5 7.5 5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="account-menu-panel">
              <p className="account-menu-label">Signed in as</p>
              <p className="account-menu-email">{user?.email || accountName}</p>
              {signOutError && (
                <p className="account-menu-error" role="alert">
                  {signOutError}
                </p>
              )}
              <button
                type="button"
                className="account-logout-button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                aria-busy={isSigningOut}
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </details>
        </header>

        <main className="dashboard-page">
          {children}
          <footer className="dashboard-footer">
            <Brand className="brand-footer" />
            <span>Personal finance, with clarity.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default AppShell;


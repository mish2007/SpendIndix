import { useAuth } from "../context/AuthContext";
import "./Profile.css";

function formatMemberSince(createdAt) {
  if (typeof createdAt !== "string" || !createdAt.trim()) {
    return "Not available";
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function ProfilePage() {
  const { user } = useAuth();
  const fullName =
    typeof user?.user_metadata?.full_name === "string" &&
    user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : "Name not available";
  const email =
    typeof user?.email === "string" && user.email.trim()
      ? user.email.trim()
      : "Email not available";

  return (
    <section className="profile-page" aria-labelledby="profile-heading">
      <header className="profile-page-heading">
        <p className="eyebrow">Account</p>
        <h1 id="profile-heading">Your profile</h1>
        <p className="dashboard-page-subtitle">
          Your account information, shown securely and read-only.
        </p>
      </header>

      <article className="profile-card">
        <div className="profile-identity">
          <div className="profile-person-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
            </svg>
          </div>
          <div className="profile-identity-copy">
            <h2>{fullName}</h2>
            <p>{email}</p>
          </div>
        </div>

        <dl className="profile-details">
          <div className="profile-detail">
            <dt>Full name</dt>
            <dd>{fullName}</dd>
          </div>
          <div className="profile-detail">
            <dt>Email address</dt>
            <dd>{email}</dd>
          </div>
          <div className="profile-detail">
            <dt>Member since</dt>
            <dd>{formatMemberSince(user?.created_at)}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

export default ProfilePage;

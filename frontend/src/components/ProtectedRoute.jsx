import { Navigate } from "react-router-dom";
import Brand from "./Brand";
import { useAuth } from "../context/AuthContext.js";

function ProtectedRoute({ children }) {
  const { session, isLoading, authError } = useAuth();

  if (isLoading) {
    return (
      <main className="auth-page">
        <section className="auth-card" role="status" aria-live="polite">
          <div className="auth-header">
            <Brand />
            <h1>Checking your account</h1>
            <p>Checking your session...</p>
          </div>
        </section>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert">
          <div className="auth-header">
            <h1>Unable to verify your session</h1>
            <p>{authError}</p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;

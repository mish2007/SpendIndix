import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Brand from "../components/Brand";
import { useAuth } from "../context/AuthContext";

function EmailConfirmationCallback() {
  const location = useLocation();
  const { session, user, isLoading, authError } = useAuth();
  const [callbackParams] = useState(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.slice(1));

    return {
      error:
        searchParams.get("error") ||
        hashParams.get("error") ||
        searchParams.get("error_code") ||
        hashParams.get("error_code") ||
        searchParams.get("error_description") ||
        hashParams.get("error_description"),
      errorDescription:
        searchParams.get("error_description") ||
        hashParams.get("error_description") ||
        "",
      errorCode:
        searchParams.get("error_code") ||
        hashParams.get("error_code") ||
        searchParams.get("error") ||
        hashParams.get("error") ||
        "",
      type: searchParams.get("type") || hashParams.get("type") || "",
      accessToken: hashParams.get("access_token") || "",
    };
  });

  let status = "error";
  let heading = "Unable to confirm your email";
  let description =
    "This confirmation link may be invalid or expired. Please try again or return to registration.";

  if (callbackParams.error) {
    const callbackError =
      `${callbackParams.errorCode} ${callbackParams.errorDescription}`.toLowerCase();

    if (callbackError.includes("expired")) {
      description =
        "This confirmation link has expired. Please return to registration for help getting a new link.";
    } else if (/invalid|already|used|access_denied|otp/.test(callbackError)) {
      description =
        "This confirmation link is invalid or has already been used. Please return to registration or sign in if your email is already confirmed.";
    } else {
      heading = "We couldn't verify your confirmation";
      description =
        "There was a problem confirming your email. Please try again later.";
    }
  } else if (isLoading) {
    status = "loading";
    heading = "Confirming your email";
    description = "Please wait while we verify your confirmation link.";
  } else if (authError) {
    heading = "We couldn't verify your confirmation";
    description =
      "There was a problem checking your account. Please try again later.";
  } else if (
    callbackParams.accessToken &&
    session?.access_token === callbackParams.accessToken &&
    ["signup", "email"].includes(callbackParams.type) &&
    user?.email_confirmed_at
  ) {
    status = "success";
    heading = "Email confirmed";
    description = "Your email is confirmed. You can now log in.";
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Brand />

        <div className="auth-header">
          <h1>{heading}</h1>
          {status === "loading" && (
            <p role="status" aria-live="polite">
              {description}
            </p>
          )}
        </div>

        {status === "success" && (
          <div className="forgot-success" role="status">
            <div className="success-icon">✓</div>
            <p>{description}</p>
            <Link to="/login" className="primary-button">
              Continue to Login
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="forgot-success" role="alert">
            <p className="form-error">{description}</p>
            <Link to="/register" className="primary-button">
              Back to Registration
            </Link>
            <p className="login-text">
              Already confirmed?{" "}
              <Link to="/login" className="login-link">
                Login
              </Link>
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

export default EmailConfirmationCallback;

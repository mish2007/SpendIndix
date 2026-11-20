import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Brand from "../components/Brand";
import { supabase } from "../lib/supabaseClient";

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function getEmailError(email) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return "Email Address is required.";
  }

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return "Please enter a valid email address.";
  }

  return "";
}

function isUnknownAccountError(error) {
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  return (
    code === "user_not_found" ||
    /user (not found|does not exist)/.test(message)
  );
}

function getRequestErrorMessage(error) {
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (
    error?.status === 429 ||
    code.includes("rate_limit") ||
    /too many requests|rate limit/.test(message)
  ) {
    return "Too many reset requests. Please wait a moment before trying again.";
  }

  if (
    error?.name === "AuthRetryableFetchError" ||
    /network|failed to fetch|fetch failed|load failed|timeout/.test(message)
  ) {
    return "We couldn't connect to the password reset service. Check your connection and try again.";
  }

  return "We couldn't send reset instructions right now. Please try again.";
}

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInProgress = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    const emailError = getEmailError(email);
    if (emailError) {
      setEmailError(emailError);
      return;
    }

    submissionInProgress.current = true;
    setIsSubmitting(true);
    setEmailError("");
    setRequestError("");

    try {
      const { error: requestError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });

      if (requestError && !isUnknownAccountError(requestError)) {
        setRequestError(getRequestErrorMessage(requestError));
        return;
      }

      setSubmitted(true);
    } catch (requestError) {
      setRequestError(getRequestErrorMessage(requestError));
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Brand />

        <div className="auth-header">
          <h1>Forgot Password?</h1>

          <p>Enter your email address and we'll help you reset your password.</p>
        </div>

        {!submitted ? (
          <form
            className="register-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="form-group">
              <label htmlFor="forgot-email">Email Address</label>

              <input
                id="forgot-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => {
                  const nextEmail = event.target.value;
                  setEmail(nextEmail);
                  setEmailError((currentError) =>
                    currentError ? getEmailError(nextEmail) : "",
                  );
                  setRequestError("");
                }}
                autoComplete="email"
                required
                placeholder="Enter your email address"
                aria-invalid={Boolean(emailError)}
                aria-describedby={
                  emailError ? "forgot-email-error" : undefined
                }
                className={
                  emailError ? "form-input input-error" : "form-input"
                }
              />

              {emailError && (
                <p id="forgot-email-error" className="form-error" role="alert">
                  {emailError}
                </p>
              )}
            </div>

            {requestError && (
              <p className="form-error" role="alert">
                {requestError}
              </p>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send Reset Instructions"}
            </button>

            <p className="login-text">
              Remember your password?{" "}
              <Link to="/login" className="login-link">
                Login
              </Link>
            </p>
          </form>
        ) : (
          <div className="forgot-success">
            <div className="success-icon">✓</div>

            <h2>Check your email</h2>

            <p role="status" aria-live="polite">
              If an account exists for this address, we'll send a password
              reset link. Check your inbox and Spam or Junk folder.
            </p>

            <Link to="/login" className="primary-button">
              Back to Login
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

export default ForgotPassword;
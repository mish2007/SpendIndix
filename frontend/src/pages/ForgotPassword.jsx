import { useState } from "react";
import { Link } from "react-router-dom";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Email Address is required.");
      setSubmitted(false);
      return;
    }

    if (
      !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
        trimmedEmail
      )
    ) {
      setError("Please enter a valid email address.");
      setSubmitted(false);
      return;
    }

    setError("");
    setSubmitted(true);
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-mark">S</div>
          <span className="brand-name">SpendIndix</span>
        </div>

        <div className="auth-header">
          <h1>Forgot Password?</h1>

          <p>
            Enter your registered email address and we'll help you
            reset your password.
          </p>
        </div>

        {!submitted ? (
          <form className="register-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="forgot-email">
                Email Address
              </label>

              <input
                id="forgot-email"
                name="email"
                type="text"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="Enter your email address"
                className={
                  error
                    ? "form-input input-error"
                    : "form-input"
                }
              />

              {error && (
                <p className="form-error">{error}</p>
              )}
            </div>

            <button type="submit" className="primary-button">
              Send Reset Instructions
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

            <p>
              If an account exists with this email address, reset
              instructions will be sent to you.
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
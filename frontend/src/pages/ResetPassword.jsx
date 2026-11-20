import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Brand from "../components/Brand";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

function getFieldError(fieldName, formData) {
  if (fieldName === "password") {
    if (!formData.password) {
      return "New password is required.";
    }

    if (formData.password.length < 8) {
      return "Password must be at least 8 characters long.";
    }

    if (!/\d/.test(formData.password)) {
      return "Password must contain at least one number.";
    }
  }

  if (fieldName === "confirmPassword") {
    if (!formData.confirmPassword) {
      return "Please confirm your new password.";
    }

    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match.";
    }
  }

  return "";
}

function isWeakPasswordError(error) {
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  return (
    code === "weak_password" ||
    (message.includes("password") &&
      /weak|short|characters|strength/.test(message))
  );
}

function getUpdateErrorMessage(error) {
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (
    error?.status === 401 ||
    error?.status === 403 ||
    /expired|invalid|used|session missing|not authenticated|otp/.test(
      `${code} ${message}`,
    )
  ) {
    return "This reset link has expired or has already been used. Request a new reset link to continue.";
  }

  if (
    error?.name === "AuthRetryableFetchError" ||
    /network|failed to fetch|fetch failed|load failed|timeout/.test(message)
  ) {
    return "We couldn't connect to the password reset service. Check your connection and try again.";
  }

  return "We couldn't update your password right now. Please try again.";
}

function PasswordToggleIcon({ visible }) {
  return visible ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.1 4.4" />
      <path d="M6.1 6.1C3.6 8 2 12 2 12s3.5 8 10 8a10.6 10.6 0 0 0 2.1-.2" />
    </svg>
  );
}

function PasswordField({
  name,
  label,
  value,
  visible,
  error,
  touched,
  isSubmitting,
  onChange,
  onBlur,
  onToggle,
}) {
  const errorId = `${name}-error`;

  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <div className="password-wrapper">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={
            name === "password"
              ? "Enter your new password"
              : "Re-enter your new password"
          }
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          aria-invalid={Boolean(touched && error)}
          aria-describedby={touched && error ? errorId : undefined}
          className={
            !touched
              ? "form-input"
              : error
                ? "form-input input-error"
                : "form-input input-success"
          }
        />
        <button
          type="button"
          className="password-toggle"
          onClick={onToggle}
          disabled={isSubmitting}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          <PasswordToggleIcon visible={visible} />
        </button>
      </div>
      {touched && error && (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ResetPassword() {
  const { session, isLoading, authError, isPasswordRecovery } = useAuth();
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [signOutWarning, setSignOutWarning] = useState("");
  const submissionInProgress = useRef(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextFormData = { ...formData, [name]: value };

    setFormData(nextFormData);
    setTouched((previousTouched) => ({ ...previousTouched, [name]: true }));
    setErrors((previousErrors) => {
      const nextErrors = {
        ...previousErrors,
        [name]: touched[name] ? getFieldError(name, nextFormData) : "",
      };

      if (name === "password" && touched.confirmPassword) {
        nextErrors.confirmPassword = getFieldError(
          "confirmPassword",
          nextFormData,
        );
      }

      return nextErrors;
    });
    setFormError("");
  };

  const handleBlur = (event) => {
    const { name } = event.target;

    setTouched((previousTouched) => ({ ...previousTouched, [name]: true }));
    setErrors((previousErrors) => ({
      ...previousErrors,
      [name]: getFieldError(name, formData),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    const validationErrors = {
      password: getFieldError("password", formData),
      confirmPassword: getFieldError("confirmPassword", formData),
    };
    const nextErrors = Object.fromEntries(
      Object.entries(validationErrors).filter(([, error]) => error),
    );

    setTouched({ password: true, confirmPassword: true });
    setErrors(nextErrors);
    setFormError("");

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.password,
      });

      if (error) {
        if (isWeakPasswordError(error)) {
          setErrors((previousErrors) => ({
            ...previousErrors,
            password:
              "Choose a stronger password that meets the password requirements.",
          }));
        } else {
          setFormError(getUpdateErrorMessage(error));
        }
        return;
      }

      setPasswordUpdated(true);

      try {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: "local",
        });

        if (signOutError) {
          setSignOutWarning(
            "Your password was updated, but we couldn't end this session automatically. Please continue to Login.",
          );
        }
      } catch {
        setSignOutWarning(
          "Your password was updated, but we couldn't end this session automatically. Please continue to Login.",
        );
      }
    } catch (error) {
      setFormError(getUpdateErrorMessage(error));
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  };

  let content;

  if (isLoading) {
    content = (
      <div className="forgot-success" role="status" aria-live="polite">
        <p>Verifying your password reset link...</p>
      </div>
    );
  } else if (passwordUpdated) {
    content = (
      <div className="forgot-success" role="status" aria-live="polite">
        <div className="success-icon">✓</div>
        <h2>Password updated</h2>
        <p>
          Your password has been changed. You can now log in using your new
          password.
        </p>
        {signOutWarning && (
          <p className="form-error" role="alert">
            {signOutWarning}
          </p>
        )}
        <Link to="/login" className="primary-button">
          Continue to Login
        </Link>
      </div>
    );
  } else if (authError || !session || !isPasswordRecovery) {
    content = (
      <div className="forgot-success" role="alert">
        <p className="form-error">
          This password reset link is invalid, expired, or has already been
          used. Request a new reset link to continue.
        </p>
        <Link to="/forgot-password" className="primary-button">
          Request a New Reset Link
        </Link>
        <p className="login-text">
          <Link to="/login" className="login-link">
            Back to Login
          </Link>
        </p>
      </div>
    );
  } else {
    content = (
      <form
        className="register-form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        <PasswordField
          name="password"
          label="New Password"
          value={formData.password}
          visible={showPassword}
          error={errors.password}
          touched={touched.password}
          isSubmitting={isSubmitting}
          onChange={handleChange}
          onBlur={handleBlur}
          onToggle={() => setShowPassword((visible) => !visible)}
        />

        <PasswordField
          name="confirmPassword"
          label="Confirm New Password"
          value={formData.confirmPassword}
          visible={showConfirmPassword}
          error={errors.confirmPassword}
          touched={touched.confirmPassword}
          isSubmitting={isSubmitting}
          onChange={handleChange}
          onBlur={handleBlur}
          onToggle={() =>
            setShowConfirmPassword((visible) => !visible)
          }
        />

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <button
          type="submit"
          className="primary-button"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Updating Password..." : "Reset Password"}
        </button>

        <p className="login-text">
          Need a new reset link?{" "}
          <Link to="/forgot-password" className="login-link">
            Request one
          </Link>
        </p>
        <p className="login-text">
          Remember your password?{" "}
          <Link to="/login" className="login-link">
            Login
          </Link>
        </p>
      </form>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Brand />

        <div className="auth-header">
          <h1>Reset Password</h1>
          <p>Create a new password for your SpendIndix account.</p>
        </div>

        {content}
      </section>
    </main>
  );
}

export default ResetPassword;

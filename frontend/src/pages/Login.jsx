import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import { useAuth } from "../context/AuthContext";
import {
  clearNextSignInRememberMe,
  persistCurrentAuthSession,
  setNextSignInRememberMe,
  supabase,
} from "../lib/supabaseClient";

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function getFieldError(fieldName, value) {
  if (fieldName === "email") {
    const email = value.trim();

    if (!email) {
      return "Email Address is required.";
    }

    if (!EMAIL_PATTERN.test(email)) {
      return "Please enter a valid email address.";
    }
  }

  if (fieldName === "password" && !value) {
    return "Password is required.";
  }

  return "";
}

function getLoginErrorMessage(error) {
  const errorCode =
    typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const errorMessage =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (
    errorCode === "email_not_confirmed" ||
    errorMessage.includes("email not confirmed")
  ) {
    return "Please confirm your email address before logging in. Check your inbox for the confirmation link.";
  }

  if (
    error?.status === 429 ||
    errorCode.includes("rate_limit") ||
    /too many requests|rate limit/.test(errorMessage)
  ) {
    return "Too many login attempts. Please wait a moment before trying again.";
  }

  if (
    error?.name === "AuthRetryableFetchError" ||
    /network|failed to fetch|fetch failed|load failed|timeout/.test(
      errorMessage,
    )
  ) {
    return "Unable to connect right now. Check your connection and try again.";
  }

  if (
    errorCode === "invalid_credentials" ||
    /invalid login credentials|invalid credentials/.test(errorMessage)
  ) {
    return "Email or password is incorrect.";
  }

  return "We couldn't log you in right now. Please try again.";
}

function Login() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleSignInError, setGoogleSignInError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [authenticatedUserId, setAuthenticatedUserId] = useState(null);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  useEffect(() => {
    if (authenticatedUserId && session?.user?.id === authenticatedUserId) {
      navigate("/dashboard", { replace: true });
    }
  }, [authenticatedUserId, session, navigate]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    const updatedValue = type === "checkbox" ? checked : value;

    setFormData((previousData) => ({
      ...previousData,
      [name]: updatedValue,
    }));

    setTouched((previousTouched) => ({
      ...previousTouched,
      [name]: true,
    }));

    if (name === "email" || name === "password") {
      setErrors((previousErrors) => ({
        ...previousErrors,
        [name]: getFieldError(name, updatedValue),
      }));
      setLoginError("");
    }
  };

  const validateSingleField = (fieldName) => {
    const newErrors = { ...errors };
    const error = getFieldError(fieldName, formData[fieldName]);

    if (error) {
      newErrors[fieldName] = error;
    } else {
      delete newErrors[fieldName];
    }

    setErrors(newErrors);
  };

  const handleBlur = (event) => {
    const { name } = event.target;

    setTouched((previousTouched) => ({
      ...previousTouched,
      [name]: true,
    }));

    validateSingleField(name);
  };

  const validateForm = () => {
    const newErrors = {};

    ["email", "password"].forEach((fieldName) => {
      const error = getFieldError(fieldName, formData[fieldName]);
      if (error) {
        newErrors[fieldName] = error;
      }
    });

    return newErrors;
  };

  const getInputClass = (fieldName) => {
    if (!touched[fieldName]) {
      return "form-input";
    }

    if (errors[fieldName]) {
      return "form-input input-error";
    }

    return "form-input input-success";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const validationErrors = validateForm();
    setErrors(validationErrors);
    setTouched((previousTouched) => ({
      ...previousTouched,
      email: true,
      password: true,
    }));
    setLoginError("");
    setAuthenticatedUserId(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
      });

      if (error) {
        setLoginError(getLoginErrorMessage(error));
        return;
      }

      if (!data.session || !data.user) {
        setLoginError("We couldn't start your session. Please try again.");
        return;
      }

      if (!persistCurrentAuthSession(formData.rememberMe)) {
        setLoginError(
          "You are signed in, but we couldn't apply the Remember Me setting. Please try again.",
        );
        return;
      }

      setAuthenticatedUserId(data.user.id);
    } catch (error) {
      setLoginError(getLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setGoogleSignInError("");
    setNextSignInRememberMe(formData.rememberMe);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        clearNextSignInRememberMe();
        setGoogleSignInError(
          "We couldn't start Google sign-in. Please try again.",
        );
        setIsGoogleLoading(false);
      }
    } catch {
      clearNextSignInRememberMe();
      setGoogleSignInError(
        "We couldn't start Google sign-in. Please try again.",
      );
      setIsGoogleLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Brand />

        <div className="auth-header">
          <h1>Welcome back</h1>
          <p>Login to your SpendIndix account.</p>
        </div>

        <form
          className="register-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Email */}
          <div className="form-group">
            <label htmlFor="email">Email Address</label>

            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Enter your email address"
              className={getInputClass("email")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "login-email-error" : undefined}
            />

            {errors.email && (
              <p id="login-email-error" className="form-error">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password">Password</label>

            <div className="password-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter your password"
                className={getInputClass("password")}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "login-password-error" : undefined
                }
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showPassword ? (
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
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.1 4.4" />
                    <path d="M6.1 6.1C3.6 6 2 12 2 12s3.5 8 10 8a10.6 10.6 0 0 0 2.1-.2" />
                  </svg>
                )}
              </button>
            </div>

            {errors.password && (
              <p id="login-password-error" className="form-error">
                {errors.password}
              </p>
            )}
          </div>

          {/* Remember Me and Forgot Password */}
          <div className="login-options">
            <label className="remember-label">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
              />
              <span>Remember Me</span>
            </label>

            <Link to="/forgot-password" className="forgot-link">
              Forgot Password?
            </Link>
          </div>

          {/* Login */}
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
          {loginError && (
            <p className="form-error" role="alert">
              {loginError}
            </p>
          )}

          <div className="divider">
            <span>OR</span>
          </div>

          {/* Google Login */}
          <button
            type="button"
            className="google-button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            aria-busy={isGoogleLoading}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.27-2.09 3.56-5.17 3.56-8.64z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.43 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.25v3.09A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.25 14.27A7.23 7.23 0 0 1 4.87 12c0-.79.14-1.56.38-2.27V6.64H1.25A12 12 0 0 0 0 12c0 1.93.46 3.76 1.25 5.36l4-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.76c1.77 0 3.36.61 4.61 1.81l3.43-3.43C17.95 1.17 15.24 0 12 0A12 12 0 0 0 1.25 6.64l4 3.09C6.2 6.88 8.86 4.76 12 4.76z"
              />
            </svg>

            <span>
              {isGoogleLoading
                ? "Connecting to Google..."
                : "Continue with Google"}
            </span>
          </button>
          {googleSignInError && (
            <p className="form-error" role="alert">
              {googleSignInError}
            </p>
          )}

          {/* Registration Link */}
          <p className="login-text">
            Don't have an account?{" "}
            <Link to="/register" className="login-link">
              Register
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

export default Login;
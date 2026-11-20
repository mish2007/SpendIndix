import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Brand from "../components/Brand";
import { loadCurrencyOptions } from "../data/currencyData";
import { supabase } from "../lib/supabaseClient";

function getRegistrationErrorMessage(error) {
  const errorCode =
    typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const errorMessage =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (
    errorCode === "user_already_exists" ||
    errorCode === "email_exists" ||
    /already (registered|exists)/.test(errorMessage)
  ) {
    return "An account with this email may already exist. Try logging in or resetting your password.";
  }

  if (
    errorCode === "weak_password" ||
    (errorMessage.includes("password") &&
      /weak|short|characters|strength/.test(errorMessage))
  ) {
    return "Choose a stronger password that meets the password requirements.";
  }

  if (
    errorCode === "email_address_invalid" ||
    errorMessage.includes("invalid email")
  ) {
    return "Please enter a valid email address.";
  }

  if (errorCode === "over_email_send_rate_limit" || error?.status === 429) {
    return "Too many registration attempts. Please wait before trying again.";
  }

  if (
    error?.name === "AuthRetryableFetchError" ||
    /network|failed to fetch|fetch failed|load failed/.test(errorMessage)
  ) {
    return "We couldn't reach the registration service. Check your connection and try again.";
  }

  return "We couldn't create your account right now. Please try again.";
}

function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleSignInError, setGoogleSignInError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [currencyLoading, setCurrencyLoading] = useState(true);
  const [currencySearch, setCurrencySearch] = useState("");
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const filteredCurrencyOptions = currencyOptions.filter((currency) => {
  const searchText = currencySearch.trim().toLowerCase();

  if (!searchText) {
    return true;
  }

  return (
    currency.name.toLowerCase().includes(searchText) ||
    currency.code.toLowerCase().includes(searchText)
  );
});

  useEffect(() => {
    const loadCurrencies = async () => {
      try {
        const data = await loadCurrencyOptions();
        setCurrencyOptions(data);
      } catch (error) {
        console.error("Failed to load currency data:", error);
      } finally {
        setCurrencyLoading(false);
      }
    };

    loadCurrencies();
  }, []);

  const [formData, setFormData] = useState({
    Name: "",
    email: "",
    password: "",
    confirmPassword: "",
    currency: "",
    termsAccepted: false,
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

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

    setErrors((previousErrors) => ({
      ...previousErrors,
      [name]: "",
    }));

    setRegistrationError("");
  };

  const handleBlur = (event) => {
    const { name } = event.target;

    setTouched((previousTouched) => ({
      ...previousTouched,
      [name]: true,
    }));

    validateSingleField(name);
  };

  const validateSingleField = (fieldName) => {
    const newErrors = { ...errors };

    if (fieldName === "Name") {
      const Name = formData.Name.trim();

      if (!Name) {
        newErrors.Name = "Name is required.";
      } else if (
        !/[A-Za-z]/.test(Name) ||
        /[^A-Za-z\s'-]/.test(Name)
      ) {
        newErrors.Name = "Please enter a valid name.";
      } else {
        delete newErrors.Name;
      }
    }

    if (fieldName === "email") {
      const email = formData.email.trim();

      if (!email) {
        newErrors.email = "Email Address is required.";
      } else if (
        !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
          email
        )
      ) {
        newErrors.email = "Please enter a valid email address.";
      } else {
        delete newErrors.email;
      }
    }

    if (fieldName === "password") {
      if (!formData.password) {
        newErrors.password = "Password is required.";
      } else if (formData.password.length < 8) {
        newErrors.password =
          "Password must be at least 8 characters long.";
      } else if (!/\d/.test(formData.password)) {
        newErrors.password =
          "Password must contain at least one number.";
      } else {
        delete newErrors.password;
      }
    }

    if (fieldName === "confirmPassword") {
      if (!formData.confirmPassword) {
        newErrors.confirmPassword =
          "Please confirm your password.";
      } else if (
        formData.password !== formData.confirmPassword
      ) {
        newErrors.confirmPassword = "Passwords do not match.";
      } else {
        delete newErrors.confirmPassword;
      }
    }

    if (fieldName === "termsAccepted") {
      if (!formData.termsAccepted) {
        newErrors.termsAccepted =
          "Please agree to the Terms and Conditions.";
      } else {
        delete newErrors.termsAccepted;
      }
    }

    if (fieldName === "currency") {
      if (!formData.currency) {
        newErrors.currency = "Please select a currency.";
      } else {
        delete newErrors.currency;
      }
    }

    setErrors(newErrors);
  };

  const validateForm = () => {
    const newErrors = {};

    const Name = formData.Name.trim();
    const email = formData.email.trim();

    if (!Name) {
      newErrors.Name = "Name is required.";
    } else if (
      !/[A-Za-z]/.test(Name) ||
      /[^A-Za-z\s'-]/.test(Name)
    ) {
      newErrors.Name = "Please enter a valid name.";
    }

    if (!email) {
      newErrors.email = "Email Address is required.";
    } else if (
      !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
        email
      )
    ) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!formData.password) {
      newErrors.password = "Password is required.";
    } else if (formData.password.length < 8) {
      newErrors.password =
        "Password must be at least 8 characters long.";
    } else if (!/\d/.test(formData.password)) {
      newErrors.password =
        "Password must contain at least one number.";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword =
        "Please confirm your password.";
    } else if (
      formData.password !== formData.confirmPassword
    ) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    if (!formData.termsAccepted) {
      newErrors.termsAccepted =
        "Please agree to the Terms and Conditions.";
    }

    if (!formData.currency) {
      newErrors.currency = "Please select a currency.";
    }

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

    setTouched({
      Name: true,
      email: true,
      password: true,
      confirmPassword: true,
      currency: true,
      termsAccepted: true,
    });

    setRegistrationError("");

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            full_name: formData.Name.trim(),
            currency: formData.currency,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setRegistrationError(getRegistrationErrorMessage(error));
        return;
      }

      if (data.user?.identities?.length === 0) {
        setRegistrationError(
          "An account with this email may already exist. Try logging in or resetting your password.",
        );
        return;
      }

      if (!data.user) {
        setRegistrationError(
          "We couldn't create your account right now. Please try again.",
        );
        return;
      }

      setRegistrationSuccess(true);
    } catch (error) {
      setRegistrationError(getRegistrationErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setGoogleSignInError("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        setGoogleSignInError(
          "We couldn't start Google sign-in. Please try again.",
        );
        setIsGoogleLoading(false);
      }
    } catch {
      setGoogleSignInError(
        "We couldn't start Google sign-in. Please try again.",
      );
      setIsGoogleLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-register">
        <Brand />

        <div className="auth-header">
          <h1>
            {registrationSuccess ? "Check your email" : "Create your account"}
          </h1>
          <p>
            {registrationSuccess
              ? "Confirm your email address to finish creating your account."
              : "Start managing your personal finances with SpendIndix."}
          </p>
        </div>

        {registrationSuccess && (
          <div className="forgot-success" role="status">
            <div className="success-icon">✓</div>
            <p>
              Your account has been created. Please check your email and
              confirm your account before logging in.
            </p>
            <Link to="/login" className="primary-button">
              Back to Login
            </Link>
          </div>
        )}

        <form
          className="register-form"
          onSubmit={handleSubmit}
          hidden={registrationSuccess}
        >
          {/* Name */}
          <div className="form-group">
            <label htmlFor="Name">Name</label>

            <input
              id="Name"
              name="Name"
              type="text"
              value={formData.Name}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Enter your name"
              className={getInputClass("Name")}
            />

            {errors.Name && (
              <p className="form-error">{errors.Name}</p>
            )}
          </div>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="email">Email Address</label>

            <input
              id="email"
              name="email"
              type="text"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Enter your email address"
              className={getInputClass("email")}
            />

            {errors.email && (
              <p className="form-error">{errors.email}</p>
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
      <path d="M6.1 6.1C3.6 8 2 12 2 12s3.5 8 10 8a10.6 10.6 0 0 0 2.1-.2" />
    </svg>
  )}
</button>
            </div>

            {errors.password && (
              <p className="form-error">{errors.password}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label htmlFor="confirmPassword">
              Confirm Password
            </label>

            <div className="password-wrapper">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={
                  showConfirmPassword ? "text" : "password"
                }
                value={formData.confirmPassword}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Re-enter your password"
                className={getInputClass("confirmPassword")}
              />

              <button
  type="button"
  className="password-toggle"
  onClick={() =>
    setShowConfirmPassword(!showConfirmPassword)
  }
  aria-label={
    showConfirmPassword
      ? "Hide confirm password"
      : "Show confirm password"
  }
>
  {showConfirmPassword ? (
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
      <path d="M6.1 6.1C3.6 8 2 12 2 12s3.5 8 10 8a10.6 10.6 0 0 0 2.1-.2" />
    </svg>
  )}
</button>
            </div>

            {errors.confirmPassword && (
              <p className="form-error">
                {errors.confirmPassword}
              </p>
            )}
          </div>
                    {/* Currency */}
          <div className="form-group currency-group">
            <label htmlFor="currency">Currency</label>

                        <div className="currency-selector">
              <button
                type="button"
                className={`currency-input${errors.currency ? " input-error" : ""}`}
                aria-invalid={Boolean(errors.currency)}
                aria-describedby={errors.currency ? "currency-error" : undefined}
                onClick={() =>
                  setShowCurrencyDropdown(!showCurrencyDropdown)
                }
              >
                <span>
                  {formData.currency
                    ? formData.currency
                    : "Search country or currency"}
                </span>

                <span className="currency-arrow">
                  {showCurrencyDropdown ? "▲" : "▼"}
                </span>
              </button>

              {showCurrencyDropdown && (
                <div className="currency-dropdown">
                  <input
                    type="text"
                    className="currency-search"
                    value={currencySearch}
                    onChange={(event) =>
                      setCurrencySearch(event.target.value)
                    }
                    placeholder="Search country or currency"
                  />

                  <div className="currency-results">
  {currencyLoading ? (
  <p className="currency-message">
    Loading currencies...
  </p>
) : filteredCurrencyOptions.length === 0 ? (
  <p className="currency-message">
    No matching currencies found.
  </p>
) : (
    filteredCurrencyOptions.map((currency) => (
      <button
        key={currency.code}
        type="button"
        className="currency-option"
        onClick={() => {
  setFormData((previousData) => ({
    ...previousData,
    currency: `${currency.name} (${currency.code})`,
  }));
    setErrors((previousErrors) => ({
      ...previousErrors,
      currency: "",
    }));
  setShowCurrencyDropdown(false);
  setCurrencySearch("");
}}
      >
        <span className="currency-option-name">
  {currency.name}
</span>

<span className="currency-option-code">
  {currency.code} · {currency.symbol}
</span>
      </button>
    ))
  )}
</div>
                </div>
              )}
            </div>
            {errors.currency && (
              <p id="currency-error" className="form-error">
                {errors.currency}
              </p>
            )}
          </div>
          
          {/* Terms and Conditions */}
          <div className="terms-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="termsAccepted"
                checked={formData.termsAccepted}
                onChange={handleChange}
                onBlur={handleBlur}
              />

              <span>
                I agree to the{" "}
                <Link to="/terms" className="terms-link">
  Terms and Conditions
</Link>
              </span>
            </label>

            {errors.termsAccepted && (
              <p className="form-error">
                {errors.termsAccepted}
              </p>
            )}
          </div>

          {/* Sign Up */}
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Sign Up"}
          </button>
          {registrationError && (
            <p className="form-error" role="alert">
              {registrationError}
            </p>
          )}

          <div className="divider">
            <span>OR</span>
          </div>

          {/* Google Sign Up */}
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

          {/* Login */}
          <p className="login-text">
            Already have an account?{" "}
            <Link to="/login" className="login-link">
  Login
</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

export default Register;
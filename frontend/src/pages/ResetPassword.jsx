import { useState } from "react";
import { Link } from "react-router-dom";

function ResetPassword() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));

    setTouched((previousTouched) => ({
      ...previousTouched,
      [name]: true,
    }));

    setErrors((previousErrors) => ({
      ...previousErrors,
      [name]: "",
    }));
  };

  const validateSingleField = (fieldName) => {
    const newErrors = { ...errors };

    if (fieldName === "password") {
      if (!formData.password) {
        newErrors.password = "New password is required.";
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
          "Please confirm your new password.";
      } else if (
        formData.password !== formData.confirmPassword
      ) {
        newErrors.confirmPassword = "Passwords do not match.";
      } else {
        delete newErrors.confirmPassword;
      }
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

    if (!formData.password) {
      newErrors.password = "New password is required.";
    } else if (formData.password.length < 8) {
      newErrors.password =
        "Password must be at least 8 characters long.";
    } else if (!/\d/.test(formData.password)) {
      newErrors.password =
        "Password must contain at least one number.";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword =
        "Please confirm your new password.";
    } else if (
      formData.password !== formData.confirmPassword
    ) {
      newErrors.confirmPassword = "Passwords do not match.";
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

  const handleSubmit = (event) => {
    event.preventDefault();

    const validationErrors = validateForm();

    setTouched({
      password: true,
      confirmPassword: true,
    });

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    alert("Password reset form is valid!");
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-mark">S</div>
          <span className="brand-name">SpendIndix</span>
        </div>

        <div className="auth-header">
          <h1>Reset Password</h1>

          <p>
            Create a new password for your SpendIndix account.
          </p>
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
          {/* New Password */}
          <div className="form-group">
            <label htmlFor="password">New Password</label>

            <div className="password-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter your new password"
                className={getInputClass("password")}
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
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

          {/* Confirm New Password */}
          <div className="form-group">
            <label htmlFor="confirmPassword">
              Confirm New Password
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
                placeholder="Re-enter your new password"
                className={getInputClass("confirmPassword")}
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowConfirmPassword(
                    !showConfirmPassword
                  )
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

          <button type="submit" className="primary-button">
            Reset Password
          </button>

          <p className="login-text">
            Remember your password?{" "}
            <Link to="/login" className="login-link">
              Login
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

export default ResetPassword;
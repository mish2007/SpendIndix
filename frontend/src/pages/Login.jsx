import { useState } from "react";

function Login() {
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
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
  };

  const validateSingleField = (fieldName) => {
    const newErrors = { ...errors };

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
      } else {
        delete newErrors.password;
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

    const email = formData.email.trim();

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

  setErrors(validationErrors);

  setTouched((previousTouched) => ({
    ...previousTouched,
    email: true,
    ...(formData.password ? {} : { password: true }),
  }));

  if (Object.keys(validationErrors).length > 0) {
    return;
  }

  alert("Login form is valid!");
};
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-mark">S</div>
          <span className="brand-name">SpendIndix</span>
        </div>

        <div className="auth-header">
          <h1>Welcome back</h1>
          <p>Login to your SpendIndix account.</p>
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
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
                    <path d="M6.1 6.1C3.6 6 2 12 2 12s3.5 8 10 8a10.6 10.6 0 0 0 2.1-.2" />
                  </svg>
                )}
              </button>
            </div>

            {errors.password && (
              <p className="form-error">{errors.password}</p>
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

            <a href="/forgot-password" className="forgot-link">
              Forgot Password?
            </a>
          </div>

          {/* Login */}
          <button type="submit" className="primary-button">
            Login
          </button>

          <div className="divider">
            <span>OR</span>
          </div>

          {/* Google Login */}
          <button type="button" className="google-button">
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

            <span>Continue with Google</span>
          </button>

          {/* Registration Link */}
          <p className="login-text">
            Don't have an account?{" "}
            <a href="/register" className="login-link">
              Register
            </a>
          </p>
        </form>
      </section>
    </main>
  );
}

export default Login;
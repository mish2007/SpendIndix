function Brand({ className = "" }) {
  return (
    <div className={`brand ${className}`.trim()}>
      <svg
        className="brand-mark"
        viewBox="0 0 40 40"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="38" height="38" rx="11" fill="#174A32" />
        <path
          d="M10 28V21h5v7m5 0V15h5v13m5 0V19h5v9"
          fill="none"
          stroke="#E5F5DD"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        <path
          d="m9 16 7-5 6 3 9-7"
          fill="none"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M27.5 7H31v3.5"
          fill="none"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      <span className="brand-wordmark">
        Spend<span>Indix</span>
      </span>
    </div>
  );
}

export default Brand;

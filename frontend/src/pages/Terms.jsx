function Terms() {
  return (
    <div className="terms-page">
      <div className="terms-card">
        <div className="terms-header">
          <div className="brand">
            <div className="brand-mark">S</div>
            <span className="brand-name">SpendIndix</span>
          </div>

          <h1>Terms and Conditions</h1>

          <p>
            Please read these terms carefully before using SpendIndix.
          </p>
        </div>

        <div className="terms-content">
          <section>
            <h2>1. About SpendIndix</h2>
            <p>
              SpendIndix is a personal finance management application designed
              to help users record, organize, monitor, and understand their
              income and expenses. The application may also provide budgeting,
              savings, analytics, reporting, and AI-assisted financial
              information.
            </p>
          </section>

          <section>
            <h2>2. User Account</h2>
            <p>
              Users are responsible for providing accurate information during
              registration and for keeping their account credentials secure.
              Users should not share their password or account access with
              others.
            </p>
          </section>

          <section>
            <h2>3. Financial Information</h2>
            <p>
              Users are responsible for the accuracy of the financial
              information they enter into SpendIndix. The application uses
              information provided by the user to display transactions,
              budgets, savings progress, analytics, reports, and other
              financial information.
            </p>
          </section>

          <section>
            <h2>4. AI Financial Features</h2>
            <p>
              SpendIndix may provide AI-generated summaries, suggestions, and
              answers based on the financial information available in the
              application. AI-generated information is provided for general
              informational purposes and should not be treated as professional
              financial, investment, tax, or legal advice.
            </p>
          </section>

          <section>
            <h2>5. Bill and Receipt Scanning</h2>
            <p>
              SpendIndix may allow users to upload or capture bills and
              receipts to extract transaction information. Users should review
              the extracted information before saving it as a transaction.
            </p>
          </section>

          <section>
            <h2>6. Privacy and Data Use</h2>
            <p>
              SpendIndix uses the information provided by users to provide and
              improve the application's features. Users should avoid entering
              highly sensitive information that is not required for using the
              application.
            </p>
          </section>

          <section>
            <h2>7. Acceptable Use</h2>
            <p>
              Users should use SpendIndix only for lawful and personal
              financial management purposes. Users should not attempt to
              access another user's account, interfere with the application,
              or misuse any feature of the system.
            </p>
          </section>

          <section>
            <h2>8. Application Availability</h2>
            <p>
              SpendIndix is provided as a personal finance management
              application. Features may be changed, updated, temporarily
              unavailable, or improved over time.
            </p>
          </section>

          <section>
            <h2>9. User Responsibility</h2>
            <p>
              Users are responsible for reviewing their financial information,
              transaction records, budgets, reports, and AI-generated
              suggestions before relying on them for financial decisions.
            </p>
          </section>

          <section>
            <h2>10. Acceptance of Terms</h2>
            <p>
              By creating a SpendIndix account and checking the agreement box
              during registration, the user confirms that they have read,
              understood, and agreed to these Terms and Conditions.
            </p>
          </section>
        </div>

        <div className="terms-footer">
          <button
            type="button"
            className="primary-button"
            onClick={() => window.history.back()}
          >
            Back to Registration
          </button>
        </div>
      </div>
    </div>
  );
}

export default Terms;
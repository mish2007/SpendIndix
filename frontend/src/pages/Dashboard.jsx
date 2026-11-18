import { useState } from "react";
function Dashboard() {
    const [activeDay, setActiveDay] = useState(null);

  const spendingData = [
    {
      day: "Mon",
      date: "14 Sep 2026",
      amount: 1250,
    },
    {
      day: "Tue",
      date: "15 Sep 2026",
      amount: 800,
    },
    {
      day: "Wed",
      date: "16 Sep 2026",
      amount: 1200,
    },
    {
      day: "Thu",
      date: "17 Sep 2026",
      amount: 650,
    },
    {
      day: "Fri",
      date: "18 Sep 2026",
      amount: 800,
    },
    {
      day: "Sat",
      date: "19 Sep 2026",
      amount: 2500,
    },
    {
      day: "Sun",
      date: "20 Sep 2026",
      amount: 450,
    },
  ];

  const maxSpending = Math.max(
    ...spendingData.map((item) => item.amount)
  );
  return (
    <main className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">S</div>
          <span>SpendIndix</span>
        </div>

        <nav className="sidebar-navigation">
          <a href="/dashboard">Dashboard</a>
          <a href="/transactions">Transactions</a>
          <a href="/budgets">Budgets</a>
          <a href="/savings-goals">Savings Goals</a>
          <a href="/analytics">Analytics</a>
          <a href="/reports">Reports</a>
          <a href="/ai-advisor">AI Financial Advisor</a>
          <a href="/profile">Profile</a>
          <a href="/settings">Settings</a>
        </nav>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            <p>Manage your finances with SpendIndix.</p>
          </div>
        </header>

        <section className="summary-cards">
          <article className="summary-card">
            <p className="summary-label">Total Income</p>
            <h2>₹45,000</h2>
            <span className="summary-description">
              Income recorded this period
            </span>
          </article>

          <article className="summary-card">
            <p className="summary-label">Total Expenses</p>
            <h2>₹20,500</h2>
            <span className="summary-description">
              Expenses recorded this period
            </span>
          </article>

          <article className="summary-card">
            <p className="summary-label">Current Balance</p>
            <h2>₹24,500</h2>
            <span className="summary-description">
              Income minus expenses
            </span>
          </article>
        </section>
                <section className="financial-health">
          <div className="financial-health-header">
            <div>
              <p className="section-label">Financial Health</p>
              <h2>72 / 100</h2>
            </div>

            <p className="health-description">
              Your financial health based on your current financial activity.
            </p>
          </div>

          <div className="health-indicators">
            <div className="health-indicator">
              <div className="indicator-header">
                <span>Income Stability</span>
                <strong>80%</strong>
              </div>

              <div className="indicator-track">
                <div
                  className="indicator-progress"
                  style={{ width: "80%" }}
                ></div>
              </div>
            </div>

            <div className="health-indicator">
              <div className="indicator-header">
                <span>Budget Control</span>
                <strong>70%</strong>
              </div>

              <div className="indicator-track">
                <div
                  className="indicator-progress"
                  style={{ width: "70%" }}
                ></div>
              </div>
            </div>

            <div className="health-indicator">
              <div className="indicator-header">
                <span>Savings</span>
                <strong>60%</strong>
              </div>

              <div className="indicator-track">
                <div
                  className="indicator-progress"
                  style={{ width: "60%" }}
                ></div>
              </div>
            </div>

            <div className="health-indicator">
              <div className="indicator-header">
                <span>Spending Control</span>
                <strong>75%</strong>
              </div>

              <div className="indicator-track">
                <div
                  className="indicator-progress"
                  style={{ width: "75%" }}
                ></div>
              </div>
            </div>
          </div>
        </section>
        
           {/* Spending Pattern */}
<section className="spending-pattern">
  <div className="spending-pattern-header">
    <div>
      <h2>Spending Pattern</h2>
      <p>Your spending over the previous 7 days.</p>
    </div>

    <a href="/analytics" className="view-analytics-link">
      View Full Analytics →
    </a>
  </div>

  <div className="spending-chart">
    <div className="spending-y-axis">
      <span>₹2.5k</span>
      <span>₹1.5k</span>
      <span>₹500</span>
      <span>₹0</span>
    </div>

    <div className="spending-chart-area">
      <div className="spending-grid">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>

      <div className="spending-bars">
        {spendingData.map((item, index) => {
          const barHeight =
            maxSpending > 0
              ? (item.amount / maxSpending) * 100
              : 0;

          return (
            <div className="spending-day" key={item.date}>
              <div className="spending-bar-wrapper">
                {activeDay === index && (
                  <div className="spending-tooltip">
                    <strong>{item.day}</strong>
                    <span>{item.date}</span>
                    <b>Spent: ₹{item.amount.toLocaleString("en-IN")}</b>
                  </div>
                )}

                <button
                  type="button"
                  className="spending-bar"
                  style={{ height: `${barHeight}%` }}
                  aria-label={`${item.day}, ${item.date}, spent ₹${item.amount}`}
                  onClick={() =>
                    setActiveDay(
                      activeDay === index ? null : index
                    )
                  }
                  onMouseEnter={() => setActiveDay(index)}
                  onMouseLeave={() => setActiveDay(null)}
                  onFocus={() => setActiveDay(index)}
                  onBlur={() => setActiveDay(null)}
                ></button>
              </div>

              <span className="spending-day-label">
                {item.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
</section>
        <section className="recent-transactions">
  <div className="recent-transactions-header">
    <h2>Recent Transactions</h2>

    <a href="/transactions" className="view-all-link">
      View All
    </a>
  </div>

  <div className="recent-transactions-list">

    <div className="recent-transaction">
      <div className="recent-transaction-details">
        <h3>Monthly Salary</h3>
        <p>Income • Salary • 20 Sep 2026</p>
      </div>

      <span className="recent-transaction-amount income">
        +₹45,000
      </span>
    </div>

    <div className="recent-transaction">
      <div className="recent-transaction-details">
        <h3>Grocery Shopping</h3>
        <p>Expense • Food • 19 Sep 2026</p>
      </div>

      <span className="recent-transaction-amount expense">
        -₹2,500
      </span>
    </div>

    <div className="recent-transaction">
      <div className="recent-transaction-details">
        <h3>Bus Pass</h3>
        <p>Expense • Transport • 18 Sep 2026</p>
      </div>

      <span className="recent-transaction-amount expense">
        -₹800
      </span>
    </div>

    <div className="recent-transaction">
      <div className="recent-transaction-details">
        <h3>Electricity Bill</h3>
        <p>Expense • Bills • 16 Sep 2026</p>
      </div>

      <span className="recent-transaction-amount expense">
        -₹1,200
      </span>
    </div>

  </div>
</section>
{/* Budget Status */}
<section className="budget-status">
  <div className="budget-status-header">
    <h2>Budget Status</h2>

    <a href="/budgets" className="budget-status-link">
      View Budgets
    </a>
  </div>

  <div className="budget-list">
    <div className="budget-item">
      <div className="budget-item-header">
        <div>
          <h3>Food</h3>
          <p>₹3,500 of ₹5,000 spent</p>
        </div>

        <span className="budget-percentage">70%</span>
      </div>

      <div className="budget-progress">
        <div
          className="budget-progress-fill"
          style={{ width: "70%" }}
        ></div>
      </div>
    </div>

    <div className="budget-item">
      <div className="budget-item-header">
        <div>
          <h3>Transport</h3>
          <p>₹1,200 of ₹2,000 spent</p>
        </div>

        <span className="budget-percentage">60%</span>
      </div>

      <div className="budget-progress">
        <div
          className="budget-progress-fill"
          style={{ width: "60%" }}
        ></div>
      </div>
    </div>

    <div className="budget-item">
      <div className="budget-item-header">
        <div>
          <h3>Entertainment</h3>
          <p>₹900 of ₹1,000 spent</p>
        </div>

        <span className="budget-percentage">90%</span>
      </div>

      <div className="budget-progress">
        <div
          className="budget-progress-fill"
          style={{ width: "90%" }}
        ></div>
      </div>
    </div>
   </div>
</section>

{/* Savings Goals Status */}
<section className="savings-goals-status">
  <div className="savings-goals-status-header">
    <h2>Savings Goals</h2>

    <a href="/savings-goals" className="savings-goals-status-link">
      View Savings Goals
    </a>
  </div>

  <div className="savings-goals-list">

    <div className="savings-goal-item">
      <div className="savings-goal-header">
        <div>
          <h3>Emergency Fund</h3>
          <p>₹30,000 saved of ₹50,000</p>
        </div>

        <span className="savings-goal-percentage">60%</span>
      </div>

      <div className="savings-goal-progress">
        <div
          className="savings-goal-progress-fill"
          style={{ width: "60%" }}
        ></div>
      </div>

      <p className="savings-goal-target">
        Target date: 31 Dec 2026
      </p>
    </div>

    <div className="savings-goal-item">
      <div className="savings-goal-header">
        <div>
          <h3>New Laptop</h3>
          <p>₹40,000 saved of ₹80,000</p>
        </div>

        <span className="savings-goal-percentage">50%</span>
      </div>

      <div className="savings-goal-progress">
        <div
          className="savings-goal-progress-fill"
          style={{ width: "50%" }}
        ></div>
      </div>

      <p className="savings-goal-target">
        Target date: 31 Mar 2027
      </p>
    </div>

    <div className="savings-goal-item">
      <div className="savings-goal-header">
        <div>
          <h3>Vacation</h3>
          <p>₹15,000 saved of ₹30,000</p>
        </div>

        <span className="savings-goal-percentage">50%</span>
      </div>

      <div className="savings-goal-progress">
        <div
          className="savings-goal-progress-fill"
          style={{ width: "50%" }}
        ></div>
      </div>

      <p className="savings-goal-target">
        Target date: 30 Jun 2027
      </p>
    </div>

  </div>
</section>
{/* Upcoming Recurring Transactions */}
<section className="upcoming-recurring">
  <div className="upcoming-recurring-header">
    <div>
      <h2>Upcoming Recurring Transactions</h2>
      <p>Your next scheduled income and expenses.</p>
    </div>

    <a
      href="/recurring-transactions"
      className="upcoming-recurring-link"
    >
      View Recurring Transactions →
    </a>
  </div>

  <div className="upcoming-recurring-list">

    <div className="upcoming-recurring-item">
      <div className="upcoming-recurring-details">
        <h3>Rent</h3>
        <p>Expense · Monthly</p>
        <span>Next: 1 Oct 2026</span>
      </div>

      <span className="upcoming-recurring-amount expense">
        ₹12,000
      </span>
    </div>

    <div className="upcoming-recurring-item">
      <div className="upcoming-recurring-details">
        <h3>Internet Bill</h3>
        <p>Expense · Monthly</p>
        <span>Next: 3 Oct 2026</span>
      </div>

      <span className="upcoming-recurring-amount expense">
        ₹799
      </span>
    </div>

    <div className="upcoming-recurring-item">
      <div className="upcoming-recurring-details">
        <h3>Monthly Salary</h3>
        <p>Income · Monthly</p>
        <span>Next: 5 Oct 2026</span>
      </div>

      <span className="upcoming-recurring-amount income">
        ₹45,000
      </span>
    </div>

    <div className="upcoming-recurring-item">
      <div className="upcoming-recurring-details">
        <h3>Netflix</h3>
        <p>Expense · Monthly</p>
        <span>Next: 8 Oct 2026</span>
      </div>

      <span className="upcoming-recurring-amount expense">
        ₹649
      </span>
    </div>

  </div>
</section>
{/* AI Quick Insight */}
<section className="ai-quick-insight">
  <div className="ai-quick-insight-header">
    <div>
      <h2>AI Quick Insight</h2>
      <p>Based on your recent financial activity.</p>
    </div>

    <a
      href="/ai-advisor"
      className="ai-quick-insight-link"
    >
      View AI Advisor →
    </a>
  </div>

  <div className="ai-quick-insight-content">
    <div className="ai-quick-insight-icon">
      💡
    </div>

    <p>
      Your expenses are slightly higher than your usual spending this week.
      Consider reviewing your Food and Entertainment expenses.
    </p>
  </div>
</section>
      </section>
    </main>
  );
}

export default Dashboard;
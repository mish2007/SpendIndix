import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getBudgetErrorMessage,
  listMonthlyBudgets,
  listMonthlyExpenseTotals,
} from "../lib/budgets";
import {
  formatCurrency,
  getCurrencyDecimalPlaces,
} from "../lib/currency";
import {
  getSavingsGoalErrorMessage,
  listSavingsContributions,
  listSavingsGoals,
} from "../lib/savingsGoals";
import {
  getFinanceErrorMessage,
  getTransactionSummary,
  listCategories,
  listMonthlySpendingByDate,
  listTransactions,
} from "../lib/transactions";

function getCurrentMonthStart() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthRange(monthStart) {
  const [year, month] = monthStart.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    fromDate: monthStart,
    toDate: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function shiftMonth(monthStart, offset) {
  const [year, month] = monthStart.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMonth(monthStart) {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function roundAmount(value, currencyCode) {
  const factor = 10 ** getCurrencyDecimalPlaces(currencyCode);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function summarizeByCurrency(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const current = totals.get(row.currencyCode) || {
      income: 0,
      expense: 0,
    };
    current[row.type] = row.amount;
    totals.set(row.currencyCode, current);
  });
  return [...totals.entries()]
    .map(([currencyCode, values]) => ({
      currencyCode,
      income: values.income,
      expense: values.expense,
      balance: values.income - values.expense,
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}

function getSpendingSeries(rows, monthStart) {
  const totals = new Map();
  rows.forEach((row) => {
    if (!totals.has(row.currencyCode)) {
      totals.set(row.currencyCode, new Map());
    }
    const byDate = totals.get(row.currencyCode);
    byDate.set(row.date, (byDate.get(row.date) || 0) + row.amount);
  });

  const [year, month] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return [...totals.entries()]
    .sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB))
    .map(([currencyCode, byDate]) => {
      const days = Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return {
          day,
          date,
          amount: roundAmount(byDate.get(date) || 0, currencyCode),
        };
      });
      return {
        currencyCode,
        days,
        maximum: Math.max(...days.map((item) => item.amount)),
      };
    });
}

function getBudgetStatus(percentUsed) {
  if (percentUsed > 100) {
    return { label: "Exceeded", className: "is-exceeded" };
  }
  if (percentUsed === 100) {
    return { label: "Fully used", className: "is-full" };
  }
  if (percentUsed >= 80) {
    return { label: "Approaching", className: "is-approaching" };
  }
  return { label: "Within budget", className: "is-within" };
}

function getBudgetProgressRows(budgets, expenses, categories) {
  const spentByCategoryCurrency = new Map();
  expenses.forEach((expense) => {
    spentByCategoryCurrency.set(
      `${expense.categoryId}:${expense.currencyCode}`,
      expense.amount,
    );
  });
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  return budgets
    .map((budget) => {
      const currencyCode = budget.currency_code;
      const amount = roundAmount(Number(budget.amount), currencyCode);
      const spent = roundAmount(
        spentByCategoryCurrency.get(
          `${budget.category_id}:${currencyCode}`,
        ) || 0,
        currencyCode,
      );
      const percentUsed = amount > 0 ? (spent / amount) * 100 : 0;
      return {
        id: budget.id,
        categoryName: categoryNames.get(budget.category_id) || "Category budget",
        currencyCode,
        amount,
        spent,
        percentUsed,
        progressWidth: Math.min(Math.max(percentUsed, 0), 100),
        remaining: roundAmount(Math.max(amount - spent, 0), currencyCode),
        exceededBy: roundAmount(Math.max(spent - amount, 0), currencyCode),
        status: getBudgetStatus(percentUsed),
      };
    })
    .sort(
      (a, b) =>
        b.percentUsed - a.percentUsed ||
        a.categoryName.localeCompare(b.categoryName),
    );
}

function getMonthlySavingsTotals(contributions, goals) {
  const goalCurrencies = new Map(
    goals.map((goal) => [goal.id, goal.currency_code]),
  );
  const totals = new Map();
  contributions.forEach((contribution) => {
    const currencyCode = goalCurrencies.get(contribution.goal_id);
    if (!currencyCode) {
      return;
    }
    totals.set(
      currencyCode,
      (totals.get(currencyCode) || 0) + Number(contribution.amount),
    );
  });
  return [...totals.entries()]
    .map(([currencyCode, amount]) => ({
      currencyCode,
      amount: roundAmount(amount, currencyCode),
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}

function getFinancialHealth(summaryByCurrency, budgets, savingsTotals) {
  const components = [];
  const currenciesWithIncome = summaryByCurrency.filter(
    (item) => item.income > 0,
  );
  if (currenciesWithIncome.length > 0) {
    const cashFlowScore =
      currenciesWithIncome.reduce((total, item) => {
        const score =
          item.expense <= item.income
            ? 100
            : Math.max(0, (item.income / item.expense) * 100);
        return total + score;
      }, 0) / currenciesWithIncome.length;
    components.push({
      label: "Cash flow",
      score: cashFlowScore,
      weight: 45,
    });
  }

  if (budgets.length > 0) {
    const budgetScore =
      budgets.reduce((total, budget) => {
        const score =
          budget.spent <= budget.amount
            ? 100
            : budget.spent > 0
              ? (budget.amount / budget.spent) * 100
              : 100;
        return total + score;
      }, 0) / budgets.length;
    components.push({
      label: "Budget control",
      score: budgetScore,
      weight: 35,
    });
  }

  if (savingsTotals.some((item) => item.amount > 0)) {
    components.push({
      label: "Goal contribution activity",
      score: 100,
      weight: 20,
      detail: "Recorded",
    });
  }

  const totalWeight = components.reduce(
    (total, component) => total + component.weight,
    0,
  );
  const score =
    components.length >= 2
      ? Math.round(
          components.reduce(
            (total, component) =>
              total + component.score * component.weight,
            0,
          ) / totalWeight,
        )
      : null;

  return { score, components };
}

function getQuickInsight(
  summaryByCurrency,
  budgets,
  savingsTotals,
  monthLabel,
  dataUnavailable,
) {
  const exceededBudget = budgets.find(
    (budget) => budget.status.className === "is-exceeded",
  );
  if (exceededBudget) {
    return `Your ${exceededBudget.categoryName} budget is exceeded by ${formatCurrency(exceededBudget.exceededBy, exceededBudget.currencyCode)} this month.`;
  }

  const cashFlowShortfall = summaryByCurrency
    .filter((item) => item.income > 0 && item.expense > item.income)
    .sort(
      (a, b) =>
        b.expense / b.income - a.expense / a.income,
    )[0];
  if (cashFlowShortfall) {
    return `Recorded expenses exceed income by ${formatCurrency(cashFlowShortfall.expense - cashFlowShortfall.income, cashFlowShortfall.currencyCode)} in ${cashFlowShortfall.currencyCode} this month.`;
  }

  if (savingsTotals.length > 0) {
    const contribution = savingsTotals[0];
    return `You recorded ${formatCurrency(contribution.amount, contribution.currencyCode)} in savings-goal contributions this month.`;
  }

  const positiveCashFlow = summaryByCurrency.find(
    (item) => item.income > 0 && item.balance > 0,
  );
  if (positiveCashFlow) {
    return `Recorded income exceeded expenses by ${formatCurrency(positiveCashFlow.balance, positiveCashFlow.currencyCode)} in ${positiveCashFlow.currencyCode} this month.`;
  }

  const expensesWithoutIncome = summaryByCurrency.find(
    (item) => item.expense > 0 && item.income === 0,
  );
  if (expensesWithoutIncome) {
    return `You recorded expenses in ${expensesWithoutIncome.currencyCode} but no income in that currency this month, so a full cash-flow comparison is not available.`;
  }

  if (dataUnavailable) {
    return "Some Dashboard data is unavailable right now. Retry before drawing a complete conclusion.";
  }
  return `No income, expenses or goal contributions are recorded for ${monthLabel} yet.`;
}

function DashboardMetricCard({
  title,
  detail,
  entries,
  emptyMessage,
  error,
  errorMessage,
  className = "",
}) {
  return (
    <article className={`dashboard-metric-card ${className}`}>
      <div>
        <p>{title}</p>
        <span>{detail}</span>
      </div>
      {error ? (
        <p className="dashboard-metric-empty">
          {errorMessage || "Unavailable"}
        </p>
      ) : entries.length > 0 ? (
        <ul>
          {entries.map((item) => (
            <li key={item.currencyCode}>
              <span>{item.currencyCode}</span>
              <strong>{formatCurrency(item.amount, item.currencyCode)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashboard-metric-empty">{emptyMessage}</p>
      )}
    </article>
  );
}

function SpendingChart({ series, monthLabel, error }) {
  return (
    <section
      className="dashboard-panel dashboard-chart-panel"
      aria-labelledby="dashboard-spending-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">DAILY EXPENSES</p>
          <h2 id="dashboard-spending-title">Spending over time</h2>
        </div>
        <span className="dashboard-section-detail">{monthLabel}</span>
      </div>

      {error ? (
        <p className="dashboard-panel-message" role="alert">
          Spending chart data is unavailable. Try refreshing the Dashboard.
        </p>
      ) : series.length === 0 ? (
        <p className="dashboard-panel-message">
          No expense transactions are recorded for this month.
        </p>
      ) : (
        <div className="dashboard-chart-series-list">
          {series.map((item) => (
            <div className="dashboard-chart-series" key={item.currencyCode}>
              <div className="dashboard-chart-series-heading">
                <span>{item.currencyCode}</span>
                <span>Expenses are shown separately by currency</span>
              </div>
              <div className="dashboard-chart-scroll">
                <div
                  className="dashboard-chart-days"
                  style={{ "--dashboard-chart-days": item.days.length }}
                >
                  {item.days.map((day) => {
                    const amountRatio =
                      item.maximum > 0 ? (day.amount / item.maximum) * 100 : 0;
                    const showLabel =
                      day.day === 1 ||
                      day.day % 5 === 0 ||
                      day.day === item.days.length;
                    const dateLabel = formatDate(day.date);
                    return (
                      <button
                        type="button"
                        className="dashboard-chart-day"
                        key={day.date}
                        aria-label={`${dateLabel}: ${formatCurrency(day.amount, item.currencyCode)} expenses`}
                        title={`${dateLabel}: ${formatCurrency(day.amount, item.currencyCode)}`}
                      >
                        <span
                          className="dashboard-chart-tooltip"
                          aria-hidden="true"
                        >
                          <span>{dateLabel}</span>
                          <strong>
                            {formatCurrency(day.amount, item.currencyCode)}
                          </strong>
                        </span>
                        <span className="dashboard-chart-bar-track">
                          <span
                            className="dashboard-chart-bar"
                            style={{ height: `${amountRatio}%` }}
                          />
                        </span>
                        <span className="dashboard-chart-day-label">
                          {showLabel ? day.day : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BudgetOverview({ budgets, error, categoryWarning, monthLabel }) {
  return (
    <section
      className="dashboard-panel dashboard-budget-panel"
      aria-labelledby="dashboard-budget-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">PLAN VS. SPENDING</p>
          <h2 id="dashboard-budget-title">Budget overview</h2>
        </div>
        <Link className="text-button" to="/budgets">
          Budgets
        </Link>
      </div>
      <p className="dashboard-section-detail dashboard-budget-month">
        {monthLabel}
      </p>

      {error ? (
        <p className="dashboard-panel-message" role="alert">
          {error}
        </p>
      ) : budgets.length === 0 ? (
        <div className="dashboard-panel-empty">
          <p>No budgets are set for this month.</p>
          <Link className="text-button" to="/budgets">
            Set up a budget
          </Link>
        </div>
      ) : (
        <>
          {categoryWarning && (
            <p className="dashboard-inline-warning" role="status">
              {categoryWarning}
            </p>
          )}
          <ul className="dashboard-budget-list">
            {budgets.slice(0, 4).map((budget) => (
              <li key={budget.id}>
                <div className="dashboard-budget-heading">
                  <div>
                    <strong>{budget.categoryName}</strong>
                    <span>{budget.currencyCode}</span>
                  </div>
                  <span
                    className={`dashboard-budget-status ${budget.status.className}`}
                  >
                    {budget.status.label}
                  </span>
                </div>
                <div
                  className={`dashboard-budget-track ${budget.status.className}`}
                  role="progressbar"
                  aria-label={`${budget.categoryName} budget used`}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={budget.progressWidth}
                  aria-valuetext={`${new Intl.NumberFormat(undefined, {
                    maximumFractionDigits: 1,
                  }).format(budget.percentUsed)}% used`}
                >
                  <span style={{ width: `${budget.progressWidth}%` }} />
                </div>
                <div className="dashboard-budget-amounts">
                  <span>
                    {formatCurrency(budget.spent, budget.currencyCode)} of{" "}
                    {formatCurrency(budget.amount, budget.currencyCode)}
                  </span>
                  <span>
                    {budget.status.className === "is-exceeded"
                      ? `${formatCurrency(budget.exceededBy, budget.currencyCode)} over`
                      : `${formatCurrency(budget.remaining, budget.currencyCode)} left`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {budgets.length > 4 && (
            <Link className="dashboard-panel-link" to="/budgets">
              View all {budgets.length} budgets
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function FinancialHealthPanel({ health }) {
  const scoreClass =
    health.score === null
      ? "is-unavailable"
      : health.score >= 80
        ? "is-strong"
        : health.score >= 60
          ? "is-moderate"
          : "is-low";

  return (
    <section
      className="dashboard-panel dashboard-health-panel"
      aria-labelledby="dashboard-health-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">MONTHLY SIGNALS</p>
          <h2 id="dashboard-health-title">Financial health score</h2>
        </div>
      </div>
      <div className={`dashboard-health-score ${scoreClass}`}>
        <strong>{health.score === null ? "—" : health.score}</strong>
        <span>{health.score === null ? "Not enough data" : "out of 100"}</span>
      </div>
      {health.components.length > 0 ? (
        <ul className="dashboard-health-breakdown">
          {health.components.map((component) => (
            <li key={component.label}>
              <span>{component.label}</span>
              <strong>
                {component.detail || `${Math.round(component.score)}%`}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashboard-panel-message">
          Add monthly transactions, budgets, or goal contributions to build
          recorded signals.
        </p>
      )}
      <p className="dashboard-health-note">
        {health.score === null
          ? "A balanced score needs at least two available signals."
          : "Weighted from available signals: cash flow (45%), budget control (35%), and recorded goal contributions (20%)."}{" "}
        Missing signals are omitted and remaining weights normalized. Cash
        flow and budget use are compared within each currency. Income stability
        is not inferred from one month; this is not financial advice.
      </p>
    </section>
  );
}

function QuickInsightPanel({ message }) {
  return (
    <section
      className="dashboard-panel dashboard-insight-panel"
      aria-labelledby="dashboard-insight-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">BASED ON YOUR RECORDS</p>
          <h2 id="dashboard-insight-title">Quick insight</h2>
        </div>
        <span className="dashboard-insight-mark" aria-hidden="true">
          DATA
        </span>
      </div>
      <p className="dashboard-insight-message">{message}</p>
      <p className="dashboard-health-note">
        This is a rule-based summary of recorded activity, not AI-generated
        advice.
      </p>
    </section>
  );
}

function RecentTransactions({ transactions, totalCount, error }) {
  const hasMore = totalCount > transactions.length;
  return (
    <section
      className="dashboard-panel dashboard-recent-panel"
      aria-labelledby="recent-transactions-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">LATEST ACTIVITY</p>
          <h2 id="recent-transactions-title">Recent transactions</h2>
        </div>
        {hasMore && (
          <Link className="text-button" to="/transactions">
            View all
          </Link>
        )}
      </div>
      {error ? (
        <p className="dashboard-panel-message" role="alert">
          Recent transactions are unavailable right now.
        </p>
      ) : transactions.length === 0 ? (
        <p className="dashboard-panel-message">
          No transactions have been recorded yet.
        </p>
      ) : (
        <ul className="dashboard-recent-list">
          {transactions.slice(0, 5).map((transaction) => (
            <li key={transaction.id}>
              <div className="dashboard-recent-identity">
                <strong>
                  {transaction.description?.trim() ||
                    transaction.category_name ||
                    "Transaction"}
                </strong>
                <span>
                  {transaction.category_name || "Uncategorized"} ·{" "}
                  {formatDate(transaction.transaction_date)} ·{" "}
                  {transaction.type === "income" ? "Income" : "Expense"}
                </span>
              </div>
              <strong className={`is-${transaction.type}`}>
                {transaction.type === "income" ? "+" : "-"}
                {formatCurrency(
                  transaction.amount,
                  transaction.currency_code,
                )}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const userId = user?.id;
  const [monthStart, setMonthStart] = useState(getCurrentMonthStart);
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [spendingRows, setSpendingRows] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [transactionCount, setTransactionCount] = useState(0);
  const [budgets, setBudgets] = useState([]);
  const [expenseTotals, setExpenseTotals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [monthlyContributions, setMonthlyContributions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [financeError, setFinanceError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [categoryWarning, setCategoryWarning] = useState("");
  const [savingsError, setSavingsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const requestId = useRef(0);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  const refreshData = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;

    if (!userId) {
      setMonthlySummary([]);
      setSpendingRows([]);
      setRecentTransactions([]);
      setTransactionCount(0);
      setBudgets([]);
      setExpenseTotals([]);
      setCategories([]);
      setSavingsGoals([]);
      setMonthlyContributions([]);
      setIsLoading(false);
      return;
    }

    const range = getMonthRange(monthStart);
    setIsLoading(true);
    setFinanceError("");
    setBudgetError("");
    setCategoryWarning("");
    setSavingsError("");
    setMonthlySummary([]);
    setSpendingRows([]);
    setRecentTransactions([]);
    setTransactionCount(0);
    setBudgets([]);
    setExpenseTotals([]);
    setCategories([]);
    setSavingsGoals([]);
    setMonthlyContributions([]);

    const loadTransactions = () =>
      Promise.all([
        getTransactionSummary(range.fromDate, range.toDate),
        listTransactions({
          search: "",
          type: "",
          categoryId: "",
          fromDate: null,
          toDate: null,
          sort: "date_desc",
          page: 0,
        }),
        listMonthlySpendingByDate(userId, range.fromDate, range.toDate),
      ]);

    const loadBudgetData = async () => {
      const [budgetResult, expenseResult, categoryResult] =
        await Promise.allSettled([
          listMonthlyBudgets(userId, monthStart),
          listMonthlyExpenseTotals(monthStart),
          listCategories(),
        ]);
      if (budgetResult.status === "rejected") {
        throw budgetResult.reason;
      }
      if (expenseResult.status === "rejected") {
        throw expenseResult.reason;
      }
      return {
        budgets: budgetResult.value,
        expenses: expenseResult.value,
        categories:
          categoryResult.status === "fulfilled" ? categoryResult.value : [],
        categoryError:
          categoryResult.status === "rejected"
            ? categoryResult.reason
            : null,
      };
    };

    const loadSavingsData = async () => {
      const goals = await listSavingsGoals(userId);
      const contributions = await listSavingsContributions(
        userId,
        goals.map((goal) => goal.id),
        range.fromDate,
        range.toDate,
      );
      return { goals, contributions };
    };

    const [transactionResult, budgetResult, savingsResult] =
      await Promise.allSettled([
        loadTransactions(),
        loadBudgetData(),
        loadSavingsData(),
      ]);

    if (requestId.current !== currentRequestId) {
      return;
    }

    if (transactionResult.status === "fulfilled") {
      const [summary, transactionPage, monthlySpending] =
        transactionResult.value;
      setMonthlySummary(summary);
      setRecentTransactions(transactionPage.transactions.slice(0, 5));
      setTransactionCount(transactionPage.totalCount);
      setSpendingRows(monthlySpending);
    } else {
      console.error(
        "Could not load Dashboard transaction data:",
        transactionResult.reason,
      );
      setFinanceError(
        getFinanceErrorMessage(
          transactionResult.reason,
          "Monthly transaction data could not be loaded. Check your connection and try again.",
        ),
      );
    }

    if (budgetResult.status === "fulfilled") {
      setBudgets(budgetResult.value.budgets);
      setExpenseTotals(budgetResult.value.expenses);
      setCategories(budgetResult.value.categories);
      if (budgetResult.value.categoryError) {
        console.error(
          "Could not load category names for Dashboard budgets:",
          budgetResult.value.categoryError,
        );
        setCategoryWarning(
          getFinanceErrorMessage(
            budgetResult.value.categoryError,
            "Budget category names are temporarily unavailable.",
          ),
        );
      }
    } else {
      console.error(
        "Could not load Dashboard budget data:",
        budgetResult.reason,
      );
      setBudgetError(
        getBudgetErrorMessage(
          budgetResult.reason,
          "Budget information could not be loaded. Try refreshing the Dashboard.",
        ),
      );
    }

    if (savingsResult.status === "fulfilled") {
      setSavingsGoals(savingsResult.value.goals);
      setMonthlyContributions(savingsResult.value.contributions);
    } else {
      console.error(
        "Could not load Dashboard savings data:",
        savingsResult.reason,
      );
      setSavingsError(
        getSavingsGoalErrorMessage(
          savingsResult.reason,
          "Savings contributions could not be loaded. Try refreshing the Dashboard.",
        ),
      );
    }

    setIsLoading(false);
  }, [monthStart, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshData, refreshKey]);

  useEffect(() => {
    const requestRefresh = () => setRefreshKey((current) => current + 1);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestRefresh();
      }
    };
    window.addEventListener("spendindix:transactions-changed", requestRefresh);
    window.addEventListener("spendindix:budgets-changed", requestRefresh);
    window.addEventListener("spendindix:savings-changed", requestRefresh);
    window.addEventListener("focus", requestRefresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener(
        "spendindix:transactions-changed",
        requestRefresh,
      );
      window.removeEventListener("spendindix:budgets-changed", requestRefresh);
      window.removeEventListener("spendindix:savings-changed", requestRefresh);
      window.removeEventListener("focus", requestRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const monthLabel = formatMonth(monthStart);
  const summaryByCurrency = useMemo(
    () => summarizeByCurrency(monthlySummary),
    [monthlySummary],
  );
  const spendingSeries = useMemo(
    () => getSpendingSeries(spendingRows, monthStart),
    [monthStart, spendingRows],
  );
  const budgetProgress = useMemo(
    () => getBudgetProgressRows(budgets, expenseTotals, categories),
    [budgets, categories, expenseTotals],
  );
  const savingsTotals = useMemo(
    () => getMonthlySavingsTotals(monthlyContributions, savingsGoals),
    [monthlyContributions, savingsGoals],
  );
  const financialHealth = useMemo(
    () =>
      getFinancialHealth(summaryByCurrency, budgetProgress, savingsTotals),
    [budgetProgress, savingsTotals, summaryByCurrency],
  );
  const quickInsight = useMemo(
    () =>
      getQuickInsight(
        summaryByCurrency,
        budgetProgress,
        savingsTotals,
        monthLabel,
        Boolean(financeError || budgetError || savingsError),
      ),
    [
      budgetProgress,
      budgetError,
      financeError,
      monthLabel,
      savingsError,
      savingsTotals,
      summaryByCurrency,
    ],
  );
  const currentMonthStart = getCurrentMonthStart();

  return (
    <>
      <header className="dashboard-page-heading">
        <div>
          <p className="eyebrow">YOUR FINANCIAL WORKSPACE</p>
          <h1>Dashboard</h1>
          <p className="dashboard-page-subtitle">
            A clear view of your recorded cash flow, budgets and savings.
          </p>
        </div>
      </header>

      <section
        className="dashboard-month-navigation"
        aria-label="Dashboard month selection"
      >
        <div>
          <p className="eyebrow">MONTHLY VIEW</p>
          <h2>{monthLabel}</h2>
        </div>
        <div className="dashboard-month-controls">
          <button
            type="button"
            className="dashboard-month-arrow"
            aria-label="Previous month"
            onClick={() => setMonthStart((month) => shiftMonth(month, -1))}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <input
            className="dashboard-month-input"
            type="month"
            aria-label="Select month"
            value={monthStart.slice(0, 7)}
            onChange={(event) => {
              if (event.target.value) {
                setMonthStart(`${event.target.value}-01`);
              }
            }}
          />
          <button
            type="button"
            className="dashboard-month-arrow"
            aria-label="Next month"
            onClick={() => setMonthStart((month) => shiftMonth(month, 1))}
          >
            <span aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            className="button-secondary dashboard-this-month"
            onClick={() => setMonthStart(currentMonthStart)}
            disabled={monthStart === currentMonthStart}
          >
            This month
          </button>
        </div>
      </section>

      {financeError && (
        <div className="finance-alert is-error" role="alert">
          <span>{financeError}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {!financeError && (budgetError || savingsError) && (
        <div className="finance-alert is-error" role="alert">
          <span>Some Dashboard sections could not be loaded.</span>
          <button
            type="button"
            className="text-button"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="dashboard-data-loading" role="status" aria-live="polite">
          Updating your {monthLabel} overview...
        </div>
      ) : (
        <>
          <section
            className="dashboard-overview-section"
            aria-labelledby="dashboard-overview-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <p className="eyebrow">AT A GLANCE</p>
                <h2 id="dashboard-overview-title">Financial overview</h2>
              </div>
              <span className="dashboard-section-detail">{monthLabel}</span>
            </div>
            <div className="dashboard-metric-grid">
              <DashboardMetricCard
                title="Total Income"
                detail="Recorded this month"
                entries={summaryByCurrency.map((item) => ({
                  currencyCode: item.currencyCode,
                  amount: item.income,
                }))}
                emptyMessage="No income data this month."
                error={Boolean(financeError)}
                className="is-income"
              />
              <DashboardMetricCard
                title="Total Expenses"
                detail="Recorded this month"
                entries={summaryByCurrency.map((item) => ({
                  currencyCode: item.currencyCode,
                  amount: item.expense,
                }))}
                emptyMessage="No expense data this month."
                error={Boolean(financeError)}
                className="is-expense"
              />
              <DashboardMetricCard
                title="Current Balance"
                detail="Monthly income less expenses"
                entries={summaryByCurrency.map((item) => ({
                  currencyCode: item.currencyCode,
                  amount: item.balance,
                }))}
                emptyMessage="No balance data this month."
                error={Boolean(financeError)}
                className="is-balance"
              />
              <DashboardMetricCard
                title="Total Savings"
                detail="Goal contributions this month"
                entries={savingsTotals}
                emptyMessage="No goal contributions this month."
                error={Boolean(savingsError)}
                errorMessage={savingsError}
                className="is-savings"
              />
            </div>
            <p className="dashboard-currency-note">
              Every amount remains in its recorded currency; currencies are not
              combined or converted. Current Balance is this month&apos;s net
              cash flow, not a bank-account balance.
            </p>
          </section>

          <div className="dashboard-primary-grid">
            <SpendingChart
              series={spendingSeries}
              monthLabel={monthLabel}
              error={Boolean(financeError)}
            />
            <BudgetOverview
              budgets={budgetProgress}
              error={budgetError}
              categoryWarning={categoryWarning}
              monthLabel={monthLabel}
            />
          </div>

          <div className="dashboard-secondary-grid">
            <FinancialHealthPanel health={financialHealth} />
            <QuickInsightPanel message={quickInsight} />
          </div>

          <RecentTransactions
            transactions={recentTransactions}
            totalCount={transactionCount}
            error={Boolean(financeError)}
          />
        </>
      )}

    </>
  );
}

export default Dashboard;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BudgetForm from "../components/BudgetForm";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import {
  formatCurrency,
  getCurrencyDecimalPlaces,
  getCurrencySettings,
} from "../lib/currency";
import {
  deleteBudget,
  getBudgetErrorMessage,
  listMonthlyBudgets,
  listMonthlyExpenseTotals,
  saveBudget,
} from "../lib/budgets";
import { listCategories } from "../lib/transactions";
import "./Budgets.css";

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function toMonthDate(monthStart) {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function formatMonth(monthStart) {
  return toMonthDate(monthStart).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(monthStart, offset) {
  const date = toMonthDate(monthStart);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function roundAmount(value, currencyCode) {
  const digits = getCurrencyDecimalPlaces(currencyCode);
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function getBudgetSummary(budgets, expenses) {
  const allocatedByCurrency = new Map();
  const spentByBudgetCurrency = new Map();
  const budgetedCategoryCurrencies = new Set();

  budgets.forEach((budget) => {
    const currencyCode = budget.currency_code;
    const pair = `${budget.category_id}:${currencyCode}`;
    budgetedCategoryCurrencies.add(pair);
    allocatedByCurrency.set(
      currencyCode,
      (allocatedByCurrency.get(currencyCode) || 0) + Number(budget.amount),
    );
    const matchingSpend = Number(budget.spent_amount || 0);
    spentByBudgetCurrency.set(
      currencyCode,
      (spentByBudgetCurrency.get(currencyCode) || 0) + matchingSpend,
    );
  });

  const uncoveredByCurrency = new Map();
  expenses.forEach((expense) => {
    const pair = `${expense.category_id}:${expense.currency_code}`;
    if (budgetedCategoryCurrencies.has(pair)) {
      return;
    }
    uncoveredByCurrency.set(
      expense.currency_code,
      (uncoveredByCurrency.get(expense.currency_code) || 0) +
        Number(expense.spent_amount || 0),
    );
  });

  const summaries = [...allocatedByCurrency.entries()]
    .sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB))
    .map(([currencyCode, allocated]) => {
      const spent = spentByBudgetCurrency.get(currencyCode) || 0;
      const safeAllocated = roundAmount(allocated, currencyCode);
      const safeSpent = roundAmount(spent, currencyCode);
      return {
        currencyCode,
        allocated: safeAllocated,
        spent: safeSpent,
        remaining: roundAmount(safeAllocated - safeSpent, currencyCode),
        percentUsed: safeAllocated > 0 ? (safeSpent / safeAllocated) * 100 : 0,
      };
    });

  const uncovered = [...uncoveredByCurrency.entries()]
    .map(([currencyCode, amount]) => ({
      currencyCode,
      amount: roundAmount(amount, currencyCode),
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

  return { summaries, uncovered };
}

function getBudgetStatus(percentUsed) {
  if (percentUsed > 100) {
    return { label: "Exceeded", className: "is-exceeded" };
  }
  if (percentUsed === 100) {
    return { label: "Fully used", className: "is-full" };
  }
  if (percentUsed >= 80) {
    return { label: "Approaching limit", className: "is-approaching" };
  }
  return { label: "Within budget", className: "is-within" };
}

function formatPercent(value) {
  const roundedValue = Math.round(value * 100) / 100;
  if (value > 100 && roundedValue <= 100) {
    return ">100%";
  }
  if (value < 100 && roundedValue >= 100) {
    return "<100%";
  }
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function getBudgetProgress(budget) {
  const currencyCode = budget.currency_code;
  const spent = roundAmount(Number(budget.spent_amount || 0), currencyCode);
  const limit = roundAmount(Number(budget.amount), currencyCode);
  const percentUsed = limit > 0 ? (spent / limit) * 100 : 0;

  return {
    spent,
    limit,
    percentUsed,
    progressWidth: Math.min(Math.max(percentUsed, 0), 100),
    remaining: roundAmount(limit - spent, currencyCode),
    status: getBudgetStatus(percentUsed),
  };
}

function getBudgetTip(budgets, expenses, categoryNames) {
  if (budgets.length === 0) {
    return {
      className: "is-neutral",
      message: expenses.length
        ? "Your recorded expenses aren't matched to a budget yet. Add a category budget to compare spending without currency conversion."
        : "Create a category budget to track this month's recorded expenses against a limit.",
    };
  }

  const rows = budgets.map((budget) => ({
    ...getBudgetProgress(budget),
    categoryName:
      categoryNames.get(budget.category_id) || "This category",
    currencyCode: budget.currency_code,
  }));
  const mostUsedFirst = (a, b) => b.percentUsed - a.percentUsed;
  const exceeded = rows
    .filter((row) => row.status.className === "is-exceeded")
    .sort(mostUsedFirst)[0];
  if (exceeded) {
    const excess = roundAmount(
      exceeded.spent - exceeded.limit,
      exceeded.currencyCode,
    );
    return {
      className: "is-exceeded",
      message: `You're ${formatCurrency(excess, exceeded.currencyCode)} over budget for ${exceeded.categoryName}. Try reducing non-essential spending for the rest of the month.`,
    };
  }

  const fullyUsed = rows.find((row) => row.status.className === "is-full");
  if (fullyUsed) {
    return {
      className: "is-full",
      message: `You've used your entire ${fullyUsed.categoryName} budget (${formatCurrency(fullyUsed.limit, fullyUsed.currencyCode)}). Consider limiting further spending this month.`,
    };
  }

  const approaching = rows
    .filter((row) => row.status.className === "is-approaching")
    .sort(mostUsedFirst)[0];
  if (approaching) {
    return {
      className: "is-approaching",
      message: `You've used most of your ${approaching.categoryName} budget (${formatCurrency(approaching.spent, approaching.currencyCode)} of ${formatCurrency(approaching.limit, approaching.currencyCode)}). Consider limiting further spending.`,
    };
  }

  const noSpending = rows.find((row) => row.spent === 0);
  if (noSpending) {
    return {
      className: "is-neutral",
      message: `You haven't spent in ${noSpending.categoryName} yet. Your ${formatCurrency(noSpending.limit, noSpending.currencyCode)} budget is ready to track expenses.`,
    };
  }

  const lowSpending = [...rows].sort(mostUsedFirst)[0];
  return {
    className: "is-positive",
    message: `You're keeping ${lowSpending.categoryName} spending well within its limit (${formatCurrency(lowSpending.spent, lowSpending.currencyCode)} of ${formatCurrency(lowSpending.limit, lowSpending.currencyCode)}). Keep it up!`,
  };
}

function CurrencyOverview({ summary }) {
  const remainingIsNegative = summary.remaining < 0;
  const progressWidth = Math.min(Math.max(summary.percentUsed, 0), 100);
  const status = getBudgetStatus(summary.percentUsed);

  return (
    <section
      className="budget-currency-overview"
      aria-labelledby={`budget-overview-${summary.currencyCode}`}
    >
      <div className="budget-currency-heading">
        <span className="budget-currency-chip">{summary.currencyCode}</span>
        <div>
          <h3 id={`budget-overview-${summary.currencyCode}`}>
            Monthly overview
          </h3>
          <p>Totals are kept separate by currency.</p>
        </div>
      </div>
      <div className="budget-metrics-grid">
        <article className="budget-metric-card">
          <span className="budget-metric-label">Allocated</span>
          <strong>
            {formatCurrency(summary.allocated, summary.currencyCode)}
          </strong>
          <span className="budget-metric-detail">Across budget categories</span>
        </article>
        <article className="budget-metric-card">
          <span className="budget-metric-label">Spent</span>
          <strong>{formatCurrency(summary.spent, summary.currencyCode)}</strong>
          <span className="budget-metric-detail">Recorded expenses only</span>
        </article>
        <article
          className={`budget-metric-card ${
            remainingIsNegative ? "is-negative" : ""
          }`}
        >
          <span className="budget-metric-label">
            {remainingIsNegative ? "Over budget" : "Remaining"}
          </span>
          <strong>
            {formatCurrency(
              Math.abs(summary.remaining),
              summary.currencyCode,
            )}
          </strong>
          <span className="budget-metric-detail">
            {remainingIsNegative ? "Above the allocated total" : "Available to spend"}
          </span>
        </article>
        <article className="budget-metric-card budget-usage-card">
          <div className="budget-usage-heading">
            <span className="budget-metric-label">Overall usage</span>
            <strong>{formatPercent(summary.percentUsed)}</strong>
          </div>
          <div
            className={`budget-progress-track ${status.className}`}
            role="progressbar"
            aria-label={`Overall ${summary.currencyCode} budget usage`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.min(summary.percentUsed, 100)}
            aria-valuetext={`${formatPercent(summary.percentUsed)} used, ${status.label}`}
          >
            <span style={{ width: `${progressWidth}%` }} />
          </div>
          <span className={`budget-metric-detail ${status.className}`}>
            {status.label}
          </span>
        </article>
      </div>
    </section>
  );
}

function CategoryMark({ name }) {
  const initial = name.trim().charAt(0).toLocaleUpperCase() || "?";
  return (
    <span className="budget-category-mark" aria-hidden="true">
      {initial}
    </span>
  );
}

function BudgetCard({ budget, categoryName, expenses, onEdit, onDelete }) {
  const {
    spent,
    limit,
    percentUsed,
    progressWidth,
    remaining,
    status,
  } = getBudgetProgress(budget);
  const otherCurrencySpending = expenses.filter(
    (expense) =>
      expense.category_id === budget.category_id &&
      expense.currency_code !== budget.currency_code &&
      Number(expense.spent_amount) > 0,
  );

  return (
    <article className="budget-category-card">
      <div className="budget-card-heading">
        <div className="budget-category-identity">
          <CategoryMark name={categoryName} />
          <div>
            <h3>{categoryName}</h3>
            <span className="budget-card-currency">{budget.currency_code}</span>
          </div>
        </div>
        <span className={`budget-status ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="budget-card-amounts">
        <div>
          <span>Spent</span>
          <strong>{formatCurrency(spent, budget.currency_code)}</strong>
        </div>
        <div>
          <span>Monthly limit</span>
          <strong>{formatCurrency(limit, budget.currency_code)}</strong>
        </div>
        <div className={remaining < 0 ? "is-negative" : ""}>
          <span>{remaining < 0 ? "Over by" : "Remaining"}</span>
          <strong>
            {formatCurrency(Math.abs(remaining), budget.currency_code)}
          </strong>
        </div>
      </div>

      <div className="budget-card-progress">
        <div className="budget-card-progress-heading">
          <span>Budget used</span>
          <strong>{formatPercent(percentUsed)}</strong>
        </div>
        <div
          className={`budget-progress-track ${status.className}`}
          role="progressbar"
          aria-label={`${categoryName} budget usage`}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progressWidth}
          aria-valuetext={`${formatPercent(percentUsed)} used, ${status.label}`}
        >
          <span style={{ width: `${progressWidth}%` }} />
        </div>
      </div>

      {status.className === "is-approaching" && (
        <p className="budget-card-warning is-approaching" role="status">
          You're approaching your budget limit.
        </p>
      )}
      {status.className === "is-full" && (
        <p className="budget-card-warning is-full" role="status">
          You've used your entire budget.
        </p>
      )}
      {status.className === "is-exceeded" && (
        <p className="budget-card-warning is-exceeded" role="status">
          You've exceeded your budget by{" "}
          {formatCurrency(
            roundAmount(spent - limit, budget.currency_code),
            budget.currency_code,
          )}
          .
        </p>
      )}

      {otherCurrencySpending.length > 0 && (
        <p className="budget-currency-warning">
          Expenses in{" "}
          {otherCurrencySpending
            .map((expense) => expense.currency_code)
            .join(", ")}{" "}
          are not counted or converted.
        </p>
      )}

      <div className="budget-card-actions">
        <button
          type="button"
          className="budget-card-action"
          onClick={() => onEdit(budget)}
          aria-label={`Edit ${categoryName} budget`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="m13.7 3.3 3 3M4 16l3.6-.7L16 6.9a1.8 1.8 0 0 0-2.6-2.6L5 12.7 4 16Z" />
          </svg>
          Edit
        </button>
        <button
          type="button"
          className="budget-card-action is-delete"
          onClick={() => onDelete(budget)}
          aria-label={`Delete ${categoryName} budget`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M4.5 6h11M8 6V4h4v2m2.5 0-.6 10h-8L5.3 6m3.2 3v4m3-4v4" />
          </svg>
          Delete
        </button>
      </div>
    </article>
  );
}

function BudgetLoading() {
  return (
    <div className="budget-loading" role="status" aria-live="polite">
      <span className="budget-spinner" aria-hidden="true" />
      <span>Loading your monthly budgets...</span>
    </div>
  );
}

function Budgets() {
  const { user } = useAuth();
  const userId = user?.id;
  const accountCurrency = getCurrencySettings(user).code;
  const [monthStart, setMonthStart] = useState(getCurrentMonth);
  const [budgets, setBudgets] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetToDelete, setBudgetToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    if (!userId) {
      setBudgets([]);
      setExpenses([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPageError("");
    try {
      const [monthlyBudgets, monthlyExpenses, categoryData] = await Promise.all([
        listMonthlyBudgets(userId, monthStart),
        listMonthlyExpenseTotals(monthStart),
        listCategories(userId),
      ]);
      if (requestId.current !== currentRequestId) {
        return;
      }
      const budgetSpending = new Map(
        monthlyExpenses.map((expense) => [
          `${expense.categoryId}:${expense.currencyCode}`,
          expense.amount,
        ]),
      );
      setBudgets(
        monthlyBudgets.map((budget) => ({
          ...budget,
          spent_amount:
            budgetSpending.get(
              `${budget.category_id}:${budget.currency_code}`,
            ) || 0,
        })),
      );
      setExpenses(
        monthlyExpenses.map((expense) => ({
          category_id: expense.categoryId,
          currency_code: expense.currencyCode,
          spent_amount: expense.amount,
        })),
      );
      setCategories(categoryData);
    } catch (error) {
      if (requestId.current !== currentRequestId) {
        return;
      }
      console.error("Could not load budgets:", error);
      setPageError(
        getBudgetErrorMessage(
          error,
          "We could not load your budgets. Check your connection and try again.",
        ),
      );
    } finally {
      if (requestId.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, [monthStart, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const refreshBudgets = () => {
      void loadData();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshBudgets();
      }
    };

    window.addEventListener("spendindix:transactions-changed", refreshBudgets);
    window.addEventListener("focus", refreshBudgets);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener(
        "spendindix:transactions-changed",
        refreshBudgets,
      );
      window.removeEventListener("focus", refreshBudgets);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadData]);

  const monthLabel = formatMonth(monthStart);
  const isCurrentMonth = monthStart === getCurrentMonth();
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort((a, b) => {
        const nameA = categoryNames.get(a.category_id) || "Unknown category";
        const nameB = categoryNames.get(b.category_id) || "Unknown category";
        return nameA.localeCompare(nameB);
      }),
    [budgets, categoryNames],
  );
  const budgetGroups = useMemo(() => {
    const groups = new Map();
    sortedBudgets.forEach((budget) => {
      if (!groups.has(budget.currency_code)) {
        groups.set(budget.currency_code, []);
      }
      groups.get(budget.currency_code).push(budget);
    });
    return [...groups.entries()].sort(([currencyA], [currencyB]) =>
      currencyA.localeCompare(currencyB),
    );
  }, [sortedBudgets]);
  const summary = useMemo(
    () => getBudgetSummary(budgets, expenses),
    [budgets, expenses],
  );
  const budgetTip = useMemo(
    () => getBudgetTip(budgets, expenses, categoryNames),
    [budgets, categoryNames, expenses],
  );
  const storedCurrencies = useMemo(
    () =>
      [...new Set(budgets.map((budget) => budget.currency_code))]
        .filter((currencyCode) => currencyCode !== accountCurrency)
        .sort(),
    [accountCurrency, budgets],
  );

  const openCreateForm = () => {
    setEditingBudget(null);
    setIsFormOpen(true);
    setSuccessMessage("");
  };

  const openEditForm = (budget) => {
    setEditingBudget(budget);
    setIsFormOpen(true);
    setSuccessMessage("");
  };

  const handleSaveBudget = async (values) => {
    await saveBudget(userId, editingBudget?.id || null, values);
    setIsFormOpen(false);
    setEditingBudget(null);
    setSuccessMessage(
      editingBudget ? "Budget updated." : "Budget created.",
    );
    await loadData();
  };

  const handleDeleteBudget = async () => {
    if (!budgetToDelete || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteBudget(userId, budgetToDelete.id);
      setBudgetToDelete(null);
      setSuccessMessage("Budget deleted.");
      await loadData();
    } catch (error) {
      console.error("Could not delete budget:", error);
      setDeleteError(
        getBudgetErrorMessage(
          error,
          "We could not delete this budget. Please try again.",
        ),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingBudget(null);
  };

  const deleteCategoryName = budgetToDelete
    ? categoryNames.get(budgetToDelete.category_id) || "this category"
    : "";

  return (
    <div className="budgets-page">
      <header className="budgets-page-header">
        <div className="budgets-page-heading">
          <p className="budget-eyebrow">SPENDING PLAN</p>
          <h1>Budgets</h1>
          <p>
            Set monthly limits and keep an eye on spending by category.
          </p>
        </div>
        <button
          type="button"
          className="budget-button-primary budget-create-button"
          onClick={openCreateForm}
          disabled={isLoading || expenseCategories.length === 0}
        >
          <span aria-hidden="true">+</span>
          Create budget
        </button>
      </header>

      <nav className="budget-month-bar" aria-label="Budget month navigation">
        <button
          type="button"
          className="budget-month-arrow"
          aria-label="Previous month"
          onClick={() => {
            setSuccessMessage("");
            setMonthStart((current) => shiftMonth(current, -1));
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <path
              d="m12 4-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="budget-month-label" aria-live="polite">
          <span>MONTHLY PLAN</span>
          <h2>{monthLabel}</h2>
        </div>
        <button
          type="button"
          className="budget-month-arrow"
          aria-label="Next month"
          onClick={() => {
            setSuccessMessage("");
            setMonthStart((current) => shiftMonth(current, 1));
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <path
              d="m8 4 6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {!isCurrentMonth && (
          <button
            type="button"
            className="budget-this-month-button"
            onClick={() => {
              setSuccessMessage("");
              setMonthStart(getCurrentMonth());
            }}
          >
            This month
          </button>
        )}
      </nav>

      {storedCurrencies.length > 0 && (
        <p className="budget-currency-note" role="note">
          Some saved budgets use {storedCurrencies.join(", ")} instead of your
          current account currency ({accountCurrency}). Existing amounts are
          unchanged; no conversion is applied.
        </p>
      )}

      {successMessage && (
        <p className="budget-success-message" role="status">
          <span aria-hidden="true">✓</span> {successMessage}
        </p>
      )}

      {pageError && (
        <div className="budget-error-banner" role="alert">
          <span>{pageError}</span>
          <button type="button" onClick={loadData}>
            Try again
          </button>
        </div>
      )}

      {!pageError && isLoading ? (
        <BudgetLoading />
      ) : (
        <>
          {summary.summaries.length > 0 && (
            <section className="budget-overview-section">
              <div className="budget-section-heading">
                <div>
                  <p className="budget-eyebrow">AT A GLANCE</p>
                  <h2>Monthly overview</h2>
                </div>
                <p>Only recorded expenses are included.</p>
              </div>
              <div className="budget-overview-groups">
                {summary.summaries.map((currencySummary) => (
                  <CurrencyOverview
                    key={currencySummary.currencyCode}
                    summary={currencySummary}
                  />
                ))}
              </div>
            </section>
          )}

          {summary.uncovered.length > 0 && (
            <aside className="budget-uncovered-note" role="note">
              <span className="budget-note-icon" aria-hidden="true">i</span>
              <p>
                <strong>Not counted toward a budget:</strong>{" "}
                {summary.uncovered
                  .map(({ amount, currencyCode }) =>
                    formatCurrency(amount, currencyCode),
                  )
                  .join(" · ")}
                . These expenses are in categories without a matching budget
                or use a different currency. They are not converted.
              </p>
            </aside>
          )}

          {!pageError && (
            <section
              className={`budget-tip ${budgetTip.className}`}
              aria-labelledby="budget-tip-title"
            >
              <span className="budget-tip-mark" aria-hidden="true">
                TIP
              </span>
              <div>
                <h2 id="budget-tip-title">Budget tip</h2>
                <p>{budgetTip.message}</p>
              </div>
            </section>
          )}

          {budgets.length === 0 ? (
            <section className="budget-empty-state">
              <span className="budget-empty-mark" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path
                    d="M8 14.5h28a4 4 0 0 1 4 4v17H12a4 4 0 0 1-4-4v-17Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M8 16V12a3 3 0 0 1 3-3h25M30 25h10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="31" cy="25" r="1.5" fill="currentColor" />
                </svg>
              </span>
              <p className="budget-eyebrow">{monthLabel.toUpperCase()}</p>
              <h2>No budgets for this month yet</h2>
              {expenseCategories.length > 0 ? (
                <p>
                  Use <strong>Create budget</strong> above to set a spending
                  limit for an expense category.
                </p>
              ) : (
                <p>
                  Add an expense category first, then you can create a budget.
                  <Link to="/transactions"> Go to Transactions</Link>
                </p>
              )}
            </section>
          ) : (
            <section className="budget-category-section">
              <div className="budget-section-heading">
                <div>
                  <p className="budget-eyebrow">CATEGORY BREAKDOWN</p>
                  <h2>Your category budgets</h2>
                </div>
                <p>
                  {budgets.length} {budgets.length === 1 ? "category" : "categories"}
                </p>
              </div>
              <div className="budget-category-groups">
                {budgetGroups.map(([currencyCode, currencyBudgets]) => (
                  <section
                    className="budget-category-currency-group"
                    key={currencyCode}
                    aria-label={`${currencyCode} category budgets`}
                  >
                    {budgetGroups.length > 1 && (
                      <div className="budget-category-group-heading">
                        <span className="budget-currency-chip">
                          {currencyCode}
                        </span>
                        <span>Amounts shown in {currencyCode}</span>
                      </div>
                    )}
                    <div className="budget-category-grid">
                      {currencyBudgets.map((budget) => (
                        <BudgetCard
                          key={budget.id}
                          budget={budget}
                          categoryName={
                            categoryNames.get(budget.category_id) ||
                            "Unknown category"
                          }
                          expenses={expenses}
                          onEdit={openEditForm}
                          onDelete={(item) => {
                            setBudgetToDelete(item);
                            setDeleteError("");
                          }}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {isFormOpen && (
        <BudgetForm
          isOpen
          onClose={closeForm}
          onSave={handleSaveBudget}
          budget={editingBudget}
          monthLabel={monthLabel}
          monthStart={monthStart}
          categories={categories}
          existingBudgets={budgets}
          defaultCurrency={accountCurrency}
        />
      )}

      <Modal
        isOpen={Boolean(budgetToDelete)}
        onClose={() => {
          if (!isDeleting) {
            setBudgetToDelete(null);
            setDeleteError("");
          }
        }}
        titleId="delete-budget-title"
        className="budget-confirm-dialog"
        preventClose={isDeleting}
      >
        <div className="budget-dialog-header">
          <div>
            <p className="budget-eyebrow">REMOVE MONTHLY LIMIT</p>
            <h2 id="delete-budget-title">Delete this budget?</h2>
          </div>
          <button
            type="button"
            className="budget-icon-button"
            aria-label="Close delete budget confirmation"
            onClick={() => {
              if (!isDeleting) {
                setBudgetToDelete(null);
                setDeleteError("");
              }
            }}
            disabled={isDeleting}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <p className="budget-delete-description">
          Delete the {deleteCategoryName} budget for {monthLabel}? This does not
          delete any transactions.
        </p>
        {deleteError && (
          <p className="budget-form-error-banner" role="alert">
            {deleteError}
          </p>
        )}
        <div className="budget-dialog-actions">
          <button
            type="button"
            className="budget-button-secondary"
            onClick={() => {
              setBudgetToDelete(null);
              setDeleteError("");
            }}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="budget-button-danger"
            onClick={handleDeleteBudget}
            disabled={isDeleting}
            aria-busy={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete budget"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default Budgets;

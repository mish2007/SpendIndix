import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SavingsContributionForm from "../components/SavingsContributionForm";
import SavingsContributionHistory from "../components/SavingsContributionHistory";
import SavingsGoalForm from "../components/SavingsGoalForm";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, getCurrencyDecimalPlaces, getCurrencySettings } from "../lib/currency";
import {
  addSavingsContribution,
  deleteSavingsContribution,
  deleteSavingsGoal,
  getSavingsGoalErrorMessage,
  listSavingsContributions,
  listSavingsGoals,
  saveSavingsGoal,
} from "../lib/savingsGoals";
import "./SavingsGoals.css";

function getToday() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function roundAmount(value, currencyCode) {
  const digits = getCurrencyDecimalPlaces(currencyCode);
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function formatGoalDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getGoalStatus(goal, savedAmount) {
  if (savedAmount >= Number(goal.target_amount)) {
    return { label: "Completed", className: "is-completed" };
  }
  if (goal.target_date && goal.target_date < getToday()) {
    return { label: "Overdue", className: "is-overdue" };
  }
  return { label: "Active", className: "is-active" };
}

function getSavingsTip(goals, contributions) {
  if (goals.length === 0) {
    return "Create a savings goal to start tracking your progress.";
  }

  const overdueGoal = goals
    .filter(
      (goal) =>
        getGoalStatus(goal, goal.savedAmount).className === "is-overdue",
    )
    .sort((a, b) => b.target_date.localeCompare(a.target_date))[0];
  if (overdueGoal) {
    const remaining = Math.max(
      Number(overdueGoal.target_amount) - overdueGoal.savedAmount,
      0,
    );
    return `Your ${overdueGoal.name} goal is past its target date, with ${formatCurrency(remaining, overdueGoal.currency_code)} remaining.`;
  }

  const today = Date.parse(`${getToday()}T00:00:00Z`);
  const approachingGoal = goals
    .filter((goal) => {
      if (
        !goal.target_date ||
        getGoalStatus(goal, goal.savedAmount).className !== "is-active"
      ) {
        return false;
      }
      const daysUntilTarget =
        (Date.parse(`${goal.target_date}T00:00:00Z`) - today) /
        (24 * 60 * 60 * 1000);
      return daysUntilTarget >= 0 && daysUntilTarget <= 30;
    })
    .sort((a, b) => a.target_date.localeCompare(b.target_date))[0];
  if (approachingGoal) {
    const remaining = Math.max(
      Number(approachingGoal.target_amount) - approachingGoal.savedAmount,
      0,
    );
    return `Your ${approachingGoal.name} goal's target date is approaching, with ${formatCurrency(remaining, approachingGoal.currency_code)} still to save.`;
  }

  const completedGoal = goals.find(
    (goal) =>
      getGoalStatus(goal, goal.savedAmount).className === "is-completed",
  );
  if (completedGoal) {
    return `You've reached your ${completedGoal.name} goal. Great work!`;
  }

  if (
    contributions.length === 0 &&
    goals.every((goal) => goal.savedAmount === 0)
  ) {
    return "Start with a small contribution. Even small amounts help build your savings.";
  }

  const progressingGoal = goals
    .filter(
      (goal) =>
        goal.savedAmount > 0 &&
        goal.savedAmount < Number(goal.target_amount),
    )
    .sort(
      (a, b) =>
        b.savedAmount / Number(b.target_amount) -
        a.savedAmount / Number(a.target_amount),
    )[0];
  if (progressingGoal) {
    return `You've saved ${formatCurrency(progressingGoal.savedAmount, progressingGoal.currency_code)} toward ${progressingGoal.name}. Keep contributing consistently.`;
  }

  return "Your goals are ready for contributions. Record savings to track your progress.";
}

function getCurrencySummaries(goals) {
  const summaries = new Map();
  goals.forEach((goal) => {
    const currencyCode = goal.currency_code;
    const current = summaries.get(currencyCode) || {
      currencyCode,
      target: 0,
      saved: 0,
      remaining: 0,
    };
    current.target += Number(goal.target_amount);
    current.saved += goal.savedAmount;
    current.remaining += Math.max(
      Number(goal.target_amount) - goal.savedAmount,
      0,
    );
    summaries.set(currencyCode, current);
  });

  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      target: roundAmount(summary.target, summary.currencyCode),
      saved: roundAmount(summary.saved, summary.currencyCode),
      remaining: roundAmount(summary.remaining, summary.currencyCode),
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}

function GoalCard({ goal, onContribute, onHistory, onEdit, onDelete }) {
  const targetAmount = Number(goal.target_amount);
  const savedAmount = goal.savedAmount;
  const remaining = Math.max(targetAmount - savedAmount, 0);
  const percentage = targetAmount > 0 ? (savedAmount / targetAmount) * 100 : 0;
  const progressWidth = Math.min(Math.max(percentage, 0), 100);
  const status = getGoalStatus(goal, savedAmount);
  const formattedPercentage = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(percentage);

  return (
    <article className={`savings-goal-card ${status.className}`}>
      <div className="savings-goal-card-heading">
        <div className="savings-goal-identity">
          <span className="savings-goal-mark" aria-hidden="true">
            {goal.name.trim().charAt(0).toLocaleUpperCase()}
          </span>
          <div className="savings-goal-title">
            <h3>{goal.name}</h3>
          </div>
        </div>
        <span className={`savings-goal-status ${status.className}`}>
          {status.label}
        </span>
      </div>

      {goal.description && (
        <p className="savings-goal-description">{goal.description}</p>
      )}

      <div className="savings-goal-progress">
        <div className="savings-goal-progress-heading">
          <span>{formattedPercentage}% saved</span>
          <span>
            {goal.target_date
              ? `Target ${formatGoalDate(goal.target_date)}`
              : "No target date"}
          </span>
        </div>
        <div
          className={`savings-progress-track ${status.className}`}
          role="progressbar"
          aria-label={`${goal.name} savings progress`}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progressWidth}
          aria-valuetext={`${formattedPercentage}% saved`}
        >
          <span style={{ width: `${progressWidth}%` }} />
        </div>
      </div>

      <div className="savings-goal-amounts">
        <div>
          <span>Saved</span>
          <strong>{formatCurrency(savedAmount, goal.currency_code)}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{formatCurrency(targetAmount, goal.currency_code)}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>{formatCurrency(remaining, goal.currency_code)}</strong>
        </div>
      </div>

      <div className="savings-goal-actions">
        <button
          type="button"
          className="savings-action-primary"
          onClick={() => onContribute(goal)}
          disabled={status.className === "is-completed"}
          title={
            status.className === "is-completed"
              ? "This goal has reached its target."
              : undefined
          }
        >
          Add contribution
        </button>
        <button
          type="button"
          className="savings-action-secondary"
          onClick={() => onHistory(goal)}
        >
          History
        </button>
        <button
          type="button"
          className="savings-action-secondary"
          onClick={() => onEdit(goal)}
          aria-label={`Edit ${goal.name}`}
        >
          Edit
        </button>
        <button
          type="button"
          className="savings-action-danger"
          onClick={() => onDelete(goal)}
          aria-label={`Delete ${goal.name}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function GoalLoading() {
  return (
    <div className="savings-loading" role="status" aria-live="polite">
      <span className="savings-spinner" aria-hidden="true" />
      Loading your savings goals...
    </div>
  );
}

function SavingsGoals() {
  const { user } = useAuth();
  const userId = user?.id;
  const accountCurrency = getCurrencySettings(user).code;
  const [goals, setGoals] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState("");
  const [contributingGoalId, setContributingGoalId] = useState("");
  const [historyGoalId, setHistoryGoalId] = useState("");
  const [goalToDelete, setGoalToDelete] = useState(null);
  const [goalDeleteError, setGoalDeleteError] = useState("");
  const [isDeletingGoal, setIsDeletingGoal] = useState(false);
  const requestId = useRef(0);
  const deletingGoalRef = useRef(false);

  const loadData = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    if (!userId) {
      setGoals([]);
      setContributions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPageError("");
    try {
      const nextGoals = await listSavingsGoals(userId);
      const nextContributions = await listSavingsContributions(
        userId,
        nextGoals.map((goal) => goal.id),
      );
      if (requestId.current === currentRequestId) {
        setGoals(nextGoals);
        setContributions(nextContributions);
      }
    } catch (error) {
      if (requestId.current === currentRequestId) {
        console.error("Could not load savings goals:", error);
        setPageError(
          getSavingsGoalErrorMessage(
            error,
            "We could not load your savings goals. Check your connection and try again.",
          ),
        );
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const contributionsByGoal = useMemo(() => {
    const grouped = new Map();
    contributions.forEach((contribution) => {
      if (!grouped.has(contribution.goal_id)) {
        grouped.set(contribution.goal_id, []);
      }
      grouped.get(contribution.goal_id).push(contribution);
    });
    return grouped;
  }, [contributions]);
  const contributionTotals = useMemo(() => {
    const totals = new Map();
    contributions.forEach((contribution) => {
      totals.set(
        contribution.goal_id,
        (totals.get(contribution.goal_id) || 0) +
          Number(contribution.amount),
      );
    });
    return totals;
  }, [contributions]);
  const enrichedGoals = useMemo(
    () =>
      goals.map((goal) => ({
        ...goal,
        contributionTotal: contributionTotals.get(goal.id) || 0,
        savedAmount: roundAmount(
          Number(goal.initial_amount) +
            (contributionTotals.get(goal.id) || 0),
          goal.currency_code,
        ),
      })),
    [contributionTotals, goals],
  );
  const currencySummaries = useMemo(
    () => getCurrencySummaries(enrichedGoals),
    [enrichedGoals],
  );
  const savingsTip = useMemo(
    () => getSavingsTip(enrichedGoals, contributions),
    [contributions, enrichedGoals],
  );
  const activeGoalCount = useMemo(
    () =>
      enrichedGoals.filter(
        (goal) => getGoalStatus(goal, goal.savedAmount).className === "is-active",
      ).length,
    [enrichedGoals],
  );
  const editingGoal = enrichedGoals.find((goal) => goal.id === editingGoalId);
  const contributingGoal = enrichedGoals.find(
    (goal) => goal.id === contributingGoalId,
  );
  const historyGoal = enrichedGoals.find((goal) => goal.id === historyGoalId);
  const goalContributionHistory = historyGoal
    ? contributionsByGoal.get(historyGoal.id) || []
    : [];

  const openCreateForm = () => {
    setEditingGoalId("");
    setIsGoalFormOpen(true);
    setSuccessMessage("");
  };

  const openEditForm = (goal) => {
    setEditingGoalId(goal.id);
    setIsGoalFormOpen(true);
    setSuccessMessage("");
  };

  const handleSaveGoal = async (values) => {
    await saveSavingsGoal(userId, editingGoal?.id || null, values);
    setIsGoalFormOpen(false);
    setEditingGoalId("");
    setSuccessMessage(editingGoal ? "Savings goal updated." : "Savings goal created.");
    await loadData();
  };

  const handleSaveContribution = async (values) => {
    await addSavingsContribution(userId, contributingGoal.id, values);
    setContributingGoalId("");
    setSuccessMessage(`Contribution added to ${contributingGoal.name}.`);
    await loadData();
  };

  const handleDeleteContribution = async (contributionId) => {
    await deleteSavingsContribution(userId, contributionId);
    setSuccessMessage("Contribution deleted.");
    await loadData();
  };

  const handleDeleteGoal = async () => {
    if (!goalToDelete || deletingGoalRef.current || isDeletingGoal) {
      return;
    }

    deletingGoalRef.current = true;
    setIsDeletingGoal(true);
    setGoalDeleteError("");
    try {
      await deleteSavingsGoal(userId, goalToDelete.id);
      setGoalToDelete(null);
      setSuccessMessage("Savings goal and its contribution history deleted.");
      await loadData();
    } catch (error) {
      console.error("Could not delete savings goal:", error);
      setGoalDeleteError(
        getSavingsGoalErrorMessage(
          error,
          "We could not delete this savings goal. Please try again.",
        ),
      );
    } finally {
      deletingGoalRef.current = false;
      setIsDeletingGoal(false);
    }
  };

  const closeGoalForm = () => {
    setIsGoalFormOpen(false);
    setEditingGoalId("");
  };

  return (
    <div className="savings-goals-page">
      <header className="savings-page-header">
        <div>
          <p className="savings-eyebrow">PLAN FOR WHAT MATTERS</p>
          <h1>Savings Goals</h1>
          <p>
            Set a target, record contributions and follow your progress over time.
          </p>
        </div>
        <button
          type="button"
          className="savings-button-primary savings-create-button"
          onClick={openCreateForm}
          disabled={!userId || isLoading}
        >
          <span aria-hidden="true">+</span>
          Create goal
        </button>
      </header>

      {successMessage && (
        <p className="savings-success-message" role="status">
          <span aria-hidden="true">✓</span> {successMessage}
        </p>
      )}

      {pageError ? (
        <div className="savings-error-banner" role="alert">
          <span>{pageError}</span>
          <button type="button" onClick={loadData}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <GoalLoading />
      ) : (
        <>
          {enrichedGoals.length > 0 && (
            <section className="savings-overview-section">
              <div className="savings-section-heading">
                <div>
                  <p className="savings-eyebrow">YOUR PROGRESS</p>
                  <h2>Overview</h2>
                </div>
                <span className="savings-active-count">
                  {activeGoalCount} active{" "}
                  {activeGoalCount === 1 ? "goal" : "goals"}
                </span>
              </div>
              <div className="savings-overview-groups">
                {currencySummaries.map((summary) => (
                  <section
                    className="savings-currency-summary"
                    key={summary.currencyCode}
                    aria-label={`${summary.currencyCode} savings totals`}
                  >
                    <div className="savings-currency-heading">
                      <span className="savings-currency-chip">
                        {summary.currencyCode}
                      </span>
                      <span>Totals in {summary.currencyCode}</span>
                    </div>
                    <dl className="savings-summary-metrics">
                      <div>
                        <dt>Targeted</dt>
                        <dd>
                          {formatCurrency(
                            summary.target,
                            summary.currencyCode,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Saved</dt>
                        <dd>
                          {formatCurrency(
                            summary.saved,
                            summary.currencyCode,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Remaining</dt>
                        <dd>
                          {formatCurrency(
                            summary.remaining,
                            summary.currencyCode,
                          )}
                        </dd>
                      </div>
                    </dl>
                  </section>
                ))}
              </div>
            </section>
          )}

          {enrichedGoals.length === 0 ? (
            <section className="savings-empty-state">
              <span className="savings-empty-mark" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path
                    d="M8 16h32v21H8zM13 16v-3a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M24 21v11m-5.5-5.5h11"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <p className="savings-eyebrow">A GOAL OF YOUR OWN</p>
              <h2>Start with something you want to save for</h2>
              <p>
                Create a personal target and add contributions as you make
                progress. No sample goals are added.
              </p>
            </section>
          ) : (
            <section className="savings-goals-section">
              <div className="savings-section-heading">
                <div>
                  <p className="savings-eyebrow">KEEP MOVING FORWARD</p>
                  <h2>Your goals</h2>
                </div>
                <span className="savings-goal-count">
                  {enrichedGoals.length}{" "}
                  {enrichedGoals.length === 1 ? "goal" : "goals"}
                </span>
              </div>
              <div className="savings-goal-grid">
                {enrichedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onContribute={(item) => {
                      setContributingGoalId(item.id);
                      setSuccessMessage("");
                    }}
                    onHistory={(item) => setHistoryGoalId(item.id)}
                    onEdit={openEditForm}
                    onDelete={(item) => {
                      setGoalToDelete(item);
                      setGoalDeleteError("");
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="savings-tip" aria-labelledby="savings-tip-title">
            <span className="savings-tip-mark" aria-hidden="true">
              TIP
            </span>
            <div>
              <h2 id="savings-tip-title">Savings tip</h2>
              <p>{savingsTip}</p>
            </div>
          </section>
        </>
      )}

      {isGoalFormOpen && (
        <SavingsGoalForm
          key={editingGoal?.id || "new-savings-goal"}
          isOpen
          onClose={closeGoalForm}
          onSave={handleSaveGoal}
          goal={editingGoal || null}
          defaultCurrency={accountCurrency}
        />
      )}

      {contributingGoal && (
        <SavingsContributionForm
          key={contributingGoal.id}
          isOpen
          onClose={() => setContributingGoalId("")}
          onSave={handleSaveContribution}
          goal={contributingGoal}
          savedAmount={contributingGoal.savedAmount}
        />
      )}

      {historyGoal && (
        <SavingsContributionHistory
          key={historyGoal.id}
          isOpen
          onClose={() => setHistoryGoalId("")}
          onDelete={handleDeleteContribution}
          goal={historyGoal}
          contributions={goalContributionHistory}
          savedAmount={historyGoal.savedAmount}
        />
      )}

      <Modal
        isOpen={Boolean(goalToDelete)}
        onClose={() => {
          if (!isDeletingGoal) {
            setGoalToDelete(null);
            setGoalDeleteError("");
          }
        }}
        titleId="savings-delete-goal-title"
        className="savings-dialog"
        preventClose={isDeletingGoal}
      >
        <div className="savings-dialog-header">
          <div>
            <p className="savings-eyebrow">REMOVE SAVINGS PLAN</p>
            <h2 id="savings-delete-goal-title">Delete this goal?</h2>
          </div>
          <button
            type="button"
            className="savings-icon-button"
            aria-label="Close delete goal confirmation"
            onClick={() => {
              if (!isDeletingGoal) {
                setGoalToDelete(null);
                setGoalDeleteError("");
              }
            }}
            disabled={isDeletingGoal}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <p className="savings-delete-description">
          Delete <strong>{goalToDelete?.name}</strong> and its contribution
          history? This will not create, change or delete any transactions.
        </p>
        {goalDeleteError && (
          <p className="savings-form-error" role="alert">
            {goalDeleteError}
          </p>
        )}
        <div className="savings-dialog-actions">
          <button
            type="button"
            className="savings-button-secondary"
            onClick={() => {
              setGoalToDelete(null);
              setGoalDeleteError("");
            }}
            disabled={isDeletingGoal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="savings-button-danger"
            onClick={handleDeleteGoal}
            disabled={isDeletingGoal}
            aria-busy={isDeletingGoal}
          >
            {isDeletingGoal ? "Deleting..." : "Delete goal"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default SavingsGoals;

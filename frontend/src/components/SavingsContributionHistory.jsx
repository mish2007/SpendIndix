import { useRef, useState } from "react";
import Modal from "./Modal";
import { formatCurrency } from "../lib/currency";
import { getSavingsGoalErrorMessage } from "../lib/savingsGoals";

function formatContributionDate(value) {
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

function SavingsContributionHistory({
  isOpen,
  onClose,
  onDelete,
  goal,
  contributions,
  savedAmount,
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const deletingRef = useRef(false);

  const handleDelete = async (contributionId) => {
    if (deletingRef.current || deletingId) {
      return;
    }
    deletingRef.current = true;
    setDeletingId(contributionId);
    setError("");
    try {
      await onDelete(contributionId);
      setPendingDeleteId("");
    } catch (deleteError) {
      console.error("Could not delete savings contribution:", deleteError);
      setError(
        getSavingsGoalErrorMessage(
          deleteError,
          "We could not delete this contribution. Please try again.",
        ),
      );
    } finally {
      deletingRef.current = false;
      setDeletingId("");
    }
  };

  const titleId = "savings-contribution-history-title";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId={titleId}
      className="savings-dialog savings-history-dialog"
      preventClose={Boolean(deletingId)}
    >
      <div className="savings-dialog-header">
        <div>
          <p className="savings-eyebrow">SAVING ACTIVITY</p>
          <h2 id={titleId}>Contribution history</h2>
          <p className="savings-dialog-subtitle">{goal.name}</p>
        </div>
        <button
          type="button"
          className="savings-icon-button"
          aria-label="Close contribution history"
          onClick={onClose}
          disabled={Boolean(deletingId)}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <div className="savings-history-summary">
        <span>Saved so far</span>
        <strong>{formatCurrency(savedAmount, goal.currency_code)}</strong>
      </div>

      {Number(goal.initial_amount) > 0 && (
        <div className="savings-history-opening">
          <span>Initial amount saved</span>
          <strong>
            {formatCurrency(
              Number(goal.initial_amount),
              goal.currency_code,
            )}
          </strong>
        </div>
      )}

      {error && (
        <p className="savings-form-error" role="alert">
          {error}
        </p>
      )}

      {contributions.length === 0 ? (
        <p className="savings-history-empty">
          No contributions have been recorded for this goal yet.
        </p>
      ) : (
        <ul className="savings-contribution-list">
          {contributions.map((contribution) => (
            <li className="savings-contribution-row" key={contribution.id}>
              <div className="savings-contribution-details">
                <strong>
                  {formatCurrency(
                    Number(contribution.amount),
                    goal.currency_code,
                  )}
                </strong>
                <span>
                  {formatContributionDate(contribution.contribution_date)}
                </span>
                {contribution.note && <p>{contribution.note}</p>}
                {pendingDeleteId === contribution.id && (
                  <div
                    className="savings-contribution-confirm"
                    role="group"
                    aria-label="Confirm contribution deletion"
                  >
                    <span>
                      Delete this contribution? Saved progress will decrease.
                    </span>
                    <button
                      type="button"
                      className="savings-inline-danger"
                      onClick={() => handleDelete(contribution.id)}
                      disabled={Boolean(deletingId)}
                    >
                      {deletingId === contribution.id
                        ? "Deleting..."
                        : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      className="savings-inline-cancel"
                      onClick={() => {
                        setPendingDeleteId("");
                        setError("");
                      }}
                      disabled={Boolean(deletingId)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              {pendingDeleteId !== contribution.id && (
                <button
                  type="button"
                  className="savings-history-delete"
                  onClick={() => {
                    setPendingDeleteId(contribution.id);
                    setError("");
                  }}
                  disabled={Boolean(deletingId)}
                  aria-label={`Delete ${formatCurrency(
                    Number(contribution.amount),
                    goal.currency_code,
                  )} contribution from ${formatContributionDate(
                    contribution.contribution_date,
                  )}`}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default SavingsContributionHistory;

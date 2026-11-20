import { useRef, useState } from "react";
import Modal from "./Modal";
import {
  getCurrencyDecimalPlaces,
  formatCurrency,
  validateCurrencyAmount,
} from "../lib/currency";
import { getSavingsGoalErrorMessage } from "../lib/savingsGoals";

function isValidDate(value) {
  if (!value) {
    return true;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getCurrencySymbol(currencyCode) {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value || currencyCode
    );
  } catch {
    return currencyCode;
  }
}

function roundAmount(value, currencyCode) {
  const factor = 10 ** getCurrencyDecimalPlaces(currencyCode);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function SavingsContributionForm({
  isOpen,
  onClose,
  onSave,
  goal,
  savedAmount,
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const currencyCode = goal.currency_code;
  const currentSaved = roundAmount(Number(savedAmount), currencyCode);
  const contributionAmount = roundAmount(Number(amount), currencyCode);
  const resultingAmount = roundAmount(
    currentSaved + contributionAmount,
    currencyCode,
  );
  const decimalPlaces = getCurrencyDecimalPlaces(currencyCode);
  const targetAmount = roundAmount(
    Number(goal.target_amount),
    currencyCode,
  );
  const remaining = roundAmount(
    Math.max(targetAmount - currentSaved, 0),
    currencyCode,
  );
  const currencySymbol = getCurrencySymbol(currencyCode);

  const validate = () => {
    const nextErrors = {};
    const amountError = validateCurrencyAmount(amount, currencyCode);
    if (amountError) {
      nextErrors.amount = amountError;
    } else if (resultingAmount > targetAmount) {
      nextErrors.amount = `This goal has ${formatCurrency(remaining, currencyCode)} remaining.`;
    }
    if (!isValidDate(date)) {
      nextErrors.date = "Enter a valid calendar date.";
    }

    setErrors(nextErrors);
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (
      savingRef.current ||
      isSaving ||
      Object.keys(validate()).length > 0
    ) {
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setFormError("");
    try {
      await onSave({
        amount: contributionAmount,
        date,
        note,
      });
    } catch (error) {
      console.error("Could not save savings contribution:", error);
      setFormError(
        getSavingsGoalErrorMessage(
          error,
          "We could not save this contribution. Please try again.",
        ),
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const titleId = "savings-contribution-title";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId={titleId}
      className="savings-dialog"
      preventClose={isSaving}
    >
      <div className="savings-dialog-header">
        <div>
          <p className="savings-eyebrow">KEEP MAKING PROGRESS</p>
          <h2 id={titleId}>Add contribution</h2>
          <p className="savings-dialog-subtitle">{goal.name}</p>
        </div>
        <button
          type="button"
          className="savings-icon-button"
          aria-label="Close contribution form"
          onClick={onClose}
          disabled={isSaving}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <form className="savings-form" onSubmit={handleSubmit} noValidate>
        <div className="savings-contribution-preview">
          <div>
            <span>Current saved</span>
            <strong>{formatCurrency(currentSaved, currencyCode)}</strong>
          </div>
          <div>
            <span>After contribution</span>
            <strong>
              {formatCurrency(
                Number.isFinite(resultingAmount)
                  ? resultingAmount
                  : currentSaved,
                currencyCode,
              )}
            </strong>
          </div>
        </div>

        <div className="savings-field">
          <label htmlFor="savings-contribution-amount">
            Contribution amount ({currencyCode})
          </label>
          <div className="savings-amount-input">
            <span aria-hidden="true">{currencySymbol}</span>
            <input
              id="savings-contribution-amount"
              type="number"
              min="0"
              step={
                decimalPlaces === 0
                  ? "1"
                  : `0.${"0".repeat(Math.max(0, decimalPlaces - 1))}1`
              }
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setErrors((current) => ({ ...current, amount: "" }));
                setFormError("");
              }}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={
                errors.amount ? "savings-contribution-amount-error" : undefined
              }
              required
              disabled={isSaving}
              placeholder="0.00"
            />
          </div>
          {errors.amount && (
            <p
              className="savings-field-error"
              id="savings-contribution-amount-error"
            >
              {errors.amount}
            </p>
          )}
        </div>

        <div className="savings-field">
          <label htmlFor="savings-contribution-date">
            Contribution date <span>(optional)</span>
          </label>
          <input
            id="savings-contribution-date"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setErrors((current) => ({ ...current, date: "" }));
            }}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={
              errors.date ? "savings-contribution-date-error" : undefined
            }
            disabled={isSaving}
          />
          {errors.date && (
            <p
              className="savings-field-error"
              id="savings-contribution-date-error"
            >
              {errors.date}
            </p>
          )}
        </div>

        <div className="savings-field">
          <label htmlFor="savings-contribution-note">
            Note <span>(optional)</span>
          </label>
          <textarea
            id="savings-contribution-note"
            rows="2"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isSaving}
            placeholder="Add a short note"
          />
        </div>

        {formError && (
          <p className="savings-form-error" role="alert">
            {formError}
          </p>
        )}
        <div className="savings-dialog-actions">
          <button
            type="button"
            className="savings-button-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="savings-button-primary"
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? "Saving..." : "Save contribution"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default SavingsContributionForm;

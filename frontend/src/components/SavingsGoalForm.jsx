import { useRef, useState } from "react";
import Modal from "./Modal";
import {
  getCurrencyDecimalPlaces,
  validateCurrencyAmount,
} from "../lib/currency";
import { getSavingsGoalErrorMessage } from "../lib/savingsGoals";

function getInitialValues(goal) {
  return {
    name: goal?.name || "",
    targetAmount:
      goal?.target_amount === undefined ? "" : String(goal.target_amount),
    targetDate: goal?.target_date || "",
    description: goal?.description || "",
  };
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

function SavingsGoalForm({
  isOpen,
  onClose,
  onSave,
  goal,
  defaultCurrency,
}) {
  const [values, setValues] = useState(() => getInitialValues(goal));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const currencyCode = goal?.currency_code || defaultCurrency;
  const decimalPlaces = getCurrencyDecimalPlaces(currencyCode);
  const currencySymbol = getCurrencySymbol(currencyCode);

  const changeField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setFormError("");
  };

  const validate = () => {
    const nextErrors = {};
    if (!values.name.trim()) {
      nextErrors.name = "Enter a goal name.";
    }

    const targetError = validateCurrencyAmount(
      values.targetAmount,
      currencyCode,
    );
    if (targetError) {
      nextErrors.targetAmount = targetError;
    }

    const targetAmount = Number(values.targetAmount);
    const savedAmount = Number(goal?.savedAmount ?? goal?.initial_amount ?? 0);
    if (
      goal &&
      !nextErrors.targetAmount &&
      roundAmount(savedAmount, currencyCode) >
        roundAmount(targetAmount, currencyCode)
    ) {
      nextErrors.targetAmount =
        "The target cannot be lower than the amount already saved.";
    }
    if (!isValidDate(values.targetDate)) {
      nextErrors.targetDate = "Enter a valid calendar date.";
    }

    setErrors(nextErrors);
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingRef.current || isSaving) {
      return;
    }
    if (Object.keys(validate()).length > 0) {
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setFormError("");
    try {
      await onSave({
        name: values.name.trim(),
        targetAmount: Number(values.targetAmount),
        currencyCode,
        targetDate: values.targetDate,
        description: values.description,
      });
    } catch (error) {
      console.error("Could not save savings goal:", error);
      setFormError(
        getSavingsGoalErrorMessage(
          error,
          "We could not save this goal. Your entries are still here; please try again.",
        ),
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const titleId = "savings-goal-form-title";

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
          <p className="savings-eyebrow">
            {goal ? "REFINE YOUR PLAN" : "START SAVING"}
          </p>
          <h2 id={titleId}>{goal ? "Edit savings goal" : "Create a goal"}</h2>
        </div>
        <button
          type="button"
          className="savings-icon-button"
          aria-label="Close savings goal form"
          onClick={onClose}
          disabled={isSaving}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <form className="savings-form" onSubmit={handleSubmit} noValidate>
        <div className="savings-field">
          <label htmlFor="savings-goal-name">Goal name</label>
          <input
            id="savings-goal-name"
            value={values.name}
            onChange={(event) => changeField("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "savings-goal-name-error" : undefined}
            required
            disabled={isSaving}
            placeholder="e.g. Emergency fund"
          />
          {errors.name && (
            <p className="savings-field-error" id="savings-goal-name-error">
              {errors.name}
            </p>
          )}
        </div>

        <div className="savings-form-grid">
          <div className="savings-field">
            <label htmlFor="savings-goal-target">
              Target amount ({currencyCode})
            </label>
            <div className="savings-amount-input">
              <span aria-hidden="true">{currencySymbol}</span>
              <input
                id="savings-goal-target"
                type="number"
                min="0"
                step={
                  decimalPlaces === 0
                    ? "1"
                    : `0.${"0".repeat(Math.max(0, decimalPlaces - 1))}1`
                }
                inputMode="decimal"
                value={values.targetAmount}
                onChange={(event) =>
                  changeField("targetAmount", event.target.value)
                }
                aria-invalid={Boolean(errors.targetAmount)}
                aria-describedby={
                  errors.targetAmount ? "savings-goal-target-error" : undefined
                }
                required
                disabled={isSaving}
                placeholder="0.00"
              />
            </div>
            {errors.targetAmount && (
              <p
                className="savings-field-error"
                id="savings-goal-target-error"
              >
                {errors.targetAmount}
              </p>
            )}
          </div>

          <div className="savings-field">
            <label htmlFor="savings-goal-date">
              Target date <span>(optional)</span>
            </label>
            <input
              id="savings-goal-date"
              type="date"
              value={values.targetDate}
              onChange={(event) =>
                changeField("targetDate", event.target.value)
              }
              aria-invalid={Boolean(errors.targetDate)}
              aria-describedby={
                errors.targetDate ? "savings-goal-date-error" : undefined
              }
              disabled={isSaving}
            />
            {errors.targetDate && (
              <p className="savings-field-error" id="savings-goal-date-error">
                {errors.targetDate}
              </p>
            )}
          </div>
        </div>

        <div className="savings-field">
          <label htmlFor="savings-goal-description">
            Description <span>(optional)</span>
          </label>
          <textarea
            id="savings-goal-description"
            rows="3"
            value={values.description}
            onChange={(event) =>
              changeField("description", event.target.value)
            }
            disabled={isSaving}
            placeholder="What are you saving for?"
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
            {isSaving
              ? "Saving..."
              : goal
                ? "Update goal"
                : "Create goal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default SavingsGoalForm;

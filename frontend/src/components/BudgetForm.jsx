import { useMemo, useState } from "react";
import Modal from "./Modal";
import { validateCurrencyAmount } from "../lib/currency";
import { getBudgetErrorMessage } from "../lib/budgets";

function getInitialValues(budget) {
  return {
    categoryId: budget?.category_id || "",
    amount: budget?.amount === undefined ? "" : String(budget.amount),
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

function BudgetForm({
  isOpen,
  onClose,
  onSave,
  budget,
  monthLabel,
  monthStart,
  categories,
  existingBudgets,
  defaultCurrency,
}) {
  const [values, setValues] = useState(() => getInitialValues(budget));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories],
  );
  const formCurrency = budget?.currency_code || defaultCurrency;
  const currencySymbol = getCurrencySymbol(formCurrency);

  const changeField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setFormError("");
  };

  const validate = () => {
    const nextErrors = {};
    const amountError = validateCurrencyAmount(
      values.amount,
      formCurrency,
    );
    if (amountError) {
      nextErrors.amount = amountError;
    }

    const category = expenseCategories.find(
      (item) => item.id === values.categoryId,
    );
    if (!category) {
      nextErrors.categoryId = "Choose an expense category.";
    } else if (
      existingBudgets.some(
        (item) =>
          item.category_id === values.categoryId && item.id !== budget?.id,
      )
    ) {
      nextErrors.categoryId =
        "A budget already exists for this category and month.";
    }

    setErrors(nextErrors);
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving || Object.keys(validate()).length > 0) {
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await onSave({
        ...values,
        amount: Number(values.amount),
        monthStart,
        currencyCode: formCurrency,
      });
    } catch (error) {
      console.error("Could not save budget:", error);
      setFormError(
        getBudgetErrorMessage(
          error,
          "We could not save this budget. Your entries are still here; please try again.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const titleId = "budget-form-title";
  const currencyChanged =
    Boolean(budget) && formCurrency !== defaultCurrency;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId={titleId}
      className="budget-dialog"
      preventClose={isSaving}
    >
      <div className="budget-dialog-header">
        <div>
          <p className="budget-eyebrow">
            {budget ? "UPDATE YOUR PLAN" : "PLAN YOUR SPENDING"}
          </p>
          <h2 id={titleId}>{budget ? "Edit budget" : "Create budget"}</h2>
          <p className="budget-dialog-month">{monthLabel}</p>
        </div>
        <button
          type="button"
          className="budget-icon-button"
          aria-label="Close budget form"
          onClick={onClose}
          disabled={isSaving}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <form className="budget-form" onSubmit={handleSubmit} noValidate>
        <div className="budget-field">
          <label htmlFor="budget-category">Expense category</label>
          <select
            id="budget-category"
            value={values.categoryId}
            onChange={(event) =>
              changeField("categoryId", event.target.value)
            }
            className={errors.categoryId ? "has-error" : ""}
            aria-invalid={Boolean(errors.categoryId)}
            aria-describedby={
              errors.categoryId ? "budget-category-error" : undefined
            }
            disabled={isSaving}
            required
          >
            <option value="">Choose a category</option>
            {expenseCategories.map((category) => {
              const isUsed = existingBudgets.some(
                (item) =>
                  item.category_id === category.id &&
                  item.id !== budget?.id,
              );
              return (
                <option
                  key={category.id}
                  value={category.id}
                  disabled={isUsed}
                >
                  {category.name}
                  {isUsed ? " (budget already exists)" : ""}
                </option>
              );
            })}
          </select>
          {errors.categoryId && (
            <p className="budget-field-error" id="budget-category-error">
              {errors.categoryId}
            </p>
          )}
          {expenseCategories.length === 0 && (
            <p className="budget-field-hint">
              Add an expense category before creating a budget.
            </p>
          )}
        </div>

        <div className="budget-field">
          <label htmlFor="budget-amount">
            Monthly budget amount <span>({formCurrency})</span>
          </label>
          <div className="budget-amount-input">
            <span aria-hidden="true">{currencySymbol}</span>
            <input
              id="budget-amount"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={values.amount}
              onChange={(event) => changeField("amount", event.target.value)}
              className={errors.amount ? "has-error" : ""}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={
                errors.amount ? "budget-amount-error" : undefined
              }
              placeholder="0.00"
              required
              disabled={isSaving}
            />
          </div>
          {errors.amount && (
            <p className="budget-field-error" id="budget-amount-error">
              {errors.amount}
            </p>
          )}
        </div>

        <p className="budget-form-note">
          {currencyChanged
            ? `This existing budget remains in ${formCurrency}. Changing your account currency does not convert it.`
            : `New budgets use your account currency (${defaultCurrency}).`}
          {" "}Only expense transactions in the same category and currency count
          toward the limit. Other currencies are not converted.
        </p>
        {formError && (
          <p className="budget-form-error-banner" role="alert">
            {formError}
          </p>
        )}

        <div className="budget-dialog-actions">
          <button
            type="button"
            className="budget-button-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="budget-button-primary"
            disabled={isSaving || expenseCategories.length === 0}
            aria-busy={isSaving}
          >
            {isSaving
              ? "Saving..."
              : budget
                ? "Update budget"
                : "Save budget"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default BudgetForm;

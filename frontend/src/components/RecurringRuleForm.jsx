import { useMemo, useState } from "react";
import Modal from "./Modal";
import {
  getCurrencyDecimalPlaces,
  validateCurrencyAmount,
} from "../lib/currency";
import { getFinanceErrorMessage } from "../lib/transactions";

function getToday() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function getInitialValues(rule) {
  return {
    type: rule?.type || "expense",
    amount: rule?.amount === undefined ? "" : String(rule.amount),
    categoryId: rule?.category_id || "",
    description: rule?.description || "",
    frequency: rule?.frequency || "monthly",
    startDate: rule?.start_date || getToday(),
    endDate: rule?.end_date || "",
  };
}

function RecurringRuleForm({
  isOpen,
  onClose,
  onSave,
  categories,
  defaultCurrency,
  currencyIsFallback,
  rule,
}) {
  const [values, setValues] = useState(() =>
    getInitialValues(rule),
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const formCurrency = rule?.currency_code || defaultCurrency;
  const decimalPlaces = getCurrencyDecimalPlaces(formCurrency);

  const availableCategories = useMemo(
    () => categories.filter((category) => category.type === values.type),
    [categories, values.type],
  );

  const changeField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setFormError("");
  };

  const validate = () => {
    const nextErrors = {};
    const amountError = validateCurrencyAmount(values.amount, formCurrency);
    if (amountError) {
      nextErrors.amount = amountError;
    }
    if (
      !values.categoryId ||
      !availableCategories.some(
        (category) => category.id === values.categoryId,
      )
    ) {
      nextErrors.categoryId = "Choose a category for this recurring rule.";
    }
    if (!values.startDate) {
      nextErrors.startDate = "Choose a start date.";
    }
    if (
      values.endDate &&
      values.startDate &&
      values.endDate < values.startDate
    ) {
      nextErrors.endDate = "The end date must be on or after the start date.";
    }

    setErrors(nextErrors);
    return nextErrors;
  };

  const handleTypeChange = (type) => {
    setValues((current) => ({
      ...current,
      type,
      categoryId:
        categories.find(
          (category) =>
            category.id === current.categoryId && category.type === type,
        )?.id || "",
    }));
    setErrors((current) => ({ ...current, categoryId: "" }));
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
        currencyCode: formCurrency,
      });
    } catch (error) {
      console.error("Could not save recurring rule:", error);
      setFormError(
        getFinanceErrorMessage(
          error,
          "We could not save this recurring rule. Your entries are still here; please try again.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const titleId = "recurring-rule-form-title";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId={titleId}
      preventClose={isSaving}
    >
      <div className="finance-dialog-header">
        <div>
          <p className="eyebrow">
            {rule ? "UPDATE YOUR SCHEDULE" : "SET A SCHEDULE"}
          </p>
          <h2 id={titleId}>
            {rule ? "Edit recurring transaction" : "New recurring transaction"}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close recurring transaction form"
          onClick={onClose}
          disabled={isSaving}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <form className="finance-form" onSubmit={handleSubmit} noValidate>
        <fieldset className="transaction-type-fieldset">
          <legend>Transaction type</legend>
          <div className="transaction-type-options">
            {["expense", "income"].map((type) => (
              <button
                key={type}
                type="button"
                className={`transaction-type-choice is-${type}${
                  values.type === type ? " is-selected" : ""
                }`}
                aria-pressed={values.type === type}
                onClick={() => handleTypeChange(type)}
                disabled={isSaving}
              >
                {type === "income" ? "Income" : "Expense"}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="finance-form-grid">
          <div className="finance-field">
            <label htmlFor="recurring-amount">
              Amount <span className="field-hint">({formCurrency})</span>
            </label>
            <input
              id="recurring-amount"
              type="number"
              min="0"
              required
              step={
                decimalPlaces === 0
                  ? "1"
                  : `0.${"0".repeat(Math.max(0, decimalPlaces - 1))}1`
              }
              inputMode="decimal"
              value={values.amount}
              onChange={(event) => changeField("amount", event.target.value)}
              className={errors.amount ? "has-error" : ""}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? "recurring-amount-error" : undefined}
              placeholder="Enter amount"
              disabled={isSaving}
            />
            {errors.amount && (
              <p className="field-error" id="recurring-amount-error">
                {errors.amount}
              </p>
            )}
          </div>

          <div className="finance-field">
            <label htmlFor="recurring-category">Category</label>
            <select
              id="recurring-category"
              value={values.categoryId}
              required
              onChange={(event) => changeField("categoryId", event.target.value)}
              className={errors.categoryId ? "has-error" : ""}
              aria-invalid={Boolean(errors.categoryId)}
              aria-describedby={
                errors.categoryId ? "recurring-category-error" : undefined
              }
              disabled={isSaving}
            >
              <option value="">Choose a category</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="field-error" id="recurring-category-error">
                {errors.categoryId}
              </p>
            )}
          </div>

          <div className="finance-field">
            <label htmlFor="recurring-frequency">Frequency</label>
            <select
              id="recurring-frequency"
              value={values.frequency}
              onChange={(event) =>
                changeField("frequency", event.target.value)
              }
              disabled={isSaving}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div className="finance-field">
            <label htmlFor="recurring-start-date">Start date</label>
            <input
              id="recurring-start-date"
              type="date"
              value={values.startDate}
              required
              onChange={(event) =>
                changeField("startDate", event.target.value)
              }
              className={errors.startDate ? "has-error" : ""}
              aria-invalid={Boolean(errors.startDate)}
              aria-describedby={
                errors.startDate ? "recurring-start-error" : undefined
              }
              disabled={isSaving}
            />
            {errors.startDate && (
              <p className="field-error" id="recurring-start-error">
                {errors.startDate}
              </p>
            )}
          </div>

          <div className="finance-field">
            <label htmlFor="recurring-end-date">
              End date <span className="field-hint">(optional)</span>
            </label>
            <input
              id="recurring-end-date"
              type="date"
              value={values.endDate}
              onChange={(event) => changeField("endDate", event.target.value)}
              className={errors.endDate ? "has-error" : ""}
              aria-invalid={Boolean(errors.endDate)}
              aria-describedby={
                errors.endDate ? "recurring-end-error" : undefined
              }
              disabled={isSaving}
            />
            {errors.endDate && (
              <p className="field-error" id="recurring-end-error">
                {errors.endDate}
              </p>
            )}
          </div>

          <div className="finance-field finance-field-wide">
            <label htmlFor="recurring-description">
              Description <span className="field-hint">(optional)</span>
            </label>
            <textarea
              id="recurring-description"
              rows="2"
              value={values.description}
              onChange={(event) =>
                changeField("description", event.target.value)
              }
              placeholder="Add a note to help you recognize this transaction"
              disabled={isSaving}
            />
          </div>
        </div>

        <p className="form-note">
          Scheduled entries are not created automatically. Choose “Record due”
          when you are ready to add them to your transactions.
        </p>
        {rule && rule.currency_code !== defaultCurrency && (
          <p className="form-note">
            This schedule remains recorded in {formCurrency}. Saving it will
            not convert the amount.
          </p>
        )}
        {!rule && currencyIsFallback && (
          <p className="form-note">
            No valid currency preference was found, so this rule will use USD.
            No currency conversion is performed.
          </p>
        )}
        {formError && (
          <p className="form-error-banner" role="alert">
            {formError}
          </p>
        )}

        <div className="finance-dialog-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`button-primary is-${values.type}`}
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? "Saving..." : rule ? "Save changes" : "Save schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default RecurringRuleForm;

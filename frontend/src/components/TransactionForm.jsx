import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import {
  getCurrencyDecimalPlaces,
  validateCurrencyAmount,
} from "../lib/currency";
import { loadCurrencyOptions } from "../data/currencyData";
import {
  getFinanceErrorMessage,
  MAX_RECEIPT_BYTES,
  SUPPORTED_RECEIPT_TYPES,
} from "../lib/transactions";
import {
  scanReceipt,
  suggestReceiptCategoryId,
} from "../lib/receiptOcr";

const MAX_RECEIPT_PIXELS = 40000000;
const MAX_RECEIPT_DESCRIPTION_LENGTH = 160;

function getToday() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function getInitialValues(transaction, isReceiptFlow, defaultCurrency) {
  return {
    type: transaction?.type || "expense",
    amount:
      transaction?.amount === undefined ? "" : String(transaction.amount),
    currencyCode: transaction?.currency_code || defaultCurrency,
    categoryId: transaction?.category_id || "",
    date: transaction?.transaction_date || (isReceiptFlow ? "" : getToday()),
    description: transaction?.description || "",
  };
}

function loadReceiptPreview(file) {
  let previewUrl;
  try {
    previewUrl = URL.createObjectURL(file);
  } catch {
    return Promise.reject(
      new Error("This image could not be opened. Choose another image."),
    );
  }
  return new Promise((resolve, reject) => {
    try {
      const image = new Image();
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          URL.revokeObjectURL(previewUrl);
          reject(
            new Error(
              "This image could not be read. Choose another JPEG, PNG, or WebP image.",
            ),
          );
          return;
        }
        if (image.naturalWidth * image.naturalHeight > MAX_RECEIPT_PIXELS) {
          URL.revokeObjectURL(previewUrl);
          reject(
            new Error(
              "This image has too many pixels to process. Choose a smaller image.",
            ),
          );
          return;
        }
        resolve(previewUrl);
      };
      image.onerror = () => {
        URL.revokeObjectURL(previewUrl);
        reject(
          new Error(
            "This image is corrupted or unreadable. Choose another JPEG, PNG, or WebP image.",
          ),
        );
      };
      image.src = previewUrl;
    } catch {
      URL.revokeObjectURL(previewUrl);
      reject(
        new Error(
          "This image could not be opened. Choose another image.",
        ),
      );
    }
  });
}

function isValidDate(value) {
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

function hasUnsupportedControlCharacters(value) {
  return value.split("").some((character) => {
    const code = character.charCodeAt(0);
    return (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    );
  });
}

function TransactionForm({
  isOpen,
  onClose,
  onSave,
  categories,
  defaultCurrency,
  currencyIsFallback,
  transaction,
  isReceiptFlow = false,
}) {
  const [values, setValues] = useState(() =>
    getInitialValues(transaction, isReceiptFlow, defaultCurrency),
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isCancellingScan, setIsCancellingScan] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [scanNeedsManualEntry, setScanNeedsManualEntry] = useState(false);
  const [isValidatingReceipt, setIsValidatingReceipt] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [isCurrencyOptionsLoading, setIsCurrencyOptionsLoading] =
    useState(isReceiptFlow);
  const [currencyOptionsError, setCurrencyOptionsError] = useState("");
  const validationRequestId = useRef(0);
  const savingRef = useRef(false);
  const scanAbortController = useRef(null);
  const currencyOptionsPromise = useRef(null);
  const receiptHasBeenSelected = useRef(false);
  const amountInputRef = useRef(null);

  const availableCategories = useMemo(
    () => categories.filter((category) => category.type === values.type),
    [categories, values.type],
  );
  const formCurrency = values.currencyCode || defaultCurrency;
  const currencyChoices = useMemo(() => {
    const choices = [...currencyOptions];
    if (!choices.some((currency) => currency.code === formCurrency)) {
      choices.unshift({ code: formCurrency, name: "Current currency" });
    }
    return choices;
  }, [currencyOptions, formCurrency]);
  const decimalPlaces = getCurrencyDecimalPlaces(formCurrency);
  const [receiptPreview, setReceiptPreview] = useState("");
  const isReceiptBusy = isSaving || isScanning || isValidatingReceipt;

  useEffect(() => {
    return () => {
      if (receiptPreview) {
        URL.revokeObjectURL(receiptPreview);
      }
    };
  }, [receiptPreview]);

  useEffect(
    () => () => {
      validationRequestId.current += 1;
      scanAbortController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isReceiptFlow) {
      return undefined;
    }

    let isCurrent = true;
    const optionsPromise = loadCurrencyOptions();
    currencyOptionsPromise.current = optionsPromise;
    void optionsPromise
      .then((options) => {
        if (isCurrent) {
          setCurrencyOptions(options);
          setCurrencyOptionsError("");
        }
      })
      .catch((error) => {
        console.error("Could not load supported currencies:", error);
        if (isCurrent) {
          setCurrencyOptionsError(
            "Supported currencies could not be loaded. Your account currency is still available.",
          );
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsCurrencyOptionsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [isReceiptFlow]);

  const changeField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setFormError("");
  };

  const changeCurrency = (currencyCode) => {
    setValues((current) => ({ ...current, currencyCode }));
    setErrors((current) => ({
      ...current,
      currencyCode: "",
      amount: current.amount
        ? validateCurrencyAmount(current.amount, currencyCode)
        : "",
    }));
    setFormError("");
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
    setErrors((current) => ({ ...current, type: "", categoryId: "" }));
    setFormError("");
  };

  const handleReceiptChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const requestId = validationRequestId.current + 1;
    validationRequestId.current = requestId;
    setReceiptFile(null);
    setReceiptPreview("");
    if (isReceiptFlow) {
      setShowReviewForm(false);
    }
    setIsValidatingReceipt(true);
    setReceiptError("");
    setScanMessage("");
    setScanNeedsManualEntry(false);
    try {
      const fileType =
        typeof file.type === "string" ? file.type.toLowerCase() : "";
      if (!SUPPORTED_RECEIPT_TYPES.includes(fileType)) {
        throw new Error("Choose a JPEG, PNG, or WebP image.");
      }
      if (file.size === 0) {
        throw new Error("This file is empty. Choose another receipt image.");
      }
      if (file.size > MAX_RECEIPT_BYTES) {
        throw new Error("Receipt images must be 8 MB or smaller.");
      }

      const previewUrl = await loadReceiptPreview(file);
      if (validationRequestId.current !== requestId) {
        URL.revokeObjectURL(previewUrl);
        return;
      }
      setReceiptFile(file);
      setReceiptPreview(previewUrl);
      setRemoveExistingReceipt(false);
      const resetReview = isReceiptFlow && receiptHasBeenSelected.current;
      if (isReceiptFlow) {
        receiptHasBeenSelected.current = true;
      }
      if (resetReview) {
        setValues({
          type: "expense",
          amount: "",
          currencyCode: defaultCurrency,
          categoryId: "",
          date: "",
          description: "",
        });
        setErrors({});
        setFormError("");
      }
      void runReceiptScan(file, resetReview);
    } catch (error) {
      if (validationRequestId.current === requestId) {
        setReceiptError(
          error instanceof Error
            ? error.message
            : "This image could not be processed. Choose another image.",
        );
      }
    } finally {
      if (validationRequestId.current === requestId) {
        setIsValidatingReceipt(false);
      }
    }
  };

  const replaceReceipt = () => {
    validationRequestId.current += 1;
    setReceiptFile(null);
    setReceiptPreview("");
    setShowReviewForm(false);
    setValues({
      type: "expense",
      amount: "",
      currencyCode: defaultCurrency,
      categoryId: "",
      date: "",
      description: "",
    });
    setErrors({});
    setFormError("");
    setReceiptError("");
    setScanMessage("");
    setScanNeedsManualEntry(false);
    setRemoveExistingReceipt(false);
  };

  const runReceiptScan = async (file, resetReview = false) => {
    if (scanAbortController.current) {
      return;
    }
    if (!file) {
      setReceiptError("Choose a receipt image before scanning.");
      return;
    }

    const controller = new AbortController();
    scanAbortController.current = controller;
    setIsScanning(true);
    setIsCancellingScan(false);
    setScanProgress(0);
    setScanMessage("");
    setReceiptError("");
    setScanNeedsManualEntry(false);
    setErrors({});
    try {
      const scanCurrency = resetReview ? defaultCurrency : formCurrency;
      let supportedCurrencies = currencyChoices;
      if (currencyOptionsPromise.current) {
        try {
          supportedCurrencies = await currencyOptionsPromise.current;
        } catch {
          supportedCurrencies = currencyChoices;
        }
      }
      const { text, suggestions } = await scanReceipt(
        file,
        setScanProgress,
        scanCurrency,
        supportedCurrencies.map((currency) => currency.code),
        controller.signal,
      );
      setShowReviewForm(true);
      const meaningfulWords = text.match(/[A-Za-z]{2,}/g) || [];
      const hasReceiptCue =
        /\b(?:receipt|invoice|tax|total|subtotal|amount due|balance due|payment|cash|card|gst|vat)\b/i.test(
          text,
        );
      if (
        !(
          meaningfulWords.length >= 2 ||
          (hasReceiptCue && suggestions.amount !== null) ||
          (suggestions.amount !== null && suggestions.date)
        ) ||
        !(
          hasReceiptCue ||
          (suggestions.amount !== null && suggestions.date)
        )
      ) {
        setScanMessage(
          "Too little clear receipt-like text was found. Try another image or review and enter the details manually.",
        );
        setScanNeedsManualEntry(true);
        return;
      }

      const nextCurrency =
        suggestions.currencyCode &&
        supportedCurrencies.some(
          (currency) => currency.code === suggestions.currencyCode,
        )
          ? suggestions.currencyCode
          : resetReview
            ? defaultCurrency
            : formCurrency;
      const nextAmount =
        suggestions.amount === null
          ? resetReview
            ? ""
            : values.amount
          : String(suggestions.amount);
      const nextDate =
        suggestions.date || (resetReview ? "" : values.date);
      const nextDescription =
        suggestions.description || (resetReview ? "" : values.description);
      const nextType = resetReview ? "expense" : values.type;
      const nextCategoryId =
        nextType === "expense"
          ? suggestReceiptCategoryId(
              text,
              suggestions.description,
              categories.filter((category) => category.type === "expense"),
            )
          : "";
      const suggestedCategoryId =
        nextCategoryId || (resetReview ? "" : values.categoryId);
      setValues((current) => ({
        ...current,
        type: nextType,
        amount: nextAmount,
        currencyCode: nextCurrency,
        categoryId: suggestedCategoryId,
        date: nextDate,
        description: nextDescription,
      }));
      const missingDetails = [];
      if (suggestions.amount === null) {
        missingDetails.push(
          suggestions.amountStatus === "ambiguous"
            ? "a clear total because multiple amounts were found"
            : suggestions.amountStatus === "invalid-total"
              ? "a valid positive total"
              : "total amount",
        );
      } else if (suggestions.amountStatus === "single-candidate") {
        missingDetails.push(
          "confirmation of the amount (no labelled total was found)",
        );
      }
      if (!suggestions.date) {
        missingDetails.push(
          suggestions.dateStatus === "ambiguous"
            ? "an unambiguous date"
            : suggestions.dateStatus === "invalid"
              ? "a valid date because the detected date was impossible"
              : "date",
        );
      }
      if (!suggestions.description) {
        missingDetails.push("merchant/description");
      }
      if (!suggestions.currencyCode) {
        missingDetails.push(
          suggestions.currencyStatus === "ambiguous"
            ? "currency because the receipt markings were ambiguous"
            : `currency (currently ${scanCurrency})`,
        );
      }
      if (!suggestedCategoryId) {
        missingDetails.push("category");
      }
      setScanMessage(
        missingDetails.length
          ? `Review the suggestions. The scan could not clearly identify ${missingDetails.join(", ")}; enter or confirm those details before saving.`
          : "Review and correct the suggested details before saving.",
      );
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        setShowReviewForm(true);
        setScanNeedsManualEntry(true);
        setScanMessage(
          "Scan cancelled. You can try again or replace the image.",
        );
      } else {
        setShowReviewForm(true);
        setScanNeedsManualEntry(true);
        setScanMessage(
          "The scanner could not load or read this image. Try another image or enter the details manually.",
        );
      }
    } finally {
      if (scanAbortController.current === controller) {
        scanAbortController.current = null;
      }
      setIsScanning(false);
      setIsCancellingScan(false);
      setScanProgress(0);
    }
  };

  const handleScan = () => {
    setShowReviewForm(false);
    void runReceiptScan(receiptFile);
  };

  const enterDetailsManually = () => {
    setShowReviewForm(true);
    setScanNeedsManualEntry(false);
    setScanMessage("");
    setFormError("");
    amountInputRef.current?.focus();
  };

  const cancelScan = () => {
    if (!scanAbortController.current || isCancellingScan) {
      return;
    }
    setIsCancellingScan(true);
    scanAbortController.current.abort();
  };

  const getValidationErrors = () => {
    const nextErrors = {};

    if (!values.type) {
      nextErrors.type = "Choose income or expense.";
    }
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
      nextErrors.categoryId = "Choose a category for this transaction.";
    }
    if (!values.date) {
      nextErrors.date = "Choose a date.";
    } else if (!isValidDate(values.date)) {
      nextErrors.date = "Enter a valid calendar date.";
    }
    if (
      isReceiptFlow &&
      !currencyChoices.some((currency) => currency.code === formCurrency)
    ) {
      nextErrors.currencyCode = "Choose a supported currency.";
    }
    if (
      isReceiptFlow &&
      values.description.length > MAX_RECEIPT_DESCRIPTION_LENGTH
    ) {
      nextErrors.description = `Use ${MAX_RECEIPT_DESCRIPTION_LENGTH} characters or fewer.`;
    } else if (
      isReceiptFlow &&
      hasUnsupportedControlCharacters(values.description)
    ) {
      nextErrors.description = "Remove unsupported control characters.";
    }

    return nextErrors;
  };

  const validate = () => {
    const nextErrors = getValidationErrors();
    setErrors(nextErrors);
    return nextErrors;
  };
  const validateField = (field) => {
    const fieldError = getValidationErrors()[field] || "";
    setErrors((current) => ({ ...current, [field]: fieldError }));
  };
  const handleFieldBlur = (field) => {
    if (isReceiptFlow && showReviewForm) {
      validateField(field);
    }
  };
  const fieldErrors = errors;
  const reviewIsValid = Object.keys(getValidationErrors()).length === 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (
      savingRef.current ||
      isSaving ||
      isScanning ||
      isValidatingReceipt ||
      (isReceiptFlow && !showReviewForm) ||
      (isReceiptFlow && isCurrencyOptionsLoading)
    ) {
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
        values: {
          ...values,
          amount: Number(values.amount),
          currencyCode: formCurrency,
        },
        receiptFile: isReceiptFlow ? receiptFile : null,
        existingReceiptPath: transaction?.receipt_path || null,
        removeExistingReceipt,
      });
    } catch (error) {
      console.error("Could not save transaction:", error);
      setFormError(
        getFinanceErrorMessage(
          error,
          "We could not save this transaction. Your entries are still here; please try again.",
        ),
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const title = transaction
    ? "Edit transaction"
    : isReceiptFlow
      ? "Scan receipt"
      : "Add transaction";
  const titleId = "transaction-form-title";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId={titleId}
      preventClose={isSaving || isScanning || isValidatingReceipt}
    >
      <div className="finance-dialog-header">
        <div>
          <p className="eyebrow">
            {transaction ? "UPDATE YOUR RECORD" : "RECORD A TRANSACTION"}
          </p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close transaction form"
          onClick={onClose}
          disabled={isSaving || isScanning || isValidatingReceipt}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <form className="finance-form" onSubmit={handleSubmit} noValidate>
        {isReceiptFlow && receiptFile && receiptPreview && (
          <section
            className="receipt-field receipt-accepted-state"
            aria-labelledby="accepted-receipt-title"
          >
            <div className="receipt-review-preview">
              <div className="receipt-field-heading">
                <p className="eyebrow" id="accepted-receipt-title">
                  RECEIPT PREVIEW
                </p>
                {showReviewForm && !isScanning && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={replaceReceipt}
                    disabled={isSaving || isValidatingReceipt}
                  >
                    Replace receipt
                  </button>
                )}
              </div>
              <img
                className="receipt-preview"
                src={receiptPreview}
                alt="Receipt being reviewed"
              />
            </div>
            {isScanning && (
              <div className="receipt-scan-controls">
                <p className="receipt-scan-message" role="status">
                  Scanning receipt{scanProgress ? `: ${scanProgress}%` : "..."}
                </p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={cancelScan}
                  disabled={isCancellingScan}
                >
                  {isCancellingScan ? "Cancelling scan..." : "Cancel scan"}
                </button>
              </div>
            )}
            {showReviewForm && !isScanning && (
              <div className="receipt-scan-controls">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleScan}
                  disabled={
                    isSaving ||
                    isValidatingReceipt ||
                    isCurrencyOptionsLoading
                  }
                >
                  Scan this receipt again
                </button>
                <p className="receipt-privacy-note">
                  OCR runs in your browser and does not send the image to an
                  OCR service. It recognizes English text; blurry, rotated, or
                  non-English receipts may need manual entry. The scanner
                  needs internet access on first use. The image is saved to
                  your private account only when you save the transaction.
                </p>
                {scanMessage && (
                  <p className="receipt-scan-message" role="status">
                    {scanMessage}
                  </p>
                )}
                {scanNeedsManualEntry && (
                  <div className="receipt-manual-entry">
                    <span>
                      The scan could not provide a usable receipt summary.
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={enterDetailsManually}
                      disabled={isValidatingReceipt}
                    >
                      Enter details manually
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        {isReceiptFlow && showReviewForm && (
          <p className="receipt-review-intro">
            Review and correct the suggested details. Nothing is saved until
            you choose Save transaction.
          </p>
        )}
        {(!isReceiptFlow || showReviewForm) && (
          <>
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
                disabled={isSaving || isScanning || isValidatingReceipt}
              >
                {type === "income" ? "Income" : "Expense"}
              </button>
            ))}
          </div>
          {fieldErrors.type && (
            <p className="field-error">{fieldErrors.type}</p>
          )}
        </fieldset>

        <div className="finance-form-grid">
          <div className="finance-field">
            <label htmlFor="transaction-amount">
              Amount <span className="field-hint">({formCurrency})</span>
            </label>
            <input
              id="transaction-amount"
              ref={amountInputRef}
              type="number"
              min="0"
              required
              step={decimalPlaces === 0 ? "1" : `0.${"0".repeat(Math.max(0, decimalPlaces - 1))}1`}
              inputMode="decimal"
              value={values.amount}
              onChange={(event) => changeField("amount", event.target.value)}
              onBlur={() => handleFieldBlur("amount")}
              className={fieldErrors.amount ? "has-error" : ""}
              aria-invalid={Boolean(fieldErrors.amount)}
              aria-describedby={
                fieldErrors.amount ? "transaction-amount-error" : undefined
              }
              placeholder="Enter amount"
              disabled={isSaving || isScanning || isValidatingReceipt}
            />
            {fieldErrors.amount && (
              <p className="field-error" id="transaction-amount-error">
                {fieldErrors.amount}
              </p>
            )}
          </div>

          {isReceiptFlow && (
            <div className="finance-field">
              <label htmlFor="transaction-currency">Currency</label>
              <select
                id="transaction-currency"
                value={formCurrency}
                onChange={(event) => changeCurrency(event.target.value)}
                onBlur={() => handleFieldBlur("currencyCode")}
                className={fieldErrors.currencyCode ? "has-error" : ""}
                aria-invalid={Boolean(fieldErrors.currencyCode)}
                aria-describedby={
                  fieldErrors.currencyCode
                    ? "transaction-currency-error"
                    : currencyOptionsError
                      ? "transaction-currency-note"
                      : undefined
                }
                disabled={
                  isSaving ||
                  isScanning ||
                  isValidatingReceipt ||
                  isCurrencyOptionsLoading
                }
              >
                {currencyChoices.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </select>
              {fieldErrors.currencyCode && (
                <p className="field-error" id="transaction-currency-error">
                  {fieldErrors.currencyCode}
                </p>
              )}
              {currencyOptionsError && (
                <p
                  className="field-hint"
                  id="transaction-currency-note"
                  role="status"
                >
                  {currencyOptionsError}
                </p>
              )}
              {!isCurrencyOptionsLoading && !currencyOptionsError && (
                <p className="field-hint">
                  The account currency is selected by default. Change it if the
                  receipt shows another currency; no conversion is applied.
                </p>
              )}
            </div>
          )}

          <div className="finance-field">
            <label htmlFor="transaction-category">Category</label>
            <select
              id="transaction-category"
              value={values.categoryId}
              required
              onChange={(event) => changeField("categoryId", event.target.value)}
              onBlur={() => handleFieldBlur("categoryId")}
              className={fieldErrors.categoryId ? "has-error" : ""}
              aria-invalid={Boolean(fieldErrors.categoryId)}
              aria-describedby={
                fieldErrors.categoryId
                  ? "transaction-category-error"
                  : undefined
              }
              disabled={isSaving || isScanning || isValidatingReceipt}
            >
              <option value="">Choose a category</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId && (
              <p className="field-error" id="transaction-category-error">
                {fieldErrors.categoryId}
              </p>
            )}
            {availableCategories.length === 0 && (
              <p className="field-hint">
                Add a {values.type} category before saving.
              </p>
            )}
          </div>

          <div className="finance-field">
            <label htmlFor="transaction-date">Date</label>
            <input
              id="transaction-date"
              type="date"
              value={values.date}
              required
              onChange={(event) => changeField("date", event.target.value)}
              onBlur={() => handleFieldBlur("date")}
              className={fieldErrors.date ? "has-error" : ""}
              aria-invalid={Boolean(fieldErrors.date)}
              aria-describedby={
                fieldErrors.date ? "transaction-date-error" : undefined
              }
              disabled={isSaving || isScanning || isValidatingReceipt}
            />
            {fieldErrors.date && (
              <p className="field-error" id="transaction-date-error">
                {fieldErrors.date}
              </p>
            )}
          </div>

          <div className="finance-field finance-field-wide">
            <label htmlFor="transaction-description">
              Description <span className="field-hint">(optional)</span>
            </label>
            <textarea
              id="transaction-description"
              rows="2"
              value={values.description}
              maxLength={
                isReceiptFlow ? MAX_RECEIPT_DESCRIPTION_LENGTH : undefined
              }
              onChange={(event) =>
                changeField("description", event.target.value)
              }
              onBlur={() => handleFieldBlur("description")}
              className={fieldErrors.description ? "has-error" : ""}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={
                fieldErrors.description
                  ? "transaction-description-error"
                  : undefined
              }
              placeholder="Add a note to help you recognize this transaction"
              disabled={isSaving || isScanning || isValidatingReceipt}
            />
            {fieldErrors.description && (
              <p className="field-error" id="transaction-description-error">
                {fieldErrors.description}
              </p>
            )}
          </div>
        </div>
          </>
        )}

        {isReceiptFlow && !receiptFile && (
          <section className="receipt-field" aria-labelledby="receipt-title">
            <div className="receipt-field-heading">
              <div>
                <h3 id="receipt-title">Receipt image</h3>
                <p>
                  Select an image to scan it before reviewing transaction
                  details.
                </p>
              </div>
            </div>
            <div className="receipt-picker-options">
              <label
                className={`receipt-file-picker${isReceiptBusy ? " is-disabled" : ""}`}
                aria-disabled={isReceiptBusy}
              >
                <span>Upload receipt</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleReceiptChange}
                  onError={() =>
                    setReceiptError(
                      "The file picker could not open. Try again or use Take photo on a supported device.",
                    )
                  }
                  disabled={isSaving || isScanning || isValidatingReceipt}
                />
              </label>
              <label
                className={`receipt-file-picker${isReceiptBusy ? " is-disabled" : ""}`}
                aria-disabled={isReceiptBusy}
              >
                <span>Take photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleReceiptChange}
                  onError={() =>
                    setReceiptError(
                      "The camera could not open. Use Upload receipt to choose an existing image.",
                    )
                  }
                  disabled={isSaving || isScanning || isValidatingReceipt}
                />
              </label>
            </div>
            <p className="receipt-picker-note">
              Take photo opens the camera where supported. If it is unavailable,
              use Upload receipt to choose an image instead.
            </p>
            {isValidatingReceipt && (
              <p className="receipt-scan-message" role="status">
                Checking image...
              </p>
            )}
            {receiptError && (
              <p className="field-error" role="alert">
                {receiptError}
              </p>
            )}
          </section>
        )}

        {!isReceiptFlow && transaction?.receipt_path && (
          <section
            className="receipt-field"
            aria-labelledby="existing-transaction-receipt-title"
          >
            <div className="receipt-field-heading">
              <div>
                <h3 id="existing-transaction-receipt-title">
                  Receipt attachment
                </h3>
                <p>
                  The existing receipt stays attached unless you remove it.
                </p>
              </div>
            </div>
            <div className="attached-receipt">
              <span>
                {removeExistingReceipt
                  ? "Receipt will be removed when you save."
                  : "Receipt attached to this transaction"}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setRemoveExistingReceipt((current) => !current)
                }
                disabled={isSaving}
              >
                {removeExistingReceipt ? "Keep receipt" : "Remove receipt"}
              </button>
            </div>
          </section>
        )}

        {(!isReceiptFlow || showReviewForm) &&
          transaction &&
          transaction.currency_code !== defaultCurrency && (
          <p className="form-note">
            This transaction remains recorded in {formCurrency}. Saving it will
            not convert the amount.
          </p>
        )}
        {(!isReceiptFlow || showReviewForm) &&
          !transaction &&
          currencyIsFallback && (
          <p className="form-note">
            No valid currency preference was found, so USD is selected
            initially.
            {isReceiptFlow &&
              " Confirm or change the currency to match the receipt."} No
            currency conversion is performed.
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
            disabled={isSaving || isScanning || isValidatingReceipt}
          >
            Cancel
          </button>
          {(!isReceiptFlow || showReviewForm) && (
            <button
              type="submit"
              className={`button-primary is-${values.type}`}
              disabled={
                isSaving ||
                isScanning ||
                isValidatingReceipt ||
                (isReceiptFlow &&
                  (isCurrencyOptionsLoading || !reviewIsValid))
              }
              aria-busy={isSaving}
            >
              {isSaving
                ? "Saving..."
                : transaction
                  ? "Save changes"
                  : "Save transaction"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default TransactionForm;

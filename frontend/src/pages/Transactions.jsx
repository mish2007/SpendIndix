import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import CategoryManager from "../components/CategoryManager";
import Modal from "../components/Modal";
import RecurringRuleForm from "../components/RecurringRuleForm";
import TransactionForm from "../components/TransactionForm";
import { useAuth } from "../context/AuthContext";
import {
  deleteRecurringRule,
  deleteTransaction,
  getCategoryUsageCounts,
  getFinanceErrorMessage,
  getReceiptUrl,
  getTransactionSummary,
  listCategories,
  listDueRecurringOccurrences,
  listRecurringRules,
  listTransactions,
  recordDueRecurringTransactions,
  repairDueRecurringRuleSchedules,
  saveRecurringRule,
  saveTransaction,
  setRecurringRuleActive,
  TRANSACTION_PAGE_SIZE,
} from "../lib/transactions";
import { formatCurrency, getCurrencySettings } from "../lib/currency";
import "./Transactions.css";

const SUMMARY_PERIODS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "all_time", label: "All time" },
];

function toLocalDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getSummaryDateRange(period) {
  const today = new Date();
  if (period === "all_time") {
    return { fromDate: null, toDate: null };
  }
  if (period === "this_year") {
    return {
      fromDate: `${today.getFullYear()}-01-01`,
      toDate: toLocalDateString(today),
    };
  }
  if (period === "last_month") {
    const firstOfThisMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    );
    const lastOfLastMonth = new Date(
      firstOfThisMonth.getFullYear(),
      firstOfThisMonth.getMonth(),
      0,
    );
    return {
      fromDate: `${lastOfLastMonth.getFullYear()}-${String(
        lastOfLastMonth.getMonth() + 1,
      ).padStart(2, "0")}-01`,
      toDate: toLocalDateString(lastOfLastMonth),
    };
  }

  return {
    fromDate: `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}-01`,
    toDate: toLocalDateString(today),
  };
}

function formatTransactionDate(value) {
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

function getSummaryByCurrency(rows) {
  const amounts = new Map();
  rows.forEach((row) => {
    const current = amounts.get(row.currencyCode) || {
      income: 0,
      expense: 0,
    };
    current[row.type] = row.amount;
    amounts.set(row.currencyCode, current);
  });
  return [...amounts.entries()].map(([currencyCode, values]) => ({
    currencyCode,
    income: values.income,
    expense: values.expense,
    net: values.income - values.expense,
  }));
}

function SummaryCard({ label, summary, kind }) {
  return (
    <article className={`finance-summary-card is-${kind}`}>
      <p className="finance-summary-label">{label}</p>
      {summary.length ? (
        <ul className="finance-summary-values">
          {summary.map((item) => (
            <li key={item.currencyCode}>
              <span>{item.currencyCode}</span>
              <strong>{formatCurrency(item[kind], item.currencyCode)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="finance-summary-empty">No activity in this period</p>
      )}
    </article>
  );
}

function TransactionList({
  transactions,
  isLoading,
  hasFilters,
  onEdit,
  onDelete,
  onViewReceipt,
  onAdd,
  onClearFilters,
  deletingId,
}) {
  if (isLoading) {
    return (
      <div className="transaction-list-state" role="status" aria-live="polite">
        Loading transactions...
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="transaction-list-state">
        <h3>{hasFilters ? "No matching transactions" : "No transactions yet"}</h3>
        <p>
          {hasFilters
            ? "Try changing the search or filters to find what you are looking for."
            : "Your saved income and expenses will appear here. Nothing is pre-filled with sample data."}
        </p>
        {hasFilters ? (
          <button
            type="button"
            className="button-secondary transaction-empty-action"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        ) : (
          <button
            type="button"
            className="button-primary transaction-empty-action"
            onClick={onAdd}
          >
            Add your first transaction
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="transaction-list" aria-label="Transactions">
      {transactions.map((transaction) => {
        const description = transaction.description?.trim();
        const deleting = deletingId === transaction.id;

        return (
          <li className="transaction-list-item" key={transaction.id}>
            <div className="transaction-main">
              <div
                className={`transaction-kind-mark is-${transaction.type}`}
                aria-hidden="true"
              >
                {transaction.type === "income" ? "+" : "-"}
              </div>
              <div className="transaction-title-block">
                <h3 className="transaction-category-heading">
                  <span className="transaction-category-title">
                    {transaction.category_name}
                  </span>
                </h3>
                <p>
                  {description && (
                    <>
                      <span className="transaction-description">
                        {description}
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{formatTransactionDate(transaction.transaction_date)}</span>
                  <span
                    className={`transaction-type-tag is-${transaction.type}`}
                  >
                    {transaction.type}
                  </span>
                  {transaction.recurring_rule_id && (
                    <span className="transaction-recurring-tag">Recurring</span>
                  )}
                </p>
              </div>
            </div>
            <div
              className={`transaction-amount is-${transaction.type}`}
              aria-label={`${transaction.type} ${formatCurrency(
                transaction.amount,
                transaction.currency_code,
              )}`}
            >
              {transaction.type === "income" ? "+" : "-"}
              {formatCurrency(transaction.amount, transaction.currency_code)}
            </div>
            <div className="transaction-actions">
              {transaction.receipt_path && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onViewReceipt(transaction)}
                >
                  Receipt
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => onEdit(transaction)}
                disabled={deleting}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-button is-danger"
                onClick={() => onDelete(transaction)}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RecurringList({
  rules,
  dueOccurrences,
  categories,
  isLoading,
  onEdit,
  onToggle,
  onDelete,
  onRecord,
  busyId,
}) {
  if (isLoading) {
    return (
      <div className="transaction-list-state" role="status" aria-live="polite">
        Loading recurring schedules...
      </div>
    );
  }

  if (!rules.length) {
    return (
      <div className="transaction-list-state">
        <h3>No recurring schedules yet</h3>
        <p>
          Add a schedule to keep track of regular income or expenses. Entries
          are added only when you choose to record them.
        </p>
      </div>
    );
  }

  const occurrencesByRule = new Map();
  dueOccurrences.forEach((occurrence) => {
    const occurrences = occurrencesByRule.get(occurrence.ruleId) || [];
    occurrences.push(occurrence);
    occurrencesByRule.set(occurrence.ruleId, occurrences);
  });

  return (
    <ul className="recurring-list" aria-label="Recurring transactions">
      {rules.map((rule) => {
        const category = categories.find((item) => item.id === rule.category_id);
        const occurrences = occurrencesByRule.get(rule.id) || [];
        const due = rule.active && occurrences.length > 0;
        const paused = Boolean(rule.paused);
        const noFutureOccurrence =
          rule.end_date && rule.next_due_date > rule.end_date;
        const expired =
          !rule.active && (!paused || Boolean(noFutureOccurrence));
        const isPaused = paused && !expired;
        const status = expired
          ? "expired"
          : isPaused
            ? "paused"
            : due
              ? "due"
              : "active";
        const nextDateLabel = expired
          ? null
          : rule.active
            ? due
              ? `Due since ${formatTransactionDate(rule.next_due_date)}`
              : `Next ${formatTransactionDate(rule.next_due_date)}`
            : isPaused
              ? `Next due ${formatTransactionDate(rule.next_due_date)}`
              : "Inactive";
        const pending = busyId === rule.id || busyId === "all";
        return (
          <li className="recurring-list-item" key={rule.id}>
            <div className="recurring-rule-main">
              <div
                className={`transaction-kind-mark is-${rule.type}`}
                aria-hidden="true"
              >
                {rule.type === "income" ? "+" : "-"}
              </div>
              <div>
                <h3>{rule.description?.trim() || category?.name || "Transaction"}</h3>
                <p>
                  <span>{category?.name || "Category unavailable"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{rule.frequency}</span>
                  <span aria-hidden="true">·</span>
                  <span className={`recurring-status is-${status}`}>
                    {status}
                  </span>
                  {nextDateLabel && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{nextDateLabel}</span>
                    </>
                  )}
                </p>
                {rule.end_date && (
                  <p className="recurring-end-date">
                    {expired ? "Ended" : "Ends"}{" "}
                    {formatTransactionDate(rule.end_date)}
                  </p>
                )}
              </div>
            </div>
            <strong
              className={`transaction-amount is-${rule.type}`}
              aria-label={`${rule.type} ${formatCurrency(
                rule.amount,
                rule.currency_code,
              )}`}
            >
              {rule.type === "income" ? "+" : "-"}
              {formatCurrency(rule.amount, rule.currency_code)}
            </strong>
            <div className="transaction-actions">
              {due && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onRecord(occurrences)}
                  disabled={pending}
                >
                  {occurrences.length === 1
                    ? "Record due"
                    : `Record due (${occurrences.length})`}
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => onEdit(rule)}
                disabled={pending}
              >
                Edit
              </button>
              {(rule.active || isPaused) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onToggle(rule)}
                  disabled={pending}
                >
                  {pending ? "Updating..." : rule.active ? "Pause" : "Resume"}
                </button>
              )}
              <button
                type="button"
                className="text-button is-danger"
                onClick={() => onDelete(rule)}
                disabled={pending}
              >
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TransactionsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currencySettings = useMemo(() => getCurrencySettings(user), [user]);
  const [activeTab, setActiveTab] = useState("transactions");
  const [transactionForm, setTransactionForm] = useState(() =>
    searchParams.get("new") === "1"
      ? { transaction: null, isReceiptFlow: false }
      : null,
  );
  const [recurringForm, setRecurringForm] = useState(null);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [receiptViewer, setReceiptViewer] = useState(null);
  const [notice, setNotice] = useState("");
  const [pageError, setPageError] = useState("");
  const [categories, setCategories] = useState([]);
  const [usageCounts, setUsageCounts] = useState(new Map());
  const [categoryRefreshKey, setCategoryRefreshKey] = useState(0);
  const [loadedCategoryKey, setLoadedCategoryKey] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [transactionsRefreshKey, setTransactionsRefreshKey] = useState(0);
  const [loadedTransactionsKey, setLoadedTransactionsKey] = useState("");
  const [summary, setSummary] = useState([]);
  const [summaryPeriod, setSummaryPeriod] = useState("this_month");
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const [loadedSummaryKey, setLoadedSummaryKey] = useState("");
  const [rules, setRules] = useState([]);
  const [dueOccurrences, setDueOccurrences] = useState([]);
  const [rulesRefreshKey, setRulesRefreshKey] = useState(0);
  const [loadedRulesKey, setLoadedRulesKey] = useState("");
  const [busyRuleId, setBusyRuleId] = useState("");
  const [deletingTransactionId, setDeletingTransactionId] = useState("");
  const [recordingDue, setRecordingDue] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [page, setPage] = useState(0);
  const transactionRequestId = useRef(0);
  const categoryRequestId = useRef(0);
  const summaryRequestId = useRef(0);
  const rulesRequestId = useRef(0);

  const categoryLoading = loadedCategoryKey !== categoryRefreshKey;
  const transactionQueryKey = JSON.stringify([
    search,
    typeFilter,
    categoryFilter,
    fromDate,
    toDate,
    sort,
    page,
    transactionsRefreshKey,
  ]);
  const transactionsLoading = loadedTransactionsKey !== transactionQueryKey;
  const summaryQueryKey = `${summaryPeriod}:${summaryRefreshKey}`;
  const summaryLoading = loadedSummaryKey !== summaryQueryKey;
  const rulesQueryKey = `${activeTab}:${rulesRefreshKey}`;
  const rulesLoading =
    activeTab === "recurring" && loadedRulesKey !== rulesQueryKey;

  useEffect(() => {
    const requestId = categoryRequestId.current + 1;
    categoryRequestId.current = requestId;
    void Promise.all([listCategories(), getCategoryUsageCounts()])
      .then(([nextCategories, nextCounts]) => {
        if (categoryRequestId.current === requestId) {
          setCategories(nextCategories);
          setUsageCounts(nextCounts);
        }
      })
      .catch((error) => {
        console.error("Could not load categories:", error);
        if (categoryRequestId.current === requestId) {
          setPageError(
            getFinanceErrorMessage(
              error,
              "We could not load your categories. Please try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (categoryRequestId.current === requestId) {
          setLoadedCategoryKey(categoryRefreshKey);
        }
      });
  }, [categoryRefreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const requestId = transactionRequestId.current + 1;
    transactionRequestId.current = requestId;

    void listTransactions({
      search,
      type: typeFilter,
      categoryId: categoryFilter,
      fromDate,
      toDate,
      sort,
      page,
    })
      .then((result) => {
        if (transactionRequestId.current === requestId) {
        if (page > 0 && result.transactions.length === 0) {
          setPage((current) =>
            current === page ? Math.max(0, current - 1) : current,
          );
          return;
        }
          setTransactions(result.transactions);
          setTotalCount(result.totalCount);
          setLoadedTransactionsKey(transactionQueryKey);
        }
      })
      .catch((error) => {
        console.error("Could not load transactions:", error);
        if (transactionRequestId.current === requestId) {
          setPageError(
            getFinanceErrorMessage(
              error,
              "We could not load your transactions. Check your connection and try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (transactionRequestId.current === requestId) {
          setLoadedTransactionsKey(transactionQueryKey);
        }
      });
  }, [
    search,
    typeFilter,
    categoryFilter,
    fromDate,
    toDate,
    sort,
    page,
    transactionsRefreshKey,
    transactionQueryKey,
  ]);

  useEffect(() => {
    const requestId = summaryRequestId.current + 1;
    summaryRequestId.current = requestId;
    const range = getSummaryDateRange(summaryPeriod);

    void getTransactionSummary(range.fromDate, range.toDate)
      .then((result) => {
        if (summaryRequestId.current === requestId) {
          setSummary(result);
          setLoadedSummaryKey(summaryQueryKey);
        }
      })
      .catch((error) => {
        console.error("Could not load transaction summary:", error);
        if (summaryRequestId.current === requestId) {
          setPageError(
            getFinanceErrorMessage(
              error,
              "We could not load your financial summary. Please try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (summaryRequestId.current === requestId) {
          setLoadedSummaryKey(summaryQueryKey);
        }
      });
  }, [summaryPeriod, summaryRefreshKey, summaryQueryKey]);

  useEffect(() => {
    if (activeTab !== "recurring") {
      return undefined;
    }
    const requestId = rulesRequestId.current + 1;
    rulesRequestId.current = requestId;

    void repairDueRecurringRuleSchedules()
      .then(() =>
        Promise.all([
          listRecurringRules(),
          listDueRecurringOccurrences(),
        ]),
      )
      .then(([result, nextDueOccurrences]) => {
        if (rulesRequestId.current === requestId) {
          setRules(result);
          setDueOccurrences(nextDueOccurrences);
          setLoadedRulesKey(rulesQueryKey);
        }
      })
      .catch((error) => {
        console.error("Could not load recurring rules:", error);
        if (rulesRequestId.current === requestId) {
          setPageError(
            getFinanceErrorMessage(
              error,
              "We could not load your recurring schedules. Please try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (rulesRequestId.current === requestId) {
          setLoadedRulesKey(rulesQueryKey);
        }
      });
    return undefined;
  }, [activeTab, rulesRefreshKey, rulesQueryKey]);

  useEffect(() => {
    const handleTransactionChange = () => {
      setTransactionsRefreshKey((current) => current + 1);
      setSummaryRefreshKey((current) => current + 1);
      setCategoryRefreshKey((current) => current + 1);
    };
    window.addEventListener(
      "spendindix:transactions-changed",
      handleTransactionChange,
    );
    return () =>
      window.removeEventListener(
        "spendindix:transactions-changed",
        handleTransactionChange,
      );
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("new");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const summaryByCurrency = useMemo(
    () => getSummaryByCurrency(summary),
    [summary],
  );
  const hasFilters = Boolean(
    searchInput.trim() ||
      search ||
      typeFilter ||
      categoryFilter ||
      fromDate ||
      toDate,
  );
  const pageCount = Math.max(1, Math.ceil(totalCount / TRANSACTION_PAGE_SIZE));
  const canGoToPreviousPage = page > 0 && !transactionsLoading;
  const canGoToNextPage = page < pageCount - 1 && !transactionsLoading;
  const firstResult = totalCount === 0 ? 0 : page * TRANSACTION_PAGE_SIZE + 1;
  const lastResult = Math.min(
    (page + 1) * TRANSACTION_PAGE_SIZE,
    totalCount,
  );

  const refreshAfterTransactionChange = () => {
    if (activeTab === "recurring") {
      setRulesRefreshKey((current) => current + 1);
    }
    window.dispatchEvent(new Event("spendindix:transactions-changed"));
  };

  const handleSaveTransaction = async ({
    values,
    receiptFile,
    existingReceiptPath,
    removeExistingReceipt,
  }) => {
    const result = await saveTransaction({
      userId: user.id,
      transactionId: transactionForm?.transaction?.id,
      values,
      existingReceiptPath,
      receiptFile,
      removeExistingReceipt,
    });
    setTransactionForm(null);
    setNotice(
      result.cleanupWarning || "Transaction saved successfully.",
    );
    setPageError("");
    refreshAfterTransactionChange();
  };

  const handleDeleteTransaction = (transaction) => {
    setConfirmation({ kind: "delete-transaction", transaction });
    setConfirmationError("");
    setPageError("");
    setNotice("");
  };

  const handleSaveRecurringRule = async (values) => {
    await saveRecurringRule(
      recurringForm?.rule?.id || null,
      values,
    );
    setRecurringForm(null);
    setNotice("Recurring schedule saved.");
    setPageError("");
    setRulesRefreshKey((current) => current + 1);
    setCategoryRefreshKey((current) => current + 1);
  };

  const handleToggleRule = async (rule) => {
    setBusyRuleId(rule.id);
    setPageError("");
    try {
      const updatedRule = await setRecurringRuleActive(rule.id, !rule.active);
      setNotice(
        updatedRule.active
          ? "Recurring schedule resumed."
          : rule.active
            ? "Recurring schedule paused."
            : "This schedule has reached its end date and cannot be resumed.",
      );
      setRulesRefreshKey((current) => current + 1);
    } catch (error) {
      console.error("Could not update recurring rule:", error);
      setPageError(
        getFinanceErrorMessage(
          error,
          "We could not update this schedule. Please try again.",
        ),
      );
    } finally {
      setBusyRuleId("");
    }
  };

  const handleDeleteRule = (rule) => {
    setConfirmation({ kind: "delete-rule", rule });
    setConfirmationError("");
    setPageError("");
    setNotice("");
  };

  const handleRecordDue = (occurrences, scope = "individual") => {
    if (!occurrences?.length) {
      setPageError("");
      setNotice(
        "There are no due occurrences to record. The schedule list is up to date.",
      );
      return;
    }

    setConfirmation({
      kind: scope === "all" ? "record-all" : "record-individual",
      occurrences,
    });
    setConfirmationError("");
    setPageError("");
    setNotice("");
  };

  const handleConfirmAction = async () => {
    if (!confirmation || isConfirming) {
      return;
    }

    const action = confirmation;
    setIsConfirming(true);
    setConfirmationError("");
    setPageError("");
    setNotice("");

    try {
      if (action.kind === "delete-transaction") {
        setDeletingTransactionId(action.transaction.id);
        const cleanupWarning = await deleteTransaction(action.transaction);
        setNotice(cleanupWarning || "Transaction deleted.");
        if (transactions.length === 1 && page > 0) {
          setPage((current) => current - 1);
        }
        refreshAfterTransactionChange();
      } else if (action.kind === "delete-rule") {
        setBusyRuleId(action.rule.id);
        await deleteRecurringRule(action.rule.id);
        setNotice("Recurring schedule deleted. Recorded transactions remain.");
        setRulesRefreshKey((current) => current + 1);
        setCategoryRefreshKey((current) => current + 1);
      } else {
        setRecordingDue(true);
        const recordedCount = await recordDueRecurringTransactions(
          action.occurrences,
        );
        const requestedCount = action.occurrences.length;
        if (recordedCount === requestedCount) {
          setNotice(
            `${recordedCount} recurring ${
              recordedCount === 1 ? "transaction was" : "transactions were"
            } added.`,
          );
        } else {
          const alreadyRecordedCount = requestedCount - recordedCount;
          setNotice(
            recordedCount === 0
              ? `No new transactions were added; all ${alreadyRecordedCount} selected occurrences were already recorded. The schedule was refreshed.`
              : `Added ${recordedCount} of ${requestedCount} selected occurrences as new transactions; ${alreadyRecordedCount} were already recorded. The schedule was refreshed.`,
          );
        }
        refreshAfterTransactionChange();
      }

      setConfirmation(null);
    } catch (error) {
      console.error("Could not complete the confirmed finance action:", error);
      const errorMessage = getFinanceErrorMessage(
        error,
        action.kind === "delete-transaction"
          ? "We could not delete this transaction. Please try again."
          : action.kind === "delete-rule"
            ? "We could not delete this schedule. Please try again."
            : "We could not record the selected occurrences. Refresh the schedule and try again.",
      );
      if (action.kind === "delete-transaction" || action.kind === "delete-rule") {
        setConfirmationError(errorMessage);
      } else {
        setConfirmation(null);
        setPageError(errorMessage);
      }
      if (
        action.kind === "record-individual" ||
        action.kind === "record-all"
      ) {
        setRulesRefreshKey((current) => current + 1);
      }
    } finally {
      setDeletingTransactionId("");
      setBusyRuleId("");
      setRecordingDue(false);
      setIsConfirming(false);
    }
  };

  const handleViewReceipt = async (transaction) => {
    setPageError("");
    try {
      const url = await getReceiptUrl(transaction.receipt_path);
      setReceiptViewer({
        url,
        title: transaction.description?.trim() || transaction.category_name,
      });
    } catch (error) {
      console.error("Could not open receipt:", error);
      setPageError(
        getFinanceErrorMessage(
          error,
          "We could not open this receipt. Please try again.",
        ),
      );
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setTypeFilter("");
    setCategoryFilter("");
    setFromDate("");
    setToDate("");
    setSort("date_desc");
    setPage(0);
  };

  const dueOccurrenceCount = dueOccurrences.length;
  const isRecordConfirmation =
    confirmation?.kind === "record-individual" ||
    confirmation?.kind === "record-all";
  const confirmedOccurrences = confirmation?.occurrences || [];
  const confirmationTitle =
    confirmation?.kind === "delete-transaction"
      ? "Delete transaction?"
      : confirmation?.kind === "delete-rule"
        ? "Delete recurring schedule?"
        : confirmation?.kind === "record-all"
          ? "Record all due transactions?"
          : confirmedOccurrences.length > 1
            ? "Record due transactions?"
            : "Record this transaction?";
  const confirmationActionLabel =
    confirmation?.kind === "delete-transaction" ||
    confirmation?.kind === "delete-rule"
      ? "Delete"
      : confirmation?.kind === "record-all"
        ? "Record all"
        : confirmedOccurrences.length > 1
          ? `Record ${confirmedOccurrences.length} transactions`
          : "Record transaction";

  return (
    <AppShell pageTitle="Transactions">
      <div className="transactions-page">
        <header className="transactions-page-header">
          <div>
            <p className="eyebrow">YOUR MONEY, CLEARLY</p>
            <h1>Transactions</h1>
            <p className="dashboard-page-subtitle">
              Every financial detail, in one place.
            </p>
          </div>
          <div className="transactions-header-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() =>
                setTransactionForm({
                  transaction: null,
                  isReceiptFlow: true,
                })
              }
            >
              Scan receipt
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() =>
                setTransactionForm({
                  transaction: null,
                  isReceiptFlow: false,
                })
              }
            >
              Add transaction
            </button>
          </div>
        </header>

        {pageError && (
          <div className="finance-alert is-error" role="alert">
            <span>{pageError}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setPageError("");
                setTransactionsRefreshKey((current) => current + 1);
                setSummaryRefreshKey((current) => current + 1);
                setCategoryRefreshKey((current) => current + 1);
                if (activeTab === "recurring") {
                  setRulesRefreshKey((current) => current + 1);
                }
              }}
            >
              Try again
            </button>
          </div>
        )}
        {notice && (
          <div className="finance-alert is-success" role="status">
            <span>{notice}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        )}

        <section
          className="transactions-summary-section"
          aria-labelledby="transactions-summary-heading"
        >
          <div className="section-heading-row">
            <div>
              <h2 id="transactions-summary-heading">Your activity</h2>
              <p>
                Totals use{" "}
                {SUMMARY_PERIODS.find((item) => item.value === summaryPeriod)?.label.toLowerCase()}.
                Date filters below affect the list only; values stay in their
                recorded currencies.
              </p>
            </div>
            <label className="period-select">
              <span className="visually-hidden">Summary period</span>
              <select
                value={summaryPeriod}
                onChange={(event) => setSummaryPeriod(event.target.value)}
                aria-label="Summary period"
              >
                {SUMMARY_PERIODS.map((period) => (
                  <option value={period.value} key={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {summaryLoading ? (
            <div className="summary-loading" role="status">
              Updating your summary...
            </div>
          ) : (
            <div className="finance-summary-grid">
              <SummaryCard
                label="Income"
                summary={summaryByCurrency}
                kind="income"
              />
              <SummaryCard
                label="Expenses"
                summary={summaryByCurrency}
                kind="expense"
              />
              <SummaryCard
                label="Net cash flow"
                summary={summaryByCurrency}
                kind="net"
              />
            </div>
          )}
        </section>

        <section className="transactions-workspace">
          <div className="transactions-tabs-row">
            <div className="transactions-tabs" role="tablist" aria-label="Transaction views">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "transactions"}
                className={activeTab === "transactions" ? "is-active" : ""}
                onClick={() => setActiveTab("transactions")}
              >
                Transactions
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "recurring"}
                className={activeTab === "recurring" ? "is-active" : ""}
                onClick={() => setActiveTab("recurring")}
              >
                Recurring
              </button>
            </div>
            <button
              type="button"
              className="text-button category-manager-trigger"
              onClick={() => setIsCategoryManagerOpen(true)}
              disabled={categoryLoading}
            >
              Manage categories
            </button>
          </div>

          {activeTab === "transactions" ? (
            <>
              <div className="transaction-toolbar">
                <label className="transaction-search">
                  <span className="visually-hidden">Search transactions</span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="8.8"
                      cy="8.8"
                      r="5.6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="m13 13 4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search descriptions or categories"
                    type="search"
                  />
                </label>
                <label>
                  <span className="visually-hidden">Filter by type</span>
                  <select
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(event.target.value);
                      setPage(0);
                    }}
                    aria-label="Filter by transaction type"
                  >
                    <option value="">All types</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </label>
                <label>
                  <span className="visually-hidden">Filter by category</span>
                  <select
                    value={categoryFilter}
                    onChange={(event) => {
                      setCategoryFilter(event.target.value);
                      setPage(0);
                    }}
                    aria-label="Filter by category"
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.type})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="visually-hidden">Sort transactions</span>
                  <select
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value);
                      setPage(0);
                    }}
                    aria-label="Sort transactions"
                  >
                    <option value="date_desc">Newest first</option>
                    <option value="date_asc">Oldest first</option>
                    <option value="amount_desc">Amount: high to low</option>
                    <option value="amount_asc">Amount: low to high</option>
                  </select>
                </label>
              </div>

              <div className="transaction-date-filters">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(event) => {
                      setFromDate(event.target.value);
                      setPage(0);
                    }}
                    aria-label="Start date filter"
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(event) => {
                      setToDate(event.target.value);
                      setPage(0);
                    }}
                    aria-label="End date filter"
                  />
                </label>
                {hasFilters && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              <TransactionList
                transactions={transactions}
                isLoading={transactionsLoading || categoryLoading}
                hasFilters={hasFilters}
                onEdit={(transaction) =>
                  setTransactionForm({
                    transaction,
                    isReceiptFlow: false,
                  })
                }
                onDelete={handleDeleteTransaction}
                onViewReceipt={handleViewReceipt}
                onAdd={() =>
                  setTransactionForm({
                    transaction: null,
                    isReceiptFlow: false,
                  })
                }
                onClearFilters={clearFilters}
                deletingId={deletingTransactionId}
              />

              {totalCount > 0 && (
                <div className="transaction-pagination">
                  <span>
                    {firstResult}–{lastResult} of {totalCount}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label="Previous transaction page"
                      onClick={() => {
                        if (canGoToPreviousPage) {
                          setPage((current) => Math.max(0, current - 1));
                        }
                      }}
                      disabled={!canGoToPreviousPage}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label="Next transaction page"
                      onClick={() => {
                        if (canGoToNextPage) {
                          setPage((current) =>
                            Math.min(pageCount - 1, current + 1),
                          );
                        }
                      }}
                      disabled={!canGoToNextPage}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              {sort.startsWith("amount") && (
                <p className="transaction-sort-note">
                  Amount sorting uses the stored numeric amounts; it does not
                  convert currencies or compare purchasing power.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="recurring-toolbar">
                <div>
                  <h2>Scheduled transactions</h2>
                  <p>
                    Occurrences are created only when you choose to record
                    them. No background scheduler is assumed.
                  </p>
                </div>
                <div className="recurring-toolbar-actions">
                  {dueOccurrenceCount > 0 && (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() =>
                        handleRecordDue(dueOccurrences, "all")
                      }
                      disabled={recordingDue || rulesLoading}
                    >
                      {recordingDue
                        ? "Recording..."
                        : `Record all due (${dueOccurrenceCount})`}
                    </button>
                  )}
                  {!rulesLoading && dueOccurrenceCount === 0 && (
                    <p className="recurring-no-due" role="status">
                      There are no due occurrences to record.
                    </p>
                  )}
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => setRecurringForm({ rule: null })}
                  >
                    Add recurring
                  </button>
                </div>
              </div>
              <RecurringList
                rules={rules}
                dueOccurrences={dueOccurrences}
                categories={categories}
                isLoading={rulesLoading || categoryLoading}
                onEdit={(rule) => setRecurringForm({ rule })}
                onToggle={handleToggleRule}
                onDelete={handleDeleteRule}
                onRecord={(occurrences) =>
                  handleRecordDue(occurrences, "individual")
                }
                busyId={busyRuleId || (recordingDue ? "all" : "")}
              />
            </>
          )}
        </section>

      </div>

      {transactionForm && (
        <TransactionForm
          key={
            transactionForm.transaction?.id ||
            (transactionForm.isReceiptFlow ? "scan" : "new")
          }
          isOpen
          onClose={() => setTransactionForm(null)}
          onSave={handleSaveTransaction}
          categories={categories}
          defaultCurrency={currencySettings.code}
          currencyIsFallback={currencySettings.isFallback}
          transaction={transactionForm.transaction}
          isReceiptFlow={transactionForm.isReceiptFlow}
        />
      )}
      {recurringForm && (
        <RecurringRuleForm
          key={recurringForm.rule?.id || "new-recurring"}
          isOpen
          onClose={() => setRecurringForm(null)}
          onSave={handleSaveRecurringRule}
          categories={categories}
          defaultCurrency={currencySettings.code}
          currencyIsFallback={currencySettings.isFallback}
          rule={recurringForm.rule}
        />
      )}
      <CategoryManager
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        userId={user.id}
        categories={categories}
        usageCounts={usageCounts}
        onChanged={() => setCategoryRefreshKey((current) => current + 1)}
      />
      <Modal
        isOpen={Boolean(confirmation)}
        onClose={() => {
          setConfirmation(null);
          setConfirmationError("");
        }}
        titleId="finance-confirmation-title"
        className="finance-confirmation-dialog"
        preventClose={isConfirming}
      >
        <div className="finance-dialog-header">
          <div>
            <p className="eyebrow">
              {isRecordConfirmation
                ? "REVIEW BEFORE RECORDING"
                : "CONFIRM PERMANENT CHANGE"}
            </p>
            <h2 id="finance-confirmation-title">{confirmationTitle}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close confirmation"
            onClick={() => {
              setConfirmation(null);
              setConfirmationError("");
            }}
            disabled={isConfirming}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        {confirmation?.kind === "delete-transaction" && (
          <div className="finance-confirmation-content">
            <strong className="finance-confirmation-item-title">
              {confirmation.transaction.description?.trim() ||
                confirmation.transaction.category_name}
            </strong>
            <p>
              {confirmation.transaction.category_name}
              {" · "}
              {formatTransactionDate(
                confirmation.transaction.transaction_date,
              )}
              {" · "}
              {confirmation.transaction.type}
            </p>
            <strong
              className={`finance-confirmation-amount is-${confirmation.transaction.type}`}
            >
              {confirmation.transaction.type === "income" ? "+" : "-"}
              {formatCurrency(
                confirmation.transaction.amount,
                confirmation.transaction.currency_code,
              )}
            </strong>
            <p className="form-note">
              This transaction will be permanently deleted and cannot be
              restored.
            </p>
          </div>
        )}

        {confirmation?.kind === "delete-rule" && (
          <div className="finance-confirmation-content">
            <strong className="finance-confirmation-item-title">
              {confirmation.rule.description?.trim() ||
                categories.find(
                  (item) => item.id === confirmation.rule.category_id,
                )?.name ||
                "Recurring transaction"}
            </strong>
            <p>
              {categories.find(
                (item) => item.id === confirmation.rule.category_id,
              )?.name || "Category unavailable"}
              {" · "}
              {confirmation.rule.type}
              {" · "}
              {confirmation.rule.frequency}
              {confirmation.rule.end_date &&
                ` · Ends ${formatTransactionDate(confirmation.rule.end_date)}`}
            </p>
            <strong
              className={`finance-confirmation-amount is-${confirmation.rule.type}`}
            >
              {confirmation.rule.type === "income" ? "+" : "-"}
              {formatCurrency(
                confirmation.rule.amount,
                confirmation.rule.currency_code,
              )}
            </strong>
            <p className="form-note">
              This schedule will be permanently deleted. Transactions already
              recorded from it will remain.
            </p>
          </div>
        )}

        {isRecordConfirmation && (
          <div className="finance-confirmation-content">
            <p className="finance-confirmation-intro">
              {confirmation.kind === "record-all"
                ? `${confirmedOccurrences.length} due ${
                    confirmedOccurrences.length === 1
                      ? "occurrence will"
                      : "occurrences will"
                  } be added to your transaction history.`
                : confirmedOccurrences.length === 1
                  ? "This due occurrence will be added to your transaction history."
                  : `These ${confirmedOccurrences.length} due occurrences will be added to your transaction history.`}
            </p>
            <ul className="finance-confirmation-list">
              {confirmedOccurrences.map((occurrence) => (
                <li
                  className="finance-confirmation-list-item"
                  key={`${occurrence.ruleId}-${occurrence.occurrenceDate}`}
                >
                  <div>
                    <strong className="finance-confirmation-item-title">
                      {occurrence.description?.trim() ||
                        occurrence.categoryName}
                    </strong>
                    <p>
                      {occurrence.description?.trim()
                        ? `${occurrence.categoryName} · `
                        : ""}
                      {occurrence.type}
                      {" · "}
                      {formatTransactionDate(occurrence.occurrenceDate)}
                    </p>
                  </div>
                  <strong
                    className={`finance-confirmation-amount is-${occurrence.type}`}
                  >
                    {occurrence.type === "income" ? "+" : "-"}
                    {formatCurrency(
                      occurrence.amount,
                      occurrence.currencyCode,
                    )}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {confirmationError && (
          <p className="form-error-banner" role="alert">
            {confirmationError}
          </p>
        )}

        <div className="finance-dialog-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setConfirmation(null);
              setConfirmationError("");
            }}
            disabled={isConfirming}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`button-primary${
              confirmation?.kind?.startsWith("delete-") ? " is-danger" : ""
            }`}
            onClick={handleConfirmAction}
            disabled={isConfirming}
            aria-busy={isConfirming}
          >
            {isConfirming
              ? confirmation?.kind?.startsWith("delete-")
                ? "Deleting..."
                : "Recording..."
              : confirmationActionLabel}
          </button>
        </div>
      </Modal>
      <Modal
        isOpen={Boolean(receiptViewer)}
        onClose={() => setReceiptViewer(null)}
        titleId="receipt-viewer-title"
        className="receipt-viewer-dialog"
      >
        <div className="finance-dialog-header">
          <div>
            <p className="eyebrow">PRIVATE RECEIPT</p>
            <h2 id="receipt-viewer-title">{receiptViewer?.title || "Receipt"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close receipt"
            onClick={() => setReceiptViewer(null)}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        {receiptViewer && (
          <img
            className="receipt-viewer-image"
            src={receiptViewer.url}
            alt={`Receipt for ${receiptViewer.title}`}
          />
        )}
      </Modal>
    </AppShell>
  );
}

export default TransactionsPage;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../lib/currency";
import {
  getFinanceErrorMessage,
  listCategories,
  listTransactionsForAnalytics,
} from "../lib/transactions";
import "./Analytics.css";

const DATE_PRESETS = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "last_6_months", label: "Last 6 Months" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const CATEGORY_COLORS = [
  "#5c9b70",
  "#174a32",
  "#9abf82",
  "#d1a64c",
  "#72998a",
  "#c47768",
  "#8594ad",
  "#ad8c68",
  "#917cac",
  "#79a9b5",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_TRANSACTIONS = [];

function toLocalDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function createUtcDate(year, monthIndex, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return createUtcDate(year, month - 1, day);
}

function toDateString(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value, offset) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return toDateString(date);
}

function shiftCalendarMonths(value, offset) {
  const date = parseDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const lastDay = createUtcDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toDateString(date);
}

function getMonthStart(value) {
  return `${value.slice(0, 7)}-01`;
}

function getPresetRange(preset) {
  const today = toLocalDateString();
  const currentMonthStart = getMonthStart(today);

  if (preset === "last_month") {
    const endDate = addDays(currentMonthStart, -1);
    return {
      startDate: getMonthStart(endDate),
      endDate,
    };
  }
  if (preset === "last_3_months") {
    return {
      startDate: shiftCalendarMonths(currentMonthStart, -2),
      endDate: today,
    };
  }
  if (preset === "last_6_months") {
    return {
      startDate: shiftCalendarMonths(currentMonthStart, -5),
      endDate: today,
    };
  }
  if (preset === "this_year") {
    return {
      startDate: `${today.slice(0, 4)}-01-01`,
      endDate: today,
    };
  }
  return { startDate: currentMonthStart, endDate: today };
}

function getDateRangeError(startDate, endDate) {
  if (!startDate || !endDate) {
    return "Choose both a start date and an end date.";
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    toDateString(parseDate(startDate)) !== startDate ||
    toDateString(parseDate(endDate)) !== endDate
  ) {
    return "Choose valid calendar dates.";
  }
  if (startDate > endDate) {
    return "The start date must be on or before the end date.";
  }
  return "";
}

function getPreviousRange(range, preset) {
  if (preset === "this_month") {
    return {
      startDate: shiftCalendarMonths(range.startDate, -1),
      endDate: shiftCalendarMonths(range.endDate, -1),
    };
  }
  if (preset === "last_month") {
    const endDate = addDays(range.startDate, -1);
    return {
      startDate: getMonthStart(endDate),
      endDate,
    };
  }
  if (preset === "last_3_months") {
    return {
      startDate: shiftCalendarMonths(range.startDate, -3),
      endDate: shiftCalendarMonths(range.endDate, -3),
    };
  }
  if (preset === "last_6_months") {
    return {
      startDate: shiftCalendarMonths(range.startDate, -6),
      endDate: shiftCalendarMonths(range.endDate, -6),
    };
  }
  if (preset === "this_year") {
    return {
      startDate: shiftCalendarMonths(range.startDate, -12),
      endDate: shiftCalendarMonths(range.endDate, -12),
    };
  }

  const duration = Math.floor(
    (parseDate(range.endDate) - parseDate(range.startDate)) / DAY_MS,
  );
  const endDate = addDays(range.startDate, -1);
  return {
    startDate: addDays(endDate, -duration),
    endDate,
  };
}

function getInterval(range) {
  const duration =
    Math.floor(
      (parseDate(range.endDate) - parseDate(range.startDate)) / DAY_MS,
    ) + 1;
  if (duration <= 45) {
    return "day";
  }
  if (duration <= 180) {
    return "week";
  }
  if (duration <= 1095) {
    return "month";
  }
  return "year";
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(parseDate(value));
}

function formatRange(range) {
  return `${formatDate(range.startDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} – ${formatDate(range.endDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function getBucketStart(dateValue, interval) {
  const date = parseDate(dateValue);
  if (interval === "week") {
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysFromMonday);
  } else if (interval === "month") {
    date.setUTCDate(1);
  } else if (interval === "year") {
    date.setUTCMonth(0, 1);
  }
  return toDateString(date);
}

function formatBucketLabel(value, interval) {
  if (interval === "day") {
    return formatDate(value);
  }
  if (interval === "week") {
    return `Week of ${formatDate(value)}`;
  }
  if (interval === "month") {
    return formatDate(value, { month: "short", year: "numeric" });
  }
  return formatDate(value, { year: "numeric" });
}

function getCurrencyTotals(transactions, currencyCode) {
  return transactions.reduce(
    (total, transaction) => {
      if (transaction.currency_code !== currencyCode) {
        return total;
      }
      total[transaction.type] += transaction.amount;
      total.count += 1;
      total[`${transaction.type}Count`] += 1;
      return total;
    },
    {
      income: 0,
      expense: 0,
      count: 0,
      incomeCount: 0,
      expenseCount: 0,
    },
  );
}

function groupByPeriod(transactions, currencyCode, interval) {
  const periods = new Map();
  transactions.forEach((transaction) => {
    if (transaction.currency_code !== currencyCode) {
      return;
    }
    const key = getBucketStart(transaction.transaction_date, interval);
    const period = periods.get(key) || {
      key,
      label: formatBucketLabel(key, interval),
      income: 0,
      expense: 0,
      hasIncome: false,
      hasExpense: false,
    };
    period[transaction.type] += transaction.amount;
    period[transaction.type === "income" ? "hasIncome" : "hasExpense"] = true;
    periods.set(key, period);
  });
  return [...periods.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function getCategorySpending(transactions, currencyCode) {
  const categories = new Map();
  transactions.forEach((transaction) => {
    if (
      transaction.type !== "expense" ||
      transaction.currency_code !== currencyCode
    ) {
      return;
    }
    const categoryId = transaction.category_id || "unknown";
    const category = categories.get(categoryId) || {
      categoryId,
      name: transaction.category_name?.trim() || "Unknown category",
      amount: 0,
    };
    category.amount += transaction.amount;
    categories.set(categoryId, category);
  });

  const rows = [...categories.values()].sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return rows.map((row, index) => ({
    ...row,
    percent: total > 0 ? (row.amount / total) * 100 : 0,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }));
}

function getCategoryComparisons(currentTransactions, previousTransactions, currencyCode) {
  const categories = new Map();
  const addTransactions = (transactions, field) => {
    transactions.forEach((transaction) => {
      if (
        transaction.type !== "expense" ||
        transaction.currency_code !== currencyCode
      ) {
        return;
      }
      const categoryId = transaction.category_id || "unknown";
      const category = categories.get(categoryId) || {
        categoryId,
        name: transaction.category_name?.trim() || "Unknown category",
        current: 0,
        previous: 0,
      };
      category[field] += transaction.amount;
      if (field === "current" || !category.name) {
        category.name = transaction.category_name?.trim() || "Unknown category";
      }
      categories.set(categoryId, category);
    });
  };

  addTransactions(currentTransactions, "current");
  addTransactions(previousTransactions, "previous");

  return [...categories.values()]
    .map((category) => ({
      ...category,
      change: category.current - category.previous,
      percentChange:
        category.previous > 0
          ? ((category.current - category.previous) / category.previous) * 100
          : null,
    }))
    .filter((category) => category.current > 0 || category.previous > 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

function formatPercent(value) {
  if (value !== 0 && Math.abs(value) < 0.005) {
    return value > 0 ? "<0.01%" : ">-0.01%";
  }
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
  return `${value > 0 ? "+" : ""}${formatted}%`;
}

function formatPercentMagnitude(value) {
  if (value !== 0 && Math.abs(value) < 0.005) {
    return "<0.01%";
  }
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(Math.abs(value))}%`;
}

function getComparisonStatus(category) {
  if (category.change === 0) {
    return "No change";
  }
  if (category.previous === 0 && category.current > 0) {
    return "New spending";
  }
  if (category.percentChange === null) {
    return "Comparison unavailable";
  }
  return `${category.change > 0 ? "Increased" : "Decreased"} ${formatPercentMagnitude(category.percentChange)}`;
}

function getInsights(currentTransactions, previousTransactions, currencyCode) {
  const currentTotals = getCurrencyTotals(currentTransactions, currencyCode);
  const previousTotals = getCurrencyTotals(previousTransactions, currencyCode);
  const insights = [];

  if (currentTotals.expense > 0) {
    const topCategory = getCategorySpending(
      currentTransactions,
      currencyCode,
    )[0];
    if (topCategory) {
      insights.push(
        `${topCategory.name} is your highest-spend category at ${formatCurrency(topCategory.amount, currencyCode)} (${new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 1,
        }).format(topCategory.percent)}% of expenses).`,
      );
    }
  }

  if (currentTotals.expense > 0 && previousTotals.expense > 0) {
    const change = currentTotals.expense - previousTotals.expense;
    if (change !== 0) {
      const direction = change > 0 ? "increased" : "decreased";
      insights.push(
        `Expenses ${direction} by ${formatCurrency(Math.abs(change), currencyCode)} (${formatPercent((change / previousTotals.expense) * 100)}) compared with the previous period.`,
      );
    } else {
      insights.push("Expenses matched the previous period's total.");
    }
  } else if (currentTotals.expense > 0 && previousTotals.expense === 0) {
    insights.push(
      "No expenses were recorded in the comparison period, so a percentage change is not available.",
    );
  } else if (currentTotals.expense === 0 && previousTotals.expense > 0) {
    insights.push(
      `No expenses were recorded in this period; the previous period had ${formatCurrency(previousTotals.expense, currencyCode)} in expenses.`,
    );
  }

  if (currentTotals.incomeCount > 0 && currentTotals.expenseCount > 0) {
    const net = currentTotals.income - currentTotals.expense;
    insights.push(
      net >= 0
        ? `Recorded income exceeded expenses by ${formatCurrency(net, currencyCode)}.`
        : `Recorded expenses exceeded income by ${formatCurrency(Math.abs(net), currencyCode)}.`,
    );
  }

  if (insights.length === 0 && currentTotals.count === 0 && previousTotals.count === 0) {
    return ["No transaction-based insights are available for this currency and period yet."];
  }
  if (insights.length === 0 && currentTotals.count === 0) {
    return ["No transactions were recorded in the selected period for this currency."];
  }
  if (insights.length === 0) {
    return [
      "No additional expense pattern can be derived from these transactions and the comparison period.",
    ];
  }
  return insights.slice(0, 3);
}

function CurrencySummary({ transactions, currencyCode }) {
  const totals = getCurrencyTotals(transactions, currencyCode);
  if (totals.count === 0) {
    return (
      <article className="analytics-currency-summary">
        <div className="analytics-currency-heading">
          <span className="analytics-currency-chip">{currencyCode}</span>
          <span>No transactions in the selected range</span>
        </div>
        <p className="analytics-empty-copy">
          There are no recorded income or expenses to summarize for this
          currency and date range.
        </p>
      </article>
    );
  }

  return (
    <article className="analytics-currency-summary">
      <div className="analytics-currency-heading">
        <span className="analytics-currency-chip">{currencyCode}</span>
        <span>Selected range · {totals.count} transactions</span>
      </div>
      <div className="analytics-summary-values">
        <div>
          <span>Total income</span>
          <strong>{formatCurrency(totals.income, currencyCode)}</strong>
        </div>
        <div>
          <span>Total expenses</span>
          <strong>{formatCurrency(totals.expense, currencyCode)}</strong>
        </div>
        <div>
          <span>Net cash flow</span>
          <strong className={totals.income - totals.expense < 0 ? "is-negative" : ""}>
            {formatCurrency(totals.income - totals.expense, currencyCode)}
          </strong>
        </div>
      </div>
    </article>
  );
}

function PeriodLegend() {
  return (
    <div className="analytics-chart-legend" aria-label="Chart legend">
      <span><i className="is-income" aria-hidden="true" />Income</span>
      <span><i className="is-expense" aria-hidden="true" />Expenses</span>
    </div>
  );
}

function IncomeExpenseChart({
  transactions,
  currencyCode,
  interval,
  range,
}) {
  const periods = groupByPeriod(transactions, currencyCode, interval);
  const maximum = Math.max(
    0,
    ...periods.flatMap((period) => [period.income, period.expense]),
  );
  const rangeLabel = formatRange(range);

  return (
    <section className="analytics-panel" aria-labelledby={`income-expense-${currencyCode}`}>
      <div className="analytics-section-heading">
        <div>
          <p className="analytics-eyebrow">CASH FLOW BY PERIOD</p>
          <h3 id={`income-expense-${currencyCode}`}>Income vs. expenses</h3>
        </div>
        <span className="analytics-currency-chip">{currencyCode}</span>
      </div>
      <div className="analytics-chart-context">
        <span>{rangeLabel}</span>
        <span>{interval === "day" ? "Daily" : interval === "week" ? "Weekly" : interval === "month" ? "Monthly" : "Yearly"} totals</span>
      </div>
      {periods.length === 0 ? (
        <p className="analytics-empty-copy">
          No transactions are recorded for this currency and period.
        </p>
      ) : (
        <>
          <PeriodLegend />
          <div className="analytics-chart-scroll">
            <div
              className="analytics-period-chart"
              style={{ "--analytics-period-count": periods.length }}
            >
              {periods.map((period) => {
                const incomeHeight =
                  maximum > 0 ? (period.income / maximum) * 100 : 0;
                const expenseHeight =
                  maximum > 0 ? (period.expense / maximum) * 100 : 0;
                const tooltip = [
                  period.label,
                  `Income: ${period.hasIncome ? formatCurrency(period.income, currencyCode) : "No recorded income"}`,
                  `Expenses: ${period.hasExpense ? formatCurrency(period.expense, currencyCode) : "No recorded expenses"}`,
                ].join(". ");
                return (
                  <div
                    className="analytics-period-column"
                    key={period.key}
                    tabIndex={0}
                    role="group"
                    aria-label={tooltip}
                    title={tooltip}
                  >
                    <span className="analytics-chart-tooltip" aria-hidden="true">
                      <strong>{period.label}</strong>
                      <span>
                        Income:{" "}
                        {period.hasIncome
                          ? formatCurrency(period.income, currencyCode)
                          : "No recorded income"}
                      </span>
                      <span>
                        Expenses:{" "}
                        {period.hasExpense
                          ? formatCurrency(period.expense, currencyCode)
                          : "No recorded expenses"}
                      </span>
                    </span>
                    <div className="analytics-period-bars">
                      {period.hasIncome && (
                        <span
                          className="analytics-bar is-income"
                          style={{ height: `${incomeHeight}%` }}
                        />
                      )}
                      {period.hasExpense && (
                        <span
                          className="analytics-bar is-expense"
                          style={{ height: `${expenseHeight}%` }}
                        />
                      )}
                    </div>
                    <span className="analytics-period-label">{period.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="analytics-chart-note">
            Periods without transactions are omitted. Each bar uses the same
            scale within {currencyCode}.
          </p>
        </>
      )}
    </section>
  );
}

function CategorySpendingChart({ transactions, currencyCode }) {
  const categories = getCategorySpending(transactions, currencyCode);
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  const radius = 37;
  const circumference = 2 * Math.PI * radius;
  const segments = categories.reduce((result, category) => {
    const previous = result[result.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    const length = total > 0 ? (category.amount / total) * circumference : 0;
    return [...result, { ...category, length, offset }];
  }, []);

  return (
    <section className="analytics-panel" aria-labelledby={`category-spend-${currencyCode}`}>
      <div className="analytics-section-heading">
        <div>
          <p className="analytics-eyebrow">WHERE IT WENT</p>
          <h3 id={`category-spend-${currencyCode}`}>Spending by category</h3>
        </div>
        <span className="analytics-currency-chip">{currencyCode}</span>
      </div>
      {categories.length === 0 ? (
        <p className="analytics-empty-copy">
          No expenses are recorded for this currency and period.
        </p>
      ) : (
        <div className="analytics-category-layout">
          <div className="analytics-donut-wrap">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle
                className="analytics-donut-track"
                cx="50"
                cy="50"
                r={radius}
              />
              {segments.map((segment) => (
                <circle
                  className="analytics-donut-segment"
                  key={segment.categoryId}
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke={segment.color}
                  strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                  strokeDashoffset={-segment.offset}
                >
                  <title>
                    {segment.name}: {formatCurrency(segment.amount, currencyCode)}
                  </title>
                </circle>
              ))}
            </svg>
            <div className="analytics-donut-center">
              <span>Total expenses</span>
              <strong>{formatCurrency(total, currencyCode)}</strong>
            </div>
          </div>
          <ul className="analytics-category-legend">
            {categories.map((category) => (
              <li key={category.categoryId}>
                <span className="analytics-category-name">
                  <i
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <strong>{category.name}</strong>
                </span>
                <span className="analytics-category-values">
                  <strong>{formatCurrency(category.amount, currencyCode)}</strong>
                  <span>
                    {new Intl.NumberFormat(undefined, {
                      maximumFractionDigits: 1,
                    }).format(category.percent)}
                    %
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SpendingTrendChart({ transactions, currencyCode, interval, range }) {
  const periods = groupByPeriod(transactions, currencyCode, interval).filter(
    (period) => period.hasExpense,
  );
  const maximum = Math.max(0, ...periods.map((period) => period.expense));

  return (
    <section className="analytics-panel" aria-labelledby={`trend-${currencyCode}`}>
      <div className="analytics-section-heading">
        <div>
          <p className="analytics-eyebrow">EXPENSE PATTERN</p>
          <h3 id={`trend-${currencyCode}`}>Spending trend</h3>
        </div>
        <span className="analytics-currency-chip">{currencyCode}</span>
      </div>
      <div className="analytics-chart-context">
        <span>{formatRange(range)}</span>
        <span>{interval === "day" ? "Daily" : interval === "week" ? "Weekly" : interval === "month" ? "Monthly" : "Yearly"}</span>
      </div>
      {periods.length === 0 ? (
        <p className="analytics-empty-copy">
          No expense transactions are recorded for this currency and period.
        </p>
      ) : (
        <>
          <div className="analytics-chart-scroll">
            <div
              className="analytics-trend-chart"
              style={{ "--analytics-period-count": periods.length }}
            >
              {periods.map((period) => {
                const height = maximum > 0 ? (period.expense / maximum) * 100 : 0;
                const tooltip = `${period.label}: ${formatCurrency(period.expense, currencyCode)} in expenses`;
                return (
                  <div
                    className="analytics-trend-column"
                    key={period.key}
                    tabIndex={0}
                    role="img"
                    aria-label={tooltip}
                    title={tooltip}
                  >
                    <span className="analytics-chart-tooltip" aria-hidden="true">
                      <strong>{period.label}</strong>
                      <span>{formatCurrency(period.expense, currencyCode)}</span>
                    </span>
                    <div className="analytics-trend-track">
                      <span style={{ height: `${height}%` }} />
                    </div>
                    <span className="analytics-period-label">{period.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="analytics-chart-note">
            Only periods with recorded expenses are shown; empty periods are
            omitted rather than filled with assumed activity.
          </p>
        </>
      )}
    </section>
  );
}

function CategoryComparison({ currentTransactions, previousTransactions, currencyCode }) {
  const categories = getCategoryComparisons(
    currentTransactions,
    previousTransactions,
    currencyCode,
  ).slice(0, 6);

  return (
    <section className="analytics-panel" aria-labelledby={`category-comparison-${currencyCode}`}>
      <div className="analytics-section-heading">
        <div>
          <p className="analytics-eyebrow">PERIOD COMPARISON</p>
          <h3 id={`category-comparison-${currencyCode}`}>Category changes</h3>
        </div>
        <span className="analytics-currency-chip">{currencyCode}</span>
      </div>
      {categories.length === 0 ? (
        <p className="analytics-empty-copy">
          There is not enough category spending to compare these periods.
        </p>
      ) : (
        <div className="analytics-comparison-table-wrap">
          <table className="analytics-comparison-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Selected period</th>
                <th scope="col">Previous period</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const changeLabel = getComparisonStatus(category);
                return (
                  <tr key={category.categoryId}>
                    <th scope="row">{category.name}</th>
                    <td>{formatCurrency(category.current, currencyCode)}</td>
                    <td>{formatCurrency(category.previous, currencyCode)}</td>
                    <td>
                      <strong>
                        {category.change > 0 && category.previous > 0 ? "+" : ""}
                        {formatCurrency(category.change, currencyCode)}
                      </strong>
                      <span className="analytics-change-status">
                        {changeLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FinancialInsights({
  currencies,
  currentTransactions,
  previousTransactions,
}) {
  return (
    <section className="analytics-insights-section" aria-labelledby="analytics-insights-title">
      <div className="analytics-section-heading">
        <div>
          <p className="analytics-eyebrow">OBSERVATIONS FROM YOUR RECORDS</p>
          <h2 id="analytics-insights-title">Financial insights</h2>
        </div>
        <span className="analytics-rule-based-label">Rule-based</span>
      </div>
      {currencies.length === 0 ? (
        <p className="analytics-insights-empty">
          Record transactions to see useful observations for your selected
          period.
        </p>
      ) : (
        <div className="analytics-insights-grid">
          {currencies.map((currencyCode) => (
            <article
              className="analytics-insight-card"
              key={currencyCode}
              aria-label={`${currencyCode} financial insights`}
            >
              <div className="analytics-insight-heading">
                <span className="analytics-currency-chip">{currencyCode}</span>
                <span>Currency</span>
              </div>
              <ul>
                {getInsights(
                  currentTransactions,
                  previousTransactions,
                  currencyCode,
                ).map((insight) => (
                  <li key={insight}>{insight}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Analytics() {
  const [preset, setPreset] = useState("this_month");
  const [range, setRange] = useState(() => getPresetRange("this_month"));
  const [customStart, setCustomStart] = useState(() => getPresetRange("this_month").startDate);
  const [customEnd, setCustomEnd] = useState(() => getPresetRange("this_month").endDate);
  const [loadedData, setLoadedData] = useState({
    key: "",
    current: [],
    previous: [],
  });
  const [loadError, setLoadError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestId = useRef(0);
  const comparisonRange = useMemo(
    () => getPreviousRange(range, preset),
    [preset, range],
  );
  const requestKey = [
    range.startDate,
    range.endDate,
    comparisonRange.startDate,
    comparisonRange.endDate,
    refreshKey,
  ].join("|");
  const currentTransactions =
    loadedData.key === requestKey ? loadedData.current : EMPTY_TRANSACTIONS;
  const previousTransactions =
    loadedData.key === requestKey ? loadedData.previous : EMPTY_TRANSACTIONS;
  const isLoading =
    loadedData.key !== requestKey && loadError?.key !== requestKey;
  const error = loadError?.key === requestKey ? loadError.message : "";

  const loadData = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;

    try {
      const categories = await listCategories();
      const categoryNames = new Map(
        categories.map((category) => [category.id, category.name]),
      );
      const [current, previous] = await Promise.all([
        listTransactionsForAnalytics(
          range.startDate,
          range.endDate,
          categoryNames,
        ),
        listTransactionsForAnalytics(
          comparisonRange.startDate,
          comparisonRange.endDate,
          categoryNames,
        ),
      ]);
      if (requestId.current === currentRequestId) {
        setLoadedData({
          key: requestKey,
          current,
          previous,
        });
        setLoadError(null);
      }
    } catch (requestError) {
      console.error("Could not load Analytics transaction data:", requestError);
      if (requestId.current === currentRequestId) {
        setLoadError({
          key: requestKey,
          message: getFinanceErrorMessage(
            requestError,
            "Analytics could not be loaded. Check your connection and try again.",
          ),
        });
      }
    }
  }, [comparisonRange, range, requestKey]);

  useEffect(() => {
    let isActive = true;
    void Promise.resolve().then(() => {
      if (isActive) {
        return loadData();
      }
      return undefined;
    });
    return () => {
      isActive = false;
      requestId.current += 1;
    };
  }, [loadData, refreshKey]);

  const currencies = [...new Set(
    [...currentTransactions, ...previousTransactions].map(
      (transaction) => transaction.currency_code,
    ),
  )].sort((a, b) => a.localeCompare(b));
  const interval = getInterval(range);
  const rangeLabel = formatRange(range);
  const customRangeError = getDateRangeError(customStart, customEnd);
  const isAppliedCustomRange =
    preset === "custom" &&
    customStart === range.startDate &&
    customEnd === range.endDate;

  const selectPreset = (value) => {
    setPreset(value);
    if (value === "custom") {
      setCustomStart(range.startDate);
      setCustomEnd(range.endDate);
      return;
    }
    setRange(getPresetRange(value));
  };

  const applyCustomRange = () => {
    if (customRangeError) {
      return;
    }
    setRange({ startDate: customStart, endDate: customEnd });
  };

  return (
    <div className="analytics-page">
      <header className="analytics-page-header">
        <div>
          <p className="analytics-eyebrow">UNDERSTAND YOUR PATTERNS</p>
          <h1>Analytics</h1>
          <p>
            Explore your recorded income and spending across dates and
            categories. Transactions in different currencies are analyzed
            separately without conversion.
          </p>
        </div>
        <Link className="analytics-transactions-link" to="/transactions">
          View transactions
        </Link>
      </header>

      <section className="analytics-filter-panel" aria-label="Analytics filters">
        <div className="analytics-filter-top">
          <div className="analytics-date-presets" role="group" aria-label="Date range presets">
            {DATE_PRESETS.map((item) => (
              <button
                type="button"
                key={item.value}
                className={`analytics-preset-button${preset === item.value ? " is-active" : ""}`}
                aria-pressed={preset === item.value}
                onClick={() => selectPreset(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" ? (
          <div className="analytics-custom-range">
            <label>
              <span>Start date</span>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(event) => setCustomStart(event.target.value)}
                aria-invalid={Boolean(customRangeError)}
                aria-describedby={
                  customRangeError ? "analytics-date-error" : undefined
                }
              />
            </label>
            <span className="analytics-range-separator" aria-hidden="true">
              to
            </span>
            <label>
              <span>End date</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(event) => setCustomEnd(event.target.value)}
                aria-invalid={Boolean(customRangeError)}
                aria-describedby={
                  customRangeError ? "analytics-date-error" : undefined
                }
              />
            </label>
            <button
              type="button"
              className="analytics-apply-range"
              onClick={applyCustomRange}
              disabled={Boolean(customRangeError) || isAppliedCustomRange}
            >
              Apply range
            </button>
            {customRangeError && (
              <p
                className="analytics-date-error"
                id="analytics-date-error"
                role="alert"
              >
                {customRangeError}
              </p>
            )}
          </div>
        ) : (
          <p className="analytics-range-caption">
            Selected: <strong>{rangeLabel}</strong>
          </p>
        )}
      </section>

      <div className="analytics-comparison-caption">
        Selected period: <strong>{rangeLabel}</strong>
        <span aria-hidden="true"> · </span>
        Previous period: <strong>{formatRange(comparisonRange)}</strong>
      </div>

      {error && (
        <div className="finance-alert is-error analytics-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="analytics-loading" role="status" aria-live="polite">
          <span className="analytics-spinner" aria-hidden="true" />
          Loading your financial analysis...
        </div>
      ) : error ? (
        <section className="analytics-load-error">
          <h2>Analytics data is unavailable</h2>
          <p>Your saved transactions have not been changed.</p>
          <button
            type="button"
            className="analytics-apply-range"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Retry loading
          </button>
        </section>
      ) : (
        <>
          <section className="analytics-section" aria-labelledby="analytics-summary-title">
            <div className="analytics-section-heading">
              <div>
                <p className="analytics-eyebrow">SELECTED PERIOD</p>
                <h2 id="analytics-summary-title">Financial summary</h2>
              </div>
              <span className="analytics-section-caption">{rangeLabel}</span>
            </div>
            {currencies.length === 0 ? (
              <p className="analytics-empty-state">
                No transaction data is available for this range or its
                comparison period.
              </p>
            ) : (
              <div className="analytics-summary-grid">
                {currencies.map((currencyCode) => (
                  <CurrencySummary
                    key={currencyCode}
                    transactions={currentTransactions}
                    currencyCode={currencyCode}
                  />
                ))}
              </div>
            )}
            <p className="analytics-disclaimer">
              Net cash flow means recorded income minus expenses in the selected
              range. It is not a bank balance. Currency totals are never
              converted or combined.
            </p>
          </section>

          <section className="analytics-section" aria-labelledby="analytics-cashflow-title">
            <div className="analytics-section-heading">
              <div>
                <p className="analytics-eyebrow">CHANGE OVER TIME</p>
                <h2 id="analytics-cashflow-title">Income and spending analysis</h2>
              </div>
              <span className="analytics-section-caption">
                {interval === "day" ? "Daily" : interval === "week" ? "Weekly" : interval === "month" ? "Monthly" : "Yearly"} grouping
              </span>
            </div>
            <div className="analytics-panel-grid">
              {currencies.length === 0 ? (
                <p className="analytics-empty-state">
                  No income or expense activity is available to chart.
                </p>
              ) : (
                currencies.map((currencyCode) => (
                  <IncomeExpenseChart
                    key={currencyCode}
                    transactions={currentTransactions}
                    currencyCode={currencyCode}
                    interval={interval}
                    range={range}
                  />
                ))
              )}
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="analytics-category-title">
            <div className="analytics-section-heading">
              <div>
                <p className="analytics-eyebrow">EXPENSE BREAKDOWN</p>
                <h2 id="analytics-category-title">Category analysis</h2>
              </div>
            </div>
            <div className="analytics-panel-grid">
              {currencies.length === 0 ? (
                <p className="analytics-empty-state">
                  Category analysis will appear when expenses are recorded.
                </p>
              ) : (
                currencies.map((currencyCode) => (
                  <CategorySpendingChart
                    key={currencyCode}
                    transactions={currentTransactions}
                    currencyCode={currencyCode}
                  />
                ))
              )}
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="analytics-trend-title">
            <div className="analytics-section-heading">
              <div>
                <p className="analytics-eyebrow">SPENDING OVER TIME</p>
                <h2 id="analytics-trend-title">Spending trends</h2>
              </div>
              <span className="analytics-section-caption">
                {interval === "day" ? "Daily" : interval === "week" ? "Weekly" : interval === "month" ? "Monthly" : "Yearly"} intervals
              </span>
            </div>
            <div className="analytics-panel-grid">
              {currencies.length === 0 ? (
                <p className="analytics-empty-state">
                  No expense data is available for a trend chart.
                </p>
              ) : (
                currencies.map((currencyCode) => (
                  <SpendingTrendChart
                    key={currencyCode}
                    transactions={currentTransactions}
                    currencyCode={currencyCode}
                    interval={interval}
                    range={range}
                  />
                ))
              )}
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="analytics-comparison-title">
            <div className="analytics-section-heading">
              <div>
                <p className="analytics-eyebrow">CATEGORY COMPARISON</p>
                <h2 id="analytics-comparison-title">What changed?</h2>
              </div>
              <span className="analytics-section-caption">
                Amounts compared within the same currency
              </span>
            </div>
            <div className="analytics-panel-grid">
              {currencies.length === 0 ? (
                <p className="analytics-empty-state">
                  Add expenses in both periods to see category changes.
                </p>
              ) : (
                currencies.map((currencyCode) => (
                  <CategoryComparison
                    key={currencyCode}
                    currentTransactions={currentTransactions}
                    previousTransactions={previousTransactions}
                    currencyCode={currencyCode}
                  />
                ))
              )}
            </div>
          </section>

          <FinancialInsights
            currencies={currencies}
            currentTransactions={currentTransactions}
            previousTransactions={previousTransactions}
          />
        </>
      )}
    </div>
  );
}

export default Analytics;

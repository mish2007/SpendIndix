import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../lib/currency";
import { getFinanceErrorMessage, listTransactionsForReport } from "../lib/transactions";
import "./Reports.css";

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const today = () => isoDate(new Date());
function presetRange(which) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (which === "last_month") {
    start.setMonth(start.getMonth() - 1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (which === "last_3") start.setMonth(start.getMonth() - 2);
  else if (which === "year") { start.setFullYear(now.getFullYear(), 0, 1); end.setTime(now.getTime()); }
  return { startDate: isoDate(start), endDate: isoDate(end) };
}
const initial = presetRange("this_month");
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const filenameRange = (range) => `${range.startDate}_to_${range.endDate}`;

function downloadCsv(transactions, range) {
  const rows = [["Date", "Description", "Category", "Type", "Amount", "Currency"], ...transactions.map((t) => [t.transaction_date, t.description || "", t.category_name, t.type, t.amount, t.currency_code])];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `spendindix-report-${filenameRange(range)}.csv`; link.click(); URL.revokeObjectURL(url);
}

async function downloadPdf(transactions, summaries, breakdowns, range) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const left = 14; const right = 196; let y = 16;
  const ensureSpace = (height = 7) => { if (y + height > 282) { pdf.addPage(); y = 16; } };
  const line = (value, options = {}) => {
    const lines = pdf.splitTextToSize(String(value), options.width || right - left);
    ensureSpace(lines.length * (options.step || 5) + 2);
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(options.size || 9);
    pdf.text(lines, left, y);
    y += lines.length * (options.step || 5) + 1;
  };
  line("SpendIndix", { bold: true, size: 19, step: 8 });
  line(`Transaction report  |  ${range.startDate} to ${range.endDate}`);
  line(`Generated ${today()}`); y += 3;
  line("Summary by currency", { bold: true, size: 12 });
  summaries.forEach(([currency, values]) => line(`${currency}: Income ${formatCurrency(values.income, currency)}  |  Expenses ${formatCurrency(values.expense, currency)}  |  Net cash flow ${formatCurrency(values.income - values.expense, currency)}`));
  y += 3; line("Category breakdown by currency", { bold: true, size: 12 });
  breakdowns.forEach(([currency, groups]) => {
    line(currency, { bold: true });
    groups.forEach((item) => line(`${item.category} — Income ${formatCurrency(item.income, currency)} | Expense ${formatCurrency(item.expense, currency)}`));
  });
  y += 3; line("Transactions", { bold: true, size: 12 });
  transactions.forEach((t) => line(`${t.transaction_date} | ${t.type} | ${t.category_name} | ${t.description || "No description"} | ${formatCurrency(t.amount, t.currency_code)}`, { width: right - left, step: 4.5 }));
  pdf.save(`spendindix-report-${filenameRange(range)}.pdf`);
}

export default function Reports() {
  const [preset, setPreset] = useState("this_month");
  const [range, setRange] = useState(initial);
  const [customStart, setCustomStart] = useState(initial.startDate);
  const [customEnd, setCustomEnd] = useState(initial.endDate);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rangeError = customStart && customEnd && customStart > customEnd ? "Start date must be on or before the end date." : "";
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setTransactions(await listTransactionsForReport(range.startDate, range.endDate)); }
    catch (err) { setError(getFinanceErrorMessage(err, "Reports could not be loaded. Check your connection and try again.")); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const byCurrency = useMemo(() => {
    const result = new Map();
    transactions.forEach((t) => {
      const currency = t.currency_code || "USD";
      if (!result.has(currency)) result.set(currency, { income: 0, expense: 0, categories: new Map() });
      const summary = result.get(currency); summary[t.type] += t.amount;
      if (!summary.categories.has(t.category_name)) summary.categories.set(t.category_name, { income: 0, expense: 0 });
      summary.categories.get(t.category_name)[t.type] += t.amount;
    });
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [transactions]);
  const applyPreset = (key) => { setPreset(key); if (key !== "custom") setRange(presetRange(key)); };
  return <main className="reports-page">
    <header className="reports-heading"><div><p className="reports-eyebrow">YOUR MONEY, CLEARLY</p><h1>Reports</h1><p>Review transactions and export a report for any period.</p></div><div className="reports-actions"><button disabled={!transactions.length || loading} onClick={() => void downloadPdf(transactions, byCurrency, byCurrency.map(([c, v]) => [c, [...v.categories].map(([category, totals]) => ({ category, ...totals }))]), range)}>Download PDF</button><button className="reports-secondary" disabled={!transactions.length || loading} onClick={() => downloadCsv(transactions, range)}>Export CSV</button></div></header>
    <section className="reports-card reports-filters" aria-label="Report date range"><div className="reports-presets">{[["this_month", "This Month"], ["last_month", "Last Month"], ["last_3", "Last 3 Months"], ["year", "This Year"], ["custom", "Custom Range"]].map(([key, label]) => <button key={key} className={preset === key ? "is-active" : ""} onClick={() => applyPreset(key)}>{label}</button>)}</div>{preset === "custom" && <form className="reports-custom" onSubmit={(event) => { event.preventDefault(); if (!rangeError && customStart && customEnd) setRange({ startDate: customStart, endDate: customEnd }); }}><label>Start date<input type="date" value={customStart} max={customEnd || today()} onChange={(event) => setCustomStart(event.target.value)} required /></label><span>to</span><label>End date<input type="date" value={customEnd} min={customStart} max={today()} onChange={(event) => setCustomEnd(event.target.value)} required /></label><button disabled={!customStart || !customEnd || Boolean(rangeError)}>Apply range</button>{rangeError && <small role="alert">{rangeError}</small>}</form>}<p className="reports-period">Showing {range.startDate} through {range.endDate}</p></section>
    {loading ? <div className="reports-state" role="status">Loading transactions…</div> : error ? <div className="reports-state reports-error" role="alert"><p>{error}</p><button onClick={() => void load()}>Retry</button></div> : !transactions.length ? <div className="reports-state"><h2>No transactions in this period</h2><p>Choose another date range to view a report.</p></div> : <>
      <section className="reports-summary-grid">{byCurrency.map(([currency, data]) => <article className="reports-card reports-summary" key={currency}><h2>{currency} summary</h2><div><span>Income</span><strong>{formatCurrency(data.income, currency)}</strong><span>Expenses</span><strong>{formatCurrency(data.expense, currency)}</strong><span>Net cash flow</span><strong>{formatCurrency(data.income - data.expense, currency)}</strong></div></article>)}</section>
      <section className="reports-card"><h2>Category breakdown</h2>{byCurrency.map(([currency, data]) => <div className="reports-table-wrap" key={currency}><h3>{currency}</h3><table><thead><tr><th>Category</th><th>Income</th><th>Expense</th></tr></thead><tbody>{[...data.categories].map(([category, totals]) => <tr key={category}><th>{category}</th><td>{formatCurrency(totals.income, currency)}</td><td>{formatCurrency(totals.expense, currency)}</td></tr>)}</tbody></table></div>)}</section>
      <section className="reports-card"><h2>Transactions <span>({transactions.length})</span></h2><div className="reports-table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Amount</th><th>Currency</th></tr></thead><tbody>{transactions.map((t) => <tr key={t.id}><td>{t.transaction_date}</td><td>{t.description || "—"}</td><td>{t.category_name}</td><td>{t.type}</td><td>{formatCurrency(t.amount, t.currency_code)}</td><td>{t.currency_code}</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}

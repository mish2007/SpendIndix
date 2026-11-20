import { supabase } from "./supabaseClient";

export {
  formatCurrency,
  getCurrencyDecimalPlaces,
  getCurrencySettings,
} from "./currency";

export const RECEIPT_BUCKET = "transaction-receipts";
export const TRANSACTION_PAGE_SIZE = 20;
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const RECEIPT_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});
export const SUPPORTED_RECEIPT_TYPES = Object.freeze(
  Object.keys(RECEIPT_EXTENSIONS),
);

export function getFinanceErrorMessage(error, fallback) {
  const code = error?.code;
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (error?.code === "RECEIPT_CLEANUP") {
    return error.message;
  }

  if (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    message.includes("schema cache")
  ) {
    return "Some finance features are not set up yet. Apply all SQL migrations in frontend/supabase/migrations, then try again.";
  }

  if (code === "23505") {
    return "A category with this name already exists.";
  }

  if (code === "23503") {
    return "This category is being used by a transaction or recurring rule and cannot be removed.";
  }

  if (code === "23514") {
    return "That category does not match the selected transaction type. Choose another category.";
  }

  if (code === "P0001") {
    return typeof error?.message === "string" && error.message.trim()
      ? error.message
      : "One or more selected occurrences are no longer due. Refresh and confirm again.";
  }

  if (
    error?.name === "TypeError" ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "A network error interrupted the request. Check your connection and try again.";
  }

  return fallback;
}

function getReceiptExtension(file) {
  if (!file || file.size === 0) {
    throw new Error("Choose a non-empty receipt image.");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error("Receipt images must be 8 MB or smaller.");
  }
  return RECEIPT_EXTENSIONS[
    typeof file.type === "string" ? file.type.toLowerCase() : ""
  ];
}

async function uploadReceipt(userId, file) {
  const extension = getReceiptExtension(file);
  if (!extension) {
    throw new Error("Choose a JPEG, PNG, or WebP receipt image.");
  }

  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return data.path;
}

async function removeReceipt(path) {
  if (!path) {
    return null;
  }

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .remove([path]);
  return error;
}

export async function listCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, owner_id, type, name, is_system, created_at")
    .order("type")
    .order("name");

  if (error) {
    throw error;
  }

  return data;
}

export async function getCategoryUsageCounts() {
  const { data, error } = await supabase.rpc("category_usage_counts");
  if (error) {
    throw error;
  }

  return new Map(
    (data || []).map((item) => [
      item.category_id,
      {
        transactions: Number(item.transaction_count),
        recurring: Number(item.recurring_count),
      },
    ]),
  );
}

export async function createCategory(userId, { type, name }) {
  const { data, error } = await supabase
    .from("categories")
    .insert({
      owner_id: userId,
      type,
      name: name.trim(),
      is_system: false,
    })
    .select("id, owner_id, type, name, is_system, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateCategory(categoryId, name) {
  const { data, error } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", categoryId)
    .select("id, owner_id, type, name, is_system, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteCategory(categoryId) {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    throw error;
  }
}

export async function listTransactions(options) {
  const { data, error } = await supabase.rpc("list_user_transactions", {
    p_search: options.search.trim() || null,
    p_type: options.type || null,
    p_category_id: options.categoryId || null,
    p_from_date: options.fromDate || null,
    p_to_date: options.toDate || null,
    p_sort: options.sort,
    p_limit: TRANSACTION_PAGE_SIZE,
    p_offset: options.page * TRANSACTION_PAGE_SIZE,
  });

  if (error) {
    throw error;
  }

  return {
    transactions: data || [],
    totalCount: Number(data?.[0]?.total_count || 0),
  };
}

export async function listTransactionsForAnalytics(
  fromDate,
  toDate,
  categoryNames = null,
) {
  const pageSize = 100;
  const transactions = [];
  let offset = 0;
  const resolvedCategoryNames =
    categoryNames ||
    new Map(
      (await listCategories()).map((category) => [
        category.id,
        category.name,
      ]),
    );

  while (true) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, amount, currency_code, category_id, transaction_date")
      .gte("transaction_date", fromDate)
      .lte("transaction_date", toDate)
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = data || [];
    transactions.push(
      ...page.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
        category_name:
          resolvedCategoryNames.get(transaction.category_id) || null,
      })),
    );
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return transactions;
}

export async function listTransactionsForReport(fromDate, toDate) {
  const pageSize = 100;
  const categoryNames = new Map(
    (await listCategories()).map((category) => [category.id, category.name]),
  );
  const transactions = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, amount, currency_code, category_id, transaction_date, description")
      .gte("transaction_date", fromDate)
      .lte("transaction_date", toDate)
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    transactions.push(...page.map((transaction) => ({
      ...transaction,
      amount: Number(transaction.amount),
      category_name: categoryNames.get(transaction.category_id) || "Uncategorized",
    })));
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return transactions;
}

export async function getTransactionSummary(fromDate, toDate) {
  const { data, error } = await supabase.rpc("transaction_summary", {
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
  });

  if (error) {
    throw error;
  }

  return (data || []).map((item) => ({
    currencyCode: item.currency_code,
    type: item.type,
    amount: Number(item.total_amount),
    count: Number(item.transaction_count),
  }));
}

export async function listMonthlySpendingByDate(userId, fromDate, toDate) {
  const { data, error } = await supabase
    .from("transactions")
    .select("transaction_date, amount, currency_code")
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("transaction_date", fromDate)
    .lte("transaction_date", toDate)
    .order("transaction_date");

  if (error) {
    throw error;
  }

  return (data || []).map((item) => ({
    date: item.transaction_date,
    amount: Number(item.amount),
    currencyCode: item.currency_code,
  }));
}

export async function saveTransaction({
  userId,
  transactionId,
  values,
  existingReceiptPath,
  receiptFile,
  removeExistingReceipt,
}) {
  let uploadedPath = null;
  if (receiptFile) {
    uploadedPath = await uploadReceipt(userId, receiptFile);
  }

  const receiptPath = uploadedPath
    || (removeExistingReceipt ? null : existingReceiptPath || null);
  const record = {
    user_id: userId,
    type: values.type,
    amount: values.amount,
    currency_code: values.currencyCode,
    category_id: values.categoryId,
    transaction_date: values.date,
    description: values.description.trim() || null,
    receipt_path: receiptPath,
  };

  const result = transactionId
    ? await supabase
        .from("transactions")
        .update(record)
        .eq("id", transactionId)
        .eq("user_id", userId)
        .select()
        .single()
    : await supabase.from("transactions").insert(record).select().single();

  if (result.error) {
    if (uploadedPath) {
      const cleanupError = await removeReceipt(uploadedPath);
      if (cleanupError) {
        console.error("Could not clean up an unlinked receipt:", cleanupError);
        const cleanupFailure = new Error(
          "The transaction could not be saved, and its uploaded receipt could not be cleaned up. Please try again or contact support.",
        );
        cleanupFailure.code = "RECEIPT_CLEANUP";
        throw cleanupFailure;
      }
    }
    throw result.error;
  }

  let cleanupWarning = "";
  const replacedReceipt = uploadedPath && existingReceiptPath;
  const removedReceipt = removeExistingReceipt && existingReceiptPath;
  if (replacedReceipt || removedReceipt) {
    const cleanupError = await removeReceipt(existingReceiptPath);
    if (cleanupError) {
      console.error("Could not remove a replaced receipt:", cleanupError);
      cleanupWarning =
        "The transaction was saved, but its previous receipt could not be removed.";
    }
  }

  return { transaction: result.data, cleanupWarning };
}

export async function deleteTransaction(transaction) {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transaction.id);

  if (error) {
    throw error;
  }

  if (!transaction.receipt_path) {
    return "";
  }

  const cleanupError = await removeReceipt(transaction.receipt_path);
  if (cleanupError) {
    console.error("Could not remove a deleted transaction receipt:", cleanupError);
    return "The transaction was deleted, but its receipt file could not be removed.";
  }

  return "";
}

export async function getReceiptUrl(path) {
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, 60);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

export async function listRecurringRules() {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(
      "id, user_id, type, amount, currency_code, category_id, description, frequency, start_date, end_date, next_due_date, active, paused, created_at",
    )
    .order("next_due_date")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

function getClientTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export async function repairDueRecurringRuleSchedules() {
  const { data, error } = await supabase.rpc(
    "repair_due_recurring_rule_schedules",
    { p_timezone: getClientTimeZone() },
  );

  if (error) {
    throw error;
  }

  return Number(data || 0);
}

export async function listDueRecurringOccurrences() {
  const { data, error } = await supabase.rpc(
    "list_due_recurring_occurrences",
    { p_timezone: getClientTimeZone() },
  );

  if (error) {
    throw error;
  }

  return (data || []).map((item) => ({
    ruleId: item.rule_id,
    type: item.transaction_type,
    amount: Number(item.amount),
    currencyCode: item.currency_code,
    categoryId: item.category_id,
    categoryName: item.category_name,
    description: item.description,
    frequency: item.frequency,
    occurrenceDate: item.occurrence_date,
  }));
}

export async function saveRecurringRule(ruleId, values) {
  const { data, error } = await supabase.rpc("save_recurring_rule", {
    p_rule_id: ruleId,
    p_type: values.type,
    p_amount: values.amount,
    p_currency_code: values.currencyCode,
    p_category_id: values.categoryId,
    p_description: values.description.trim() || null,
    p_frequency: values.frequency,
    p_start_date: values.startDate,
    p_end_date: values.endDate || null,
    p_timezone: getClientTimeZone(),
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function setRecurringRuleActive(ruleId, active) {
  const { data, error } = await supabase
    .from("recurring_rules")
    .update({ paused: !active })
    .eq("id", ruleId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteRecurringRule(ruleId) {
  const { error } = await supabase
    .from("recurring_rules")
    .delete()
    .eq("id", ruleId);

  if (error) {
    throw error;
  }
}

export async function recordDueRecurringTransactions(occurrences) {
  const { data, error } = await supabase.rpc(
    "record_due_recurring_transactions",
    {
      p_occurrences: occurrences.map((occurrence) => ({
        rule_id: occurrence.ruleId,
        occurrence_date: occurrence.occurrenceDate,
      })),
      p_timezone: getClientTimeZone(),
    },
  );

  if (error) {
    throw error;
  }

  return Number(data || 0);
}

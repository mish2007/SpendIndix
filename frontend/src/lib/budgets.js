import { supabase } from "./supabaseClient";

const BUDGET_FIELDS =
  "id, user_id, category_id, month_start, amount, currency_code, created_at, updated_at";

export function getBudgetErrorMessage(error, fallback) {
  const code = error?.code;
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (code === "23505") {
    return "A budget already exists for this category and month.";
  }
  if (code === "23514") {
    return "Budgets can only use an expense category and a valid month.";
  }
  if (code === "23503") {
    return "This expense category is no longer available. Refresh and choose another.";
  }
  if (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    message.includes("schema cache")
  ) {
    return "The Budgets database migration is not available yet. Apply the new budgets migration, then try again.";
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

export async function listMonthlyBudgets(userId, monthStart) {
  const { data, error } = await supabase
    .from("budgets")
    .select(BUDGET_FIELDS)
    .eq("user_id", userId)
    .eq("month_start", monthStart)
    .order("created_at");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function listMonthlyExpenseTotals(monthStart) {
  const { data, error } = await supabase.rpc("budget_month_expense_totals", {
    p_month_start: monthStart,
  });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    categoryId: row.category_id,
    currencyCode: row.currency_code,
    amount: Number(row.total_amount),
    transactionCount: Number(row.transaction_count),
  }));
}

export async function saveBudget(userId, budgetId, values) {
  const record = {
    user_id: userId,
    category_id: values.categoryId,
    month_start: values.monthStart,
    amount: values.amount,
  };

  const result = budgetId
    ? await supabase
        .from("budgets")
        .update(record)
        .eq("id", budgetId)
        .eq("user_id", userId)
        .select(BUDGET_FIELDS)
        .single()
    : await supabase
        .from("budgets")
        .insert({ ...record, currency_code: values.currencyCode })
        .select(BUDGET_FIELDS)
        .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function deleteBudget(userId, budgetId) {
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", budgetId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

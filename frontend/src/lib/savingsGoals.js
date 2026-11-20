import { supabase } from "./supabaseClient";

const GOAL_FIELDS =
  "id, user_id, name, target_amount, initial_amount, currency_code, target_date, description, created_at, updated_at";
const CONTRIBUTION_FIELDS =
  "id, user_id, goal_id, amount, contribution_date, note, created_at";

export function getSavingsGoalErrorMessage(error, fallback) {
  const code = error?.code;
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (code === "42501") {
    return "Your session may have expired. Sign in again and retry.";
  }
  if (code === "23514") {
    if (message.includes("contribution exceeds")) {
      return "That contribution is greater than the amount remaining for this goal.";
    }
    if (message.includes("currency cannot be changed")) {
      return "A goal's currency cannot be changed after savings have been recorded.";
    }
    if (message.includes("target amount cannot be lower")) {
      return "The target cannot be lower than the amount already saved.";
    }
    return "Check the goal amounts and make sure the target is not below the amount saved.";
  }
  if (code === "23503") {
    return "This goal is no longer available. Refresh the page and try again.";
  }
  if (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    message.includes("schema cache")
  ) {
    return "The Savings Goals database migration is not available yet. Apply the savings goals migration, then try again.";
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

export async function listSavingsGoals(userId) {
  const { data, error } = await supabase
    .from("savings_goals")
    .select(GOAL_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function listSavingsContributions(
  userId,
  goalIds,
  fromDate = null,
  toDate = null,
) {
  if (!goalIds.length) {
    return [];
  }

  let query = supabase
    .from("savings_contributions")
    .select(CONTRIBUTION_FIELDS)
    .eq("user_id", userId)
    .in("goal_id", goalIds);
  if (fromDate) {
    query = query.gte("contribution_date", fromDate);
  }
  if (toDate) {
    query = query.lte("contribution_date", toDate);
  }
  const { data, error } = await query
    .order("contribution_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function saveSavingsGoal(userId, goalId, values) {
  const record = {
    name: values.name.trim(),
    target_amount: values.targetAmount,
    target_date: values.targetDate || null,
    description: values.description.trim() || null,
  };
  const result = goalId
    ? await supabase
        .from("savings_goals")
        .update(record)
        .eq("id", goalId)
        .eq("user_id", userId)
        .select(GOAL_FIELDS)
        .single()
    : await supabase
        .from("savings_goals")
        .insert({
          ...record,
          user_id: userId,
          initial_amount: 0,
          currency_code: values.currencyCode,
        })
        .select(GOAL_FIELDS)
        .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function addSavingsContribution(userId, goalId, values) {
  const contribution = {
    user_id: userId,
    goal_id: goalId,
    amount: values.amount,
    note: values.note.trim() || null,
  };
  if (values.date) {
    contribution.contribution_date = values.date;
  }

  const { data, error } = await supabase
    .from("savings_contributions")
    .insert(contribution)
    .select(CONTRIBUTION_FIELDS)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSavingsContribution(userId, contributionId) {
  const { error } = await supabase
    .from("savings_contributions")
    .delete()
    .eq("id", contributionId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function deleteSavingsGoal(userId, goalId) {
  const { error } = await supabase
    .from("savings_goals")
    .delete()
    .eq("id", goalId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

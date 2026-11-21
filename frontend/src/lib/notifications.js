import { supabase } from "./supabaseClient";

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({ budgets: true, goals: true, recurring: true });
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function decodeVapidKey(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "="));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function getBrowserPushStatus(userId) {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription || !userId) return { supported: true, permission: Notification.permission, subscribed: false };
  const { data, error } = await supabase.from("push_subscriptions").select("id").eq("user_id", userId).eq("endpoint", subscription.endpoint).maybeSingle();
  if (error) throw error;
  return { supported: true, permission: Notification.permission, subscribed: Boolean(data) };
}

export async function enableBrowserPush(userId) {
  if (!pushSupported()) throw new Error("This browser or device does not support web push notifications.");
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error("This deployed build does not contain the VAPID public key. In Netlify, make sure VITE_VAPID_PUBLIC_KEY is available to Builds, then publish a new deploy.");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked. Allow them in this site’s browser permissions, then try again." : "Notification permission was not granted.");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
  const payload = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({ user_id: userId, endpoint: subscription.endpoint, p256dh: payload.keys?.p256dh, auth_secret: payload.keys?.auth, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) {
    await subscription.unsubscribe();
    throw new Error(error.code === "42501" || error.code === "23505" ? "This browser subscription belonged to another SpendIndix account and was removed from this device. Enable push again to link it to this account." : error.message);
  }
  return true;
}

export async function disableBrowserPush(userId) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}

export async function listNotifications(userId) {
  const { data, error } = await supabase.from("in_app_notifications").select("id, kind, title, body, source_key, created_at, read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function evaluateNotifications(userId, preferences) {
  const enabled = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences };
  const candidates = [];
  const now = new Date();
  const today = localDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  if (enabled.budgets) {
    const [{ data: budgets, error: budgetError }, { data: spending, error: spendError }] = await Promise.all([
      supabase.from("budgets").select("id, category_id, amount, currency_code, month_start").eq("user_id", userId).eq("month_start", monthStart),
      supabase.from("transactions").select("category_id, amount, currency_code").eq("user_id", userId).eq("type", "expense").gte("transaction_date", monthStart).lte("transaction_date", today),
    ]);
    if (budgetError) throw budgetError;
    if (spendError) throw spendError;
    for (const budget of budgets || []) {
      const used = (spending || []).filter((row) => row.category_id === budget.category_id && row.currency_code === budget.currency_code).reduce((sum, row) => sum + Number(row.amount), 0);
      const ratio = used / Number(budget.amount);
      const { data: category } = await supabase.from("categories").select("name").eq("id", budget.category_id).maybeSingle();
      for (const threshold of [80, 100]) {
        if (ratio >= threshold) candidates.push({ kind: "budget", source_key: `budget:${budget.id}:${threshold}`, title: threshold === 80 ? "Budget warning" : "Budget exceeded", body: `${category?.name || "A budget"} is at ${Math.round(ratio)}% of its monthly limit.` });
      }
    }
  }
  if (enabled.goals) {
    const { data: goals, error } = await supabase.from("savings_goals").select("id, name, target_amount, initial_amount").eq("user_id", userId);
    if (error) throw error;
    for (const goal of goals || []) {
      const { data: rows, error: contributionError } = await supabase.from("savings_contributions").select("amount").eq("user_id", userId).eq("goal_id", goal.id);
      if (contributionError) throw contributionError;
      const saved = Number(goal.initial_amount || 0) + (rows || []).reduce((sum, row) => sum + Number(row.amount), 0);
      const ratio = saved / Number(goal.target_amount);
      for (const milestone of [50, 75, 100]) if (ratio >= milestone) candidates.push({ kind: "goal", source_key: `goal:${goal.id}:${milestone}`, title: milestone === 100 ? "Savings goal completed" : `Savings milestone: ${milestone}%`, body: `${goal.name} has reached ${Math.min(100, Math.round(ratio))}% of its target.` });
    }
  }
  if (enabled.recurring) {
    const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrow = localDate(tomorrowDate);
    const { data: rules, error } = await supabase.from("recurring_rules").select("id, description, amount, currency_code, next_due_date").eq("user_id", userId).eq("active", true).eq("paused", false).eq("next_due_date", tomorrow);
    if (error) throw error;
    for (const rule of rules || []) candidates.push({ kind: "recurring", source_key: `recurring:${rule.id}:${rule.next_due_date}`, title: "Upcoming recurring payment", body: `${rule.description || "Recurring payment"} (${rule.currency_code} ${rule.amount}) is due tomorrow.` });
  }
  if (!candidates.length) return;
  const { error } = await supabase.from("in_app_notifications").upsert(candidates.map((item) => ({ ...item, user_id: userId })), { onConflict: "user_id,source_key", ignoreDuplicates: true });
  if (error) throw error;
}

export async function markNotificationRead(userId, id) {
  const { error } = await supabase.from("in_app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function clearNotifications(userId) {
  const { error } = await supabase.from("in_app_notifications").delete().eq("user_id", userId);
  if (error) throw error;
}

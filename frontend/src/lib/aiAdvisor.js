import { supabase } from "./supabaseClient";

export async function requestAdvisorResponse(mode, messages = []) {
  const { data, error } = await supabase.functions.invoke("ai-advisor", {
    body: { mode, ...(mode === "chat" ? { messages } : {}) },
  });
  if (error) {
    let message = "The AI Advisor request failed. Check your connection and try again.";
    try {
      const response = error.context;
      if (response instanceof Response) {
        const body = await response.clone().json();
        if (typeof body?.error === "string") message = body.error;
      }
    } catch {
      // Keep the safe fallback for network and non-JSON errors.
    }
    throw new Error(message);
  }
  if (typeof data?.answer !== "string" || !data.answer.trim()) {
    throw new Error(typeof data?.error === "string" ? data.error : "The AI Advisor returned an empty response. Try again.");
  }
  return data.answer.trim();
}

import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { requestAdvisorResponse } from "../lib/aiAdvisor";
import "./Advisor.css";

const PROMPTS = [
  "Where am I spending the most money?",
  "Am I staying within my budgets?",
  "How can I reach my savings goals faster?",
  "How have my expenses changed recently?",
];

export default function Advisor() {
  const { user } = useAuth();
  const consentKey = useMemo(() => `spendindix-ai-consent-${user?.id || "guest"}`, [user?.id]);
  const [consent, setConsent] = useState(() => window.localStorage.getItem(consentKey) === "accepted");
  const [summary, setSummary] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [chat, setChat] = useState([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const enableAdvisor = (event) => {
    const checked = event.target.checked;
    setConsent(checked);
    if (checked) window.localStorage.setItem(consentKey, "accepted");
    else {
      window.localStorage.removeItem(consentKey);
      setSummary(""); setSuggestions(""); setChat([]);
      setInsightsError(""); setChatError("");
    }
  };

  const generateInsights = async () => {
    setInsightsLoading(true); setInsightsError("");
    try {
      const [nextSummary, nextSuggestions] = await Promise.all([
        requestAdvisorResponse("summary"),
        requestAdvisorResponse("suggestions"),
      ]);
      setSummary(nextSummary); setSuggestions(nextSuggestions);
    } catch (error) {
      setInsightsError(error.message || "We couldn't generate your financial insights. Try again.");
    } finally { setInsightsLoading(false); }
  };

  const askQuestion = async (event, suggestedQuestion = "") => {
    event?.preventDefault();
    const text = (suggestedQuestion || question).trim();
    if (!text || !consent || chatLoading) return;
    setChatLoading(true); setChatError("");
    const nextMessages = [...chat, { role: "user", content: text }].slice(-10);
    try {
      const answer = await requestAdvisorResponse("chat", nextMessages);
      setChat([...nextMessages, { role: "assistant", content: answer }]);
      setQuestion("");
    } catch (error) {
      setChatError(error.message || "We couldn't send your question. Try again.");
    } finally { setChatLoading(false); }
  };

  return <main className="advisor-page">
    <header className="advisor-header"><div><p className="advisor-eyebrow">PERSONAL FINANCE, WITH CONTEXT</p><h1>AI Financial Advisor</h1><p>Ask questions and get insights grounded in your SpendIndix records.</p></div><span className="advisor-model-badge">Gemini AI</span></header>
    <section className="advisor-privacy" aria-labelledby="advisor-privacy-title"><div className="advisor-privacy-copy"><h2 id="advisor-privacy-title">Your data and AI</h2><p>When enabled, SpendIndix sends 12 months of totals grouped by currency and category, current budgets, goal progress, and your chat messages to Google Gemini. Transaction descriptions, IDs, and account identifiers are not sent. Google’s Gemini free tier may use submitted content to improve its products. Avoid sharing identifying details in chat. <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Review Gemini API data terms</a>.</p></div><label className="advisor-consent"><input type="checkbox" checked={consent} onChange={enableAdvisor} /><span>I understand and want to enable AI processing for this account in this browser.</span></label></section>
    {!consent ? <div className="advisor-locked" role="status"><span aria-hidden="true">✦</span><div><h2>Enable AI to continue</h2><p>Your financial records are not sent until you opt in above.</p></div></div> : <>
      <section className="advisor-insights-grid" aria-label="AI financial insights">
        <article className="advisor-card advisor-insight-card"><div className="advisor-card-heading"><div><span className="advisor-card-kicker">YOUR MONEY, SUMMARIZED</span><h2>AI Financial Summary</h2></div><span className="advisor-sparkle" aria-hidden="true">✦</span></div>{summary ? <div className="advisor-response">{summary}</div> : <p className="advisor-empty">Generate a summary of your cash flow, spending patterns, budgets and savings progress.</p>}</article>
        <article className="advisor-card advisor-insight-card"><div className="advisor-card-heading"><div><span className="advisor-card-kicker">SMALL STEPS, GROUNDED IN YOUR DATA</span><h2>Financial Suggestions</h2></div><span className="advisor-sparkle" aria-hidden="true">✧</span></div>{suggestions ? <div className="advisor-response">{suggestions}</div> : <p className="advisor-empty">Get specific ideas based on your actual spending and financial goals.</p>}</article>
      </section>
      <div className="advisor-generate-row"><button className="advisor-primary-button" onClick={() => void generateInsights()} disabled={insightsLoading} aria-busy={insightsLoading}>{insightsLoading ? "Analyzing your data…" : summary || suggestions ? "Refresh insights" : "Generate my insights"}</button>{insightsError && <p className="advisor-error" role="alert">{insightsError}</p>}</div>
      <section className="advisor-card advisor-chat-card"><div className="advisor-card-heading"><div><span className="advisor-card-kicker">ASK ABOUT YOUR FINANCES</span><h2>Ask AI</h2></div><span className="advisor-chat-status">Uses your latest data</span></div><div className="advisor-conversation" aria-live="polite">{chat.length === 0 ? <div className="advisor-chat-empty"><p>Ask a question about your recorded finances.</p><div className="advisor-question-chips">{PROMPTS.map((prompt) => <button key={prompt} onClick={(event) => void askQuestion(event, prompt)} disabled={chatLoading}>{prompt}</button>)}</div></div> : chat.map((message, index) => <article className={`advisor-message is-${message.role}`} key={`${index}-${message.role}`}><span>{message.role === "user" ? "You" : "AI Advisor"}</span><p>{message.content}</p></article>)}{chatLoading && <div className="advisor-message is-assistant" role="status"><span>AI Advisor</span><p className="advisor-thinking">Reviewing your financial context…</p></div>}</div>{chatError && <p className="advisor-error" role="alert">{chatError}</p>}<form className="advisor-chat-form" onSubmit={(event) => void askQuestion(event)}><label className="advisor-visually-hidden" htmlFor="advisor-question">Ask a financial question</label><textarea id="advisor-question" rows="2" maxLength="700" placeholder="Ask about your spending, budgets or savings goals…" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={chatLoading} /><button className="advisor-primary-button" type="submit" disabled={!question.trim() || chatLoading}>{chatLoading ? "Sending…" : "Send"}</button></form></section>
    </>}
    <p className="advisor-disclaimer">AI responses may be incomplete. Check important calculations against your SpendIndix records and use your own judgment.</p>
  </main>;
}

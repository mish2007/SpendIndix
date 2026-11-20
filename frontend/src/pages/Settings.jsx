import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { getCurrencySettings } from "../lib/currency";
import { loadCurrencyOptions } from "../data/currencyData";
import "./Settings.css";

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currencies, setCurrencies] = useState([]);
  const [currency, setCurrency] = useState(() => getCurrencySettings(user).code);
  const [loadingCurrencies, setLoadingCurrencies] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadCurrencyOptions().then((options) => {
      if (active) setCurrencies(options.filter((option) => /^[A-Z]{3}$/.test(option.code)).sort((a, b) => a.code.localeCompare(b.code)));
    }).catch(() => {
      if (active) setError("Currency options could not be loaded. Refresh the page and try again.");
    }).finally(() => { if (active) setLoadingCurrencies(false); });
    return () => { active = false; };
  }, []);

  const saveCurrency = async (event) => {
    event.preventDefault();
    if (!currencies.some((option) => option.code === currency)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ data: { currency_code: currency } });
      if (updateError) throw updateError;
      setMessage(`Your default currency is now ${currency}. Existing records were not changed.`);
    } catch {
      setError("Currency preference could not be saved. Check your connection and try again.");
    } finally { setSaving(false); }
  };

  const signOut = async () => {
    setSigningOut(true); setError("");
    try {
      const { error: logoutError } = await logout();
      if (logoutError) throw logoutError;
      navigate("/login", { replace: true });
    } catch {
      setError("We couldn't log you out. Please try again.");
      setSigningOut(false);
    }
  };

  return <main className="settings-page">
    <header className="settings-heading"><p className="settings-eyebrow">PREFERENCES & ACCOUNT</p><h1>Settings</h1><p>Manage defaults for your SpendIndix account.</p></header>
    {error && <p className="settings-message is-error" role="alert">{error}</p>}
    {message && <p className="settings-message is-success" role="status">{message}</p>}
    <section className="settings-card"><div className="settings-section-heading"><span className="settings-icon" aria-hidden="true">¤</span><div><h2>Currency preference</h2><p>Used as the default for new transactions, budgets and savings goals.</p></div></div>
      <form className="settings-currency-form" onSubmit={saveCurrency}><label htmlFor="settings-currency">Preferred currency</label><div className="settings-currency-controls"><select id="settings-currency" value={currency} disabled={loadingCurrencies || saving || currencies.length === 0} onChange={(event) => { setCurrency(event.target.value); setMessage(""); }}><option value={currency}>{currency} — current preference</option>{currencies.filter((option) => option.code !== currency).map((option) => <option key={option.code} value={option.code}>{option.code} — {option.name}</option>)}</select><button type="submit" disabled={loadingCurrencies || saving || currency === getCurrencySettings(user).code}>{saving ? "Saving…" : "Save currency"}</button></div><small>Changing this preference affects future entries only. Existing records and their currencies remain unchanged.</small></form>
    </section>
    <section className="settings-card"><div className="settings-section-heading"><span className="settings-icon" aria-hidden="true">◐</span><div><h2>Appearance</h2><p>SpendIndix currently uses its standard light appearance across the app.</p></div></div><p className="settings-note">A theme preference is not available yet.</p></section>
    <section className="settings-card"><div className="settings-section-heading"><span className="settings-icon" aria-hidden="true">♧</span><div><h2>Notifications</h2><p>There are no in-app or browser notifications to configure yet.</p></div></div><p className="settings-note">No notification permission is requested.</p></section>
    <section className="settings-card settings-account"><div className="settings-section-heading"><span className="settings-icon" aria-hidden="true">↪</span><div><h2>Account and session</h2><p>Signed in as {user?.email || "your account"}.</p></div></div><button className="settings-logout" type="button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Logging out…" : "Log out"}</button></section>
  </main>;
}

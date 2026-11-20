import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (typeof supabaseUrl !== "string" || !supabaseUrl.trim()) {
  throw new Error(
    "Missing required environment variable: VITE_SUPABASE_URL",
  );
}

if (
  typeof supabasePublishableKey !== "string" ||
  !supabasePublishableKey.trim()
) {
  throw new Error(
    "Missing required environment variable: VITE_SUPABASE_PUBLISHABLE_KEY",
  );
}

const REMEMBER_ME_STORAGE_KEY = "spendindix-auth-remember-me";
let authStorageKey = null;

function getPendingRememberMe() {
  const value = window.sessionStorage.getItem(REMEMBER_ME_STORAGE_KEY);
  return value === "true" ? true : value === "false" ? false : null;
}

function isGoogleOAuthCallback() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));

  return (
    window.location.pathname === "/dashboard" &&
    (searchParams.has("code") ||
      hashParams.has("access_token") ||
      hashParams.has("refresh_token"))
  );
}

const authStorage = {
  getItem(key) {
    authStorageKey = key;
    const sessionValue = window.sessionStorage.getItem(key);
    return sessionValue ?? window.localStorage.getItem(key);
  },
  setItem(key, value) {
    authStorageKey = key;
    const pendingRememberMe =
      isGoogleOAuthCallback() ? getPendingRememberMe() : null;
    const useSessionStorage =
      pendingRememberMe === null
        ? window.sessionStorage.getItem(key) !== null
        : !pendingRememberMe;
    const targetStorage = useSessionStorage
      ? window.sessionStorage
      : window.localStorage;
    const otherStorage = useSessionStorage
      ? window.localStorage
      : window.sessionStorage;

    targetStorage.setItem(key, value);
    otherStorage.removeItem(key);

    if (pendingRememberMe !== null) {
      window.sessionStorage.removeItem(REMEMBER_ME_STORAGE_KEY);
    }
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export function setNextSignInRememberMe(rememberMe) {
  window.sessionStorage.setItem(
    REMEMBER_ME_STORAGE_KEY,
    String(rememberMe),
  );
}

export function clearNextSignInRememberMe() {
  window.sessionStorage.removeItem(REMEMBER_ME_STORAGE_KEY);
}

export function persistCurrentAuthSession(rememberMe) {
  if (!authStorageKey) {
    return false;
  }

  const sessionValue =
    window.sessionStorage.getItem(authStorageKey) ??
    window.localStorage.getItem(authStorageKey);

  if (sessionValue === null) {
    return false;
  }

  const targetStorage = rememberMe
    ? window.localStorage
    : window.sessionStorage;
  const otherStorage = rememberMe
    ? window.sessionStorage
    : window.localStorage;

  targetStorage.setItem(authStorageKey, sessionValue);
  otherStorage.removeItem(authStorageKey);
  return true;
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
  },
});

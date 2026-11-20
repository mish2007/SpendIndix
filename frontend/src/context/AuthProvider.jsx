import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearNextSignInRememberMe,
  supabase,
} from "../lib/supabaseClient";
import { AuthContext } from "./AuthContext";

const PASSWORD_RECOVERY_SESSION_KEY = "spendindix-password-recovery";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let authStateChangeCount = 0;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authStateChangeCount += 1;

      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        const isVerifiedRecovery = Boolean(nextSession);
        setIsPasswordRecovery(isVerifiedRecovery);
        if (isVerifiedRecovery) {
          window.sessionStorage.setItem(
            PASSWORD_RECOVERY_SESSION_KEY,
            nextSession.user.id,
          );
        } else {
          window.sessionStorage.removeItem(PASSWORD_RECOVERY_SESSION_KEY);
        }
      } else if (event === "SIGNED_IN") {
        const recoveryUserId = window.sessionStorage.getItem(
          PASSWORD_RECOVERY_SESSION_KEY,
        );
        const isSameRecoveryUser =
          Boolean(nextSession) && nextSession.user.id === recoveryUserId;
        setIsPasswordRecovery(isSameRecoveryUser);
        if (!isSameRecoveryUser) {
          window.sessionStorage.removeItem(PASSWORD_RECOVERY_SESSION_KEY);
        }
      } else if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
        window.sessionStorage.removeItem(PASSWORD_RECOVERY_SESSION_KEY);
      } else if (event === "INITIAL_SESSION") {
        const isVerifiedRecovery =
          Boolean(nextSession) &&
          window.sessionStorage.getItem(PASSWORD_RECOVERY_SESSION_KEY) ===
            nextSession.user.id;
        setIsPasswordRecovery(isVerifiedRecovery);
        if (!nextSession) {
          window.sessionStorage.removeItem(PASSWORD_RECOVERY_SESSION_KEY);
        }
      }
      setAuthError("");
      setIsLoading(false);
    });

    const initialAuthStateChangeCount = authStateChangeCount;

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (
          isMounted &&
          authStateChangeCount === initialAuthStateChangeCount
        ) {
          setSession(data.session);
          setAuthError("");
        }
      } catch {
        if (
          isMounted &&
          authStateChangeCount === initialAuthStateChangeCount
        ) {
          setSession(null);
          setAuthError(
            "We couldn't verify your session. Please refresh and try again.",
          );
        }
      } finally {
        clearNextSignInRememberMe();

        if (
          isMounted &&
          authStateChangeCount === initialAuthStateChangeCount
        ) {
          setIsLoading(false);
        }
      }
    };

    void restoreSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
      return { error };
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      authError,
      isPasswordRecovery,
      logout,
    }),
    [session, isLoading, authError, isPasswordRecovery, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

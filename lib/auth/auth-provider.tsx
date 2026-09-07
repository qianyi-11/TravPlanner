"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { signInWithGoogle, signOutUser, getFirebaseAuth } from "@/lib/firebase/auth";
import { initializeFirebaseAppCheck } from "@/lib/firebase/app-check";
import { toUserMessage } from "@/lib/errors";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      initializeFirebaseAppCheck();
      return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      }, () => {
        setError("Unable to restore your sign-in session.");
        setLoading(false);
      });
    } catch (cause) {
      queueMicrotask(() => {
        setError(toUserMessage(cause, "Firebase is not configured."));
        setLoading(false);
      });
      return undefined;
    }
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    signIn: async () => {
      setError(null);
      try { await signInWithGoogle(); } catch (cause) {
        setError(toUserMessage(cause, "Google sign-in failed."));
      }
    },
    signOut: async () => {
      try { await signOutUser(); } catch (cause) {
        setError(toUserMessage(cause, "Sign-out failed."));
      }
    },
  }), [error, loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

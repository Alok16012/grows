import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { api, setAuthToken } from "./api";
import { TOKEN_KEY, USER_KEY } from "./config";
import type { AuthUser } from "./types";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  bootstrapping: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: (u: AuthUser) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // Restore a persisted session on cold start.
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (savedToken && savedUser) {
          setAuthToken(savedToken);
          setToken(savedToken);
          setUser(JSON.parse(savedUser) as AuthUser);
        }
      } catch {
        // Corrupt store — treat as logged out.
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const res = await api<{ token: string; user: AuthUser }>("/api/mobile/login", {
      method: "POST",
      body: { identifier, password },
    });
    setAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, res.token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(res.user)),
    ]);
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  }, []);

  const refreshUser = useCallback((u: AuthUser) => {
    setUser(u);
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, bootstrapping, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

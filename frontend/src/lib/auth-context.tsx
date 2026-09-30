import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, TOKEN_KEY } from "./api-client";
import type { AuthUser } from "../types/task";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!token);

  // On first load (or when a token appears), hydrate the current user.
  useEffect(() => {
    let active = true;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient
      .getMe()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const persistToken = useCallback((newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await apiClient.login(email, password);
      persistToken(access_token);
      const me = await apiClient.getMe();
      setUser(me);
    },
    [persistToken],
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await apiClient.signup(email, password);
      persistToken(access_token);
      const me = await apiClient.getMe();
      setUser(me);
    },
    [persistToken],
  );

  const logout = useCallback(() => {
    // Revoke server-side first so a copied token stops working too. Fire and
    // forget: local sign-out must not wait on, or fail with, the network.
    apiClient.logout().catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, signup, logout }),
    [user, token, loading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

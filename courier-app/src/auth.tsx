import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, type Courier } from "./api";

interface AuthState {
  courier: Courier | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(Ctx);

const KEY = "courier";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [courier, setCourier] = useState<Courier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Trust the server session first; fall back to the cached identity.
        const { courier } = await api.me();
        setCourier(courier);
        await AsyncStorage.setItem(KEY, JSON.stringify(courier));
      } catch {
        const cached = await AsyncStorage.getItem(KEY);
        setCourier(cached ? JSON.parse(cached) : null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value: AuthState = {
    courier,
    loading,
    login: async (l, p) => {
      const { courier } = await api.login(l, p);
      setCourier(courier);
      await AsyncStorage.setItem(KEY, JSON.stringify(courier));
    },
    logout: async () => {
      await api.logout().catch(() => {});
      setCourier(null);
      await AsyncStorage.removeItem(KEY);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

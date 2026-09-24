"use client";

import { createContext, useContext } from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { DEV_SESSION } from "@/lib/auth-mode";

const AuthBypassContext = createContext<boolean>(false);

export function useAuthBypass(): boolean {
  return useContext(AuthBypassContext);
}

interface AuthProviderProps {
  children: React.ReactNode;
  bypass?: boolean;
}

export function AuthProvider({ children, bypass = false }: AuthProviderProps) {
  if (bypass) {
    return (
      <AuthBypassContext.Provider value={true}>
        <SessionProvider
          session={DEV_SESSION as Session}
          refetchOnWindowFocus={false}
          refetchInterval={0}
        >
          {children}
        </SessionProvider>
      </AuthBypassContext.Provider>
    );
  }

  return (
    <AuthBypassContext.Provider value={false}>
      <SessionProvider>{children}</SessionProvider>
    </AuthBypassContext.Provider>
  );
}

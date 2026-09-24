"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { loginRedirect } from "@/lib/login-navigation";
import { useAuthBypass } from "@/components/auth/auth-provider";

export function useLoginRedirect(status: "loading" | "authenticated" | "unauthenticated", sessionError?: string) {
  const router = useRouter();
  const hadSession = useRef(false);
  const bypass = useAuthBypass();

  useEffect(() => {
    if (bypass) return;
    if (status === "authenticated") hadSession.current = true;
    if (status === "unauthenticated" || sessionError === "SessionInvalid") {
      router.replace(loginRedirect(window.location, hadSession.current || sessionError === "SessionInvalid"));
    }
  }, [status, sessionError, router, bypass]);
}

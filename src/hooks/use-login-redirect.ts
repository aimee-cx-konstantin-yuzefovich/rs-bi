"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { loginRedirect } from "@/lib/login-navigation";

export function useLoginRedirect(status: "loading" | "authenticated" | "unauthenticated", sessionError?: string) {
  const router = useRouter();
  const hadSession = useRef(false);
  useEffect(() => {
    if (status === "authenticated") hadSession.current = true;
    if (status === "unauthenticated" || sessionError === "SessionInvalid") {
      router.replace(loginRedirect(window.location, hadSession.current || sessionError === "SessionInvalid"));
    }
  }, [status, sessionError, router]);
}

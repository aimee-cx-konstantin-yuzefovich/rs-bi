"use client";

import { useState, useEffect } from "react";
import { signIn, getCsrfToken, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BarChart3, Eye, EyeOff, AlertCircle, Loader2, ShieldAlert, ExternalLink } from "lucide-react";
import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT, BI_URL } from "@/lib/config";

/**
 * Login Page — RusSilica BI Terminal
 *
 * Production mode:
 * - Shows "Redirecting to corporate portal..." message
 * - Auto-redirects to WordPress login page
 * - After WP login, WordPress redirects back to /api/auth/wp-callback
 * - WP callback creates NextAuth session automatically
 *
 * Development mode:
 * - Shows a simple login form with @russilica.ru email + dev password
 * - No WordPress needed for development/testing
 */

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Fetch CSRF token on mount
  useEffect(() => {
    let cancelled = false;
    getCsrfToken().then(token => {
      if (!cancelled) setCsrfToken(token ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  // Production: Auto-redirect to WordPress login after a short delay
  useEffect(() => {
    if (IS_PRODUCTION && status === "unauthenticated") {
      const timer = setTimeout(() => {
        const callbackUrl = encodeURIComponent(`${BI_URL}/api/auth/wp-callback`);
        const wpLoginUrl = `${WP_LOGIN_URL_CLIENT}?redirect_to=${callbackUrl}`;
        window.location.href = wpLoginUrl;
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        csrfToken: csrfToken || undefined,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Произошла ошибка при входе. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }} />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 mb-4 shadow-lg shadow-orange-500/20">
            <BarChart3 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            RusSilica BI Terminal
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Корпоративная аналитика CRM
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Security notice */}
          <div className="flex items-center gap-2 px-3 py-2 mb-5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>Вход через корпоративный портал WordPress</span>
          </div>

          {IS_PRODUCTION ? (
            /* ─── PRODUCTION MODE: WordPress redirect ─── */
            <div className="text-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto mb-4" />
              <p className="text-white text-sm mb-2">
                Переадресация на корпоративный портал...
              </p>
              <p className="text-slate-500 text-xs mb-4">
                Авторизация через WordPress
              </p>
              <a
                href={`${WP_LOGIN_URL_CLIENT}?redirect_to=${encodeURIComponent(`${BI_URL}/api/auth/wp-callback`)}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm hover:bg-amber-500/30 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Открыть страницу входа
              </a>
            </div>
          ) : (
            /* ─── DEVELOPMENT MODE: Simple login form ─── */
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 mb-4 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400">
                <span className="font-medium">DEV MODE</span>
                <span className="text-amber-500">—</span>
                <span>В продакшене вход через WordPress</span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Error message */}
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 animate-fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Email field */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="имя@russilica.ru"
                    required
                    autoComplete="email"
                    autoFocus
                    maxLength={254}
                    className="w-full h-11 px-3.5 rounded-lg bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                  />
                </div>

                {/* Password field */}
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Пароль (dev)
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="dev1234"
                      required
                      autoComplete="current-password"
                      maxLength={128}
                      className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Hidden CSRF token field */}
                {csrfToken && (
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 active:scale-[0.98]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Вход...
                    </span>
                  ) : (
                    "Войти (dev)"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-500">
            Доступ только для авторизованных сотрудников
          </p>
          <p className="text-[10px] text-slate-600 mt-1">
            © {new Date().getFullYear()} RusSilica — Корпоративный BI-терминал
          </p>
        </div>
      </div>
    </div>
  );
}

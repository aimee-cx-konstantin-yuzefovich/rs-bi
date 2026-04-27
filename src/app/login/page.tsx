"use client";

import { useState, useEffect } from "react";
import { signIn, getCsrfToken, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { IS_PRODUCTION } from "@/lib/config";

/**
 * Login Page — RusSilica BI Terminal
 *
 * Corporate Institutional Style
 * Colors: Blue, Orange, Gray
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let authPassword = password;

      // In production, we use Headless API to get the HMAC token first
      if (IS_PRODUCTION) {
        const wpRes = await fetch("/api/auth/wp-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          cache: "no-store",
        });

        const text = await wpRes.text();
        let wpData;
        try {
          wpData = JSON.parse(text);
        } catch (e) {
          setError("Ошибка связи с сервером авторизации");
          setLoading(false);
          return;
        }

        if (!wpRes.ok || !wpData.success) {
          setError(wpData.error || "Неверный email или пароль");
          setLoading(false);
          return;
        }

        // Use the HMAC token as the password for NextAuth
        authPassword = wpData.token;
      }

      const result = await signIn("credentials", {
        email,
        password: authPassword,
        redirect: false,
        csrfToken: csrfToken || undefined,
      });

      if (result?.error) {
        if (result.error === "CredentialsSignin") {
          setError("Неверный email или пароль");
        } else {
          setError(result.error);
        }
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="w-full max-w-[400px]">
        {/* Logo + Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[#1A52A3] tracking-tight mb-1">
            RusSilica
          </h1>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">
            Корпоративный BI Terminal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Email field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Корпоративный Email
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
                className="w-full h-12 px-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A52A3]/20 focus:border-[#1A52A3] transition-all"
              />
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Пароль
                </label>
                {!IS_PRODUCTION && (
                  <span className="text-[10px] font-medium text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
                    DEV MODE
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  autoComplete="current-password"
                  maxLength={128}
                  className="w-full h-12 px-4 pr-11 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A52A3]/20 focus:border-[#1A52A3] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
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
              className="w-full h-12 mt-2 rounded-lg bg-[#FF7A1F] hover:bg-[#E86E15] text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.99]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Вход в систему...
                </span>
              ) : (
                "Войти"
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-8 space-y-1">
          <p className="text-xs text-slate-400">
            Доступ разрешен только авторизованным сотрудникам
          </p>
          <p className="text-[11px] text-slate-400/70">
            © {new Date().getFullYear()} RusSilica
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Image from "next/image";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { IS_PRODUCTION } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGIN_ERRORS, loginErrorMessage } from "@/lib/login-errors";
import { safeLoginDestination } from "@/lib/login-navigation";

const inputClass = "h-12 rounded-lg border-slate-400 bg-white dark:bg-white px-4 text-base md:text-base text-slate-900 placeholder:text-slate-500 focus-visible:border-[#1A52A3] focus-visible:ring-[#1A52A3]/40";
const linkClass = "rounded-sm text-[#1A52A3] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A52A3]";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const callbackUrl = params.get("callbackUrl");

  useEffect(() => {
    if (status === "authenticated") router.replace(safeLoginDestination(callbackUrl, window.location.origin));
  }, [status, callbackUrl, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError("");
    const normalizedEmail = email.trim();
    const errors = {
      email: !normalizedEmail ? "Введите корпоративную почту" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ? "Введите корректный адрес почты" : undefined,
      password: !password ? "Введите пароль" : undefined,
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      (errors.email ? emailInput : passwordInput).current?.focus();
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      let authPassword = password;
      if (IS_PRODUCTION) {
        const response = await fetch("/api/auth/wp-login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, password }), cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 429) { setError(LOGIN_ERRORS.RATE_LIMITED); return; }
        const data = await response.json();
        if (!response.ok || !data?.success) { setError(loginErrorMessage(data?.code)); return; }
        if (typeof data.token !== "string" || !data.token) { setError(LOGIN_ERRORS.SERVICE_UNAVAILABLE); return; }
        authPassword = data.token;
      }
      const result = await signIn("credentials", { email: normalizedEmail, password: authPassword, redirect: false });
      if (result?.error) setError(result.status === 429 ? LOGIN_ERRORS.RATE_LIMITED : loginErrorMessage(result.error));
      else if (!result?.ok) setError(LOGIN_ERRORS.SERVICE_UNAVAILABLE);
      else {
        router.replace(safeLoginDestination(callbackUrl, window.location.origin));
        router.refresh();
      }
    } catch { setError(LOGIN_ERRORS.SERVICE_UNAVAILABLE); }
    finally { inFlight.current = false; setLoading(false); }
  }

  return (
    <div className="w-full max-w-[400px]">
      <header className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-[#1A52A3]">RusSilica</h1>
        <p className="text-sm font-medium tracking-wide text-slate-600">Корпоративный BI Terminal</p>
      </header>
      <form noValidate onSubmit={handleSubmit} aria-label="Вход в систему" aria-busy={loading} className="space-y-6">
        {params.get("reason") === "session-expired" && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700">Сессия завершена. Войдите снова, чтобы продолжить</p>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm text-slate-900">Корпоративная почта</Label>
          <Input ref={emailInput} id="email" name="username" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setFieldErrors(v => ({ ...v, email: undefined })); }} placeholder="имя@russilica.ru" className={inputClass} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
          {fieldErrors.email && <p id="email-error" role="alert" className="text-sm text-red-800">{fieldErrors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm text-slate-900">Пароль</Label>
          <div className="relative">
            <Input ref={passwordInput} id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} value={password} onChange={e => { setPassword(e.target.value); setFieldErrors(v => ({ ...v, password: undefined })); }} placeholder="Введите пароль" className={`${inputClass} pr-14`} aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
            <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-0.5 size-11 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-[#1A52A3]/40" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} aria-pressed={showPassword}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
          </div>
          {fieldErrors.password && <p id="password-error" role="alert" className="text-sm text-red-800">{fieldErrors.password}</p>}
        </div>
        <Button type="submit" disabled={loading} className="h-12 w-full rounded-lg bg-[#1A52A3] text-base font-semibold text-white hover:bg-[#154486] focus-visible:ring-[#1A52A3]/40 disabled:opacity-75">
          {loading ? <><Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /><span role="status">Входим…</span></> : "Войти"}
        </Button>
      </form>
      <p className="mt-6 text-sm leading-6 text-slate-600">Для получения или восстановления доступа обратитесь к администратору корпоративного портала</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F8FAFC] font-sans text-[#0F172A] [color-scheme:light]">
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 items-center px-5 py-6 sm:py-10 lg:py-12">
        <div className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:min-h-[600px] lg:grid-cols-2">
          <div className="relative h-40 bg-slate-200 sm:h-60 lg:h-auto">
            <Image src="/login-production.webp" alt="Здание предприятия РусСилика" fill priority sizes="(min-width: 1320px) 640px, (min-width: 1024px) calc((100vw - 40px) / 2), calc(100vw - 40px)" className="object-cover object-[50%_40%]" />
          </div>
          <section aria-label="Авторизация" className="flex min-w-0 justify-center px-5 py-8 sm:px-10 sm:py-12 lg:items-center lg:px-12">
            <Suspense fallback={<p role="status" className="text-slate-600">Загрузка формы входа…</p>}><LoginForm /></Suspense>
          </section>
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white text-sm leading-6 text-slate-600">
        <div className="mx-auto max-w-[1320px] space-y-5 px-5 py-6 sm:py-8">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between md:gap-12">
            <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:gap-6"><a className={`${linkClass} font-semibold`} href="tel:88002228008">8-800-222-80-08</a><a className={linkClass} href="mailto:info@russilica.ru">info@russilica.ru</a></div>
            <address className="max-w-xl not-italic">606000, Нижегородская область, г. Дзержинск, ш. Игумновское, д. 15Ц</address>
          </div>
          <div className="flex flex-col gap-1 border-t border-slate-100 pt-4 md:flex-row md:justify-between md:gap-8"><p>© 2020-2026 ООО "РусСилика"</p><p>ОГРН 1205500027710, ИНН 5501267734, КПП 660850001.</p></div>
        </div>
      </footer>
    </div>
  );
}

/** Only known application pages can be used as post-login destinations. */
export function safeLoginDestination(value: string | null, origin: string): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return "/";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !["/", "/companies"].includes(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export function loginRedirect(location: Pick<Location, "pathname" | "search" | "hash">, expired = false): string {
  const params = new URLSearchParams({ callbackUrl: location.pathname + location.search + location.hash });
  if (expired) params.set("reason", "session-expired");
  return `/login?${params}`;
}

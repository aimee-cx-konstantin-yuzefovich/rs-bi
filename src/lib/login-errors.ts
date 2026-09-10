export const LOGIN_ERRORS = {
  INVALID_INPUT: "Проверьте почту и пароль",
  INVALID_CREDENTIALS: "Не удалось войти. Проверьте почту и пароль",
  SERVICE_UNAVAILABLE: "Сейчас не удаётся подключиться. Попробуйте ещё раз",
  RATE_LIMITED: "Слишком много попыток входа. Попробуйте позже",
  ACCESS_DENIED: "Для этой учётной записи доступ к BI-терминалу не разрешён. Обратитесь к администратору корпоративного портала",
} as const;
export type LoginErrorCode = keyof typeof LOGIN_ERRORS;
export function loginErrorMessage(code: unknown): string {
  if (typeof code === "string" && Object.hasOwn(LOGIN_ERRORS, code)) return LOGIN_ERRORS[code as LoginErrorCode];
  if (code === "CredentialsSignin" || code === "Неверный email или пароль") return LOGIN_ERRORS.INVALID_CREDENTIALS;
  return LOGIN_ERRORS.SERVICE_UNAVAILABLE;
}

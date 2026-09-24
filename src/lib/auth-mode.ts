/**
 * Authentication Mode & Development Bypass Helper — RusSilica BI Terminal
 *
 * Centralized authority for determining whether the authentication bypass
 * is enabled for local development and Vercel Preview deployments.
 *
 * SECURITY INVARIANTS:
 * 1. Default mode is ALWAYS "wordpress" (fail secure).
 * 2. Bypass is ONLY permitted in:
 *    - Local development (NODE_ENV === "development" AND AUTH_MODE === "bypass")
 *    - Vercel Preview (VERCEL === "1" AND VERCEL_ENV === "preview" AND AUTH_MODE === "bypass")
 * 3. Bypass is NEVER permitted on production:
 *    - VERCEL_ENV === "production" => bypass is strictly OFF
 *    - NODE_ENV === "production" (without VERCEL_ENV === "preview") => bypass is strictly OFF
 * 4. The bypass decision is strictly server-authoritative.
 */

export type AuthMode = "wordpress" | "bypass";

export interface DevUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Standard synthetic development user.
 * Conforms to the repository's Session.user and AuthSession types.
 */
export const DEV_USER: DevUser = {
  id: "vercel-dev",
  email: "vercel-dev@local",
  name: "Vercel Development",
  role: "admin",
};

/**
 * Synthetic development session for NextAuth client SessionProvider.
 */
export const DEV_SESSION = {
  user: {
    id: DEV_USER.id,
    email: DEV_USER.email,
    name: DEV_USER.name,
    role: DEV_USER.role,
  },
  expires: "2099-12-31T23:59:59.999Z",
};

/**
 * Reads the configured authentication mode from environment variables.
 * Defaults to "wordpress" if missing or invalid.
 */
export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE === "bypass" ? "bypass" : "wordpress";
}

/**
 * Server-authoritative check: is the authentication bypass currently active?
 *
 * Returns true ONLY when AUTH_MODE is explicitly set to "bypass" AND
 * the runtime environment is either local development or a Vercel Preview deployment.
 * Under no circumstances does this return true in a production environment.
 */
export function isAuthBypassEnabled(): boolean {
  if (getAuthMode() !== "bypass") {
    return false;
  }

  // Critical invariant: VERCEL_ENV=production must NEVER activate bypass under any condition.
  if (process.env.VERCEL_ENV === "production") {
    return false;
  }

  // On Vercel, bypass is strictly restricted to Vercel Preview deployments.
  if (process.env.VERCEL === "1") {
    return process.env.VERCEL_ENV === "preview";
  }

  // For non-Vercel environments (e.g. local machine), bypass requires NODE_ENV === "development".
  return process.env.NODE_ENV === "development";
}

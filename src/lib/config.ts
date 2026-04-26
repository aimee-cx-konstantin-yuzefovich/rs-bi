/**
 * Centralized Configuration — RusSilica BI Terminal
 *
 * Single source of truth for environment-dependent constants.
 * Previously, IS_PRODUCTION and WP_LOGIN_URL were duplicated in 4+ files.
 *
 * Server-side usage: import { IS_PRODUCTION, WP_LOGIN_URL } from "@/lib/config"
 * Client-side usage: import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config"
 */

// ─── Environment Detection ───

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ─── WordPress SSO URLs ───

/** Server-side WP login URL (from server-only env var) */
export const WP_LOGIN_URL =
  process.env.WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";

/** Client-side WP login URL (from NEXT_PUBLIC_ env var) */
export const WP_LOGIN_URL_CLIENT =
  process.env.NEXT_PUBLIC_WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";

/**
 * Extract the base URL of the BI terminal from the WP login URL.
 * Since WP and BI share the same domain, we can derive it.
 */
export const BI_URL = WP_LOGIN_URL_CLIENT.replace(/\/wp-login\.php.*$/, "");

// ─── Feature Flags ───

/** Gate debug console logging in production */
export const shouldLog = !IS_PRODUCTION;

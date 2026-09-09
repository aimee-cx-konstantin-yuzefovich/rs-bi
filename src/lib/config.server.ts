import "server-only";

/** Server-side WP login URL (from server-only env var) */
export const WP_LOGIN_URL =
  process.env.WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";

/** Public portal origin, configured only on the server. */
export const BITRIX_PORTAL_URL = process.env.BITRIX_PORTAL_URL || "";

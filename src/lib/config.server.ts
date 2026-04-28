import "server-only";

/** Server-side WP login URL (from server-only env var) */
export const WP_LOGIN_URL =
  process.env.WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";

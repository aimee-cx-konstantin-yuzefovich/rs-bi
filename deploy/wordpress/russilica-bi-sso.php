<?php
/**
 * Plugin Name: RusSilica BI Terminal SSO
 * Plugin URI: https://bi-terminal.rus-silica.com
 * Description: Single Sign-On between WordPress and RusSilica BI Terminal.
 *              After WordPress login, redirects authenticated users to the BI terminal
 *              with HMAC-SHA256 signed parameters.
 * Version: 1.1.0
 * Author: RusSilica IT
 * License: Proprietary
 *
 * MUST-USE PLUGIN (mu-plugin):
 * Place this file in: wp-content/mu-plugins/russilica-bi-sso.php
 * Mu-plugins are auto-activated — no need to enable in WordPress admin.
 *
 * ARCHITECTURE:
 * WordPress and BI terminal share the SAME domain: bi-terminal.rus-silica.com
 * Nginx routes: /wp-* → WordPress (PHP), everything else → BI Terminal (Node.js)
 *
 * CONFIGURATION in wp-config.php:
 *   define('RUSILICA_BI_PROXY_SECRET', 'your-shared-secret-here');
 *
 * GENERATE PROXY_SECRET on the server:
 *   openssl rand -hex 32
 *
 * The same PROXY_SECRET must be in BI terminal's .env file.
 */

// ─── Prevent direct access ───
if (!defined('ABSPATH')) {
    exit;
}

// ─── Configuration ───
// BI terminal is on the SAME domain as WordPress
$bi_url       = 'https://' . $_SERVER['HTTP_HOST'];
$proxy_secret = defined('RUSILICA_BI_PROXY_SECRET') ? RUSILICA_BI_PROXY_SECRET : '';

// ─── Safety checks ───
if (empty($proxy_secret)) {
    error_log('[RusSilica BI SSO] WARNING: RUSILICA_BI_PROXY_SECRET not defined in wp-config.php');
    return;
}

/**
 * After WordPress login, check if the redirect_to parameter points to the BI terminal.
 * If so, add HMAC-signed SSO parameters and redirect.
 */
add_filter('login_redirect', function ($redirect_to, $requested_redirect_to, $user) use ($bi_url, $proxy_secret) {
    // Only proceed on successful login
    if (is_wp_error($user) || !$user->exists()) {
        return $redirect_to;
    }

    // BI callback URL — same domain, /api/auth/wp-callback path
    $bi_callback_url = $bi_url . '/api/auth/wp-callback';

    // Check if this is a BI terminal redirect
    if (strpos($redirect_to, $bi_callback_url) === false &&
        strpos(urldecode($redirect_to), $bi_callback_url) === false) {
        return $redirect_to; // Not a BI redirect — let WordPress handle normally
    }

    // ─── Generate HMAC-signed SSO token ───
    $email      = $user->user_email;
    $wp_role    = array_shift($user->roles); // Get primary role
    $timestamp  = time();

    // Build signature: HMAC-SHA256(email|role|timestamp, PROXY_SECRET)
    $message    = $email . '|' . $wp_role . '|' . $timestamp;
    $signature  = hash_hmac('sha256', $message, $proxy_secret);

    // Build redirect URL with signed parameters
    $sso_url = add_query_arg(array(
        'email' => urlencode($email),
        'role'  => urlencode($wp_role),
        'ts'    => $timestamp,
        'sig'   => $signature,
    ), $bi_callback_url);

    return $sso_url;

}, 10, 3);

/**
 * Handle already-logged-in users clicking "BI Terminal" link in admin bar.
 */
add_action('template_redirect', function () use ($bi_url, $proxy_secret) {
    if (!isset($_GET['russilica_bi_sso']) || $_GET['russilica_bi_sso'] !== '1') {
        return;
    }

    if (!is_user_logged_in()) {
        wp_redirect(wp_login_url($_SERVER['REQUEST_URI']));
        exit;
    }

    $user       = wp_get_current_user();
    $email      = $user->user_email;
    $wp_role    = array_shift($user->roles);
    $timestamp  = time();

    $message    = $email . '|' . $wp_role . '|' . $timestamp;
    $signature  = hash_hmac('sha256', $message, $proxy_secret);

    $bi_callback_url = $bi_url . '/api/auth/wp-callback';
    $sso_url = add_query_arg(array(
        'email' => urlencode($email),
        'role'  => urlencode($wp_role),
        'ts'    => $timestamp,
        'sig'   => $signature,
    ), $bi_callback_url);

    wp_redirect($sso_url);
    exit;
});

/**
 * Add a "BI Terminal" link to the WordPress admin bar for logged-in users.
 */
add_action('admin_bar_menu', function ($wp_admin_bar) use ($bi_url) {
    if (!is_user_logged_in()) {
        return;
    }

    $wp_admin_bar->add_node(array(
        'id'    => 'russilica-bi-terminal',
        'title' => '📊 BI Терминал',
        'href'  => $bi_url . '/?russilica_bi_sso=1',
        'meta'  => array(
            'title'  => 'Открыть BI-терминал RusSilica',
        ),
    ));
}, 100);

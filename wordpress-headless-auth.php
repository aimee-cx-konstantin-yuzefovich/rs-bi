<?php
/**
 * Plugin Name: RusSilica Headless Auth
 * Description: REST API endpoint for Headless Next.js Authentication
 * Version: 1.0.3
 * Author: RusSilica
 */

if (!defined('ABSPATH')) {
    exit;
}

class RusSilica_Headless_Auth {
    public function __construct() {
        add_action('login_form_headless_auth', [$this, 'handle_auth_request']);
        add_action('login_form_headless_logout', [$this, 'handle_logout_request']);
        
        // Use priority 99 to be the final word on redirects
        add_filter('login_redirect', [$this, 'handle_login_redirect'], 99, 3);

        // FIX 3: If user is already logged in, handle the SSO redirect immediately
        add_action('admin_init', [$this, 'handle_already_logged_in_sso']);
    }

    /**
     * If user visits WP with a redirect_to pointing to the BI terminal
     * and they are already logged in, send them back with a token immediately.
     */
    public function handle_already_logged_in_sso() {
        if (is_user_logged_in() && isset($_GET['redirect_to'])) {
            $redirect_to = $_GET['redirect_to'];
            if (strpos($redirect_to, '/api/auth/wp-callback') !== false) {
                $validated_url = $this->handle_login_redirect($redirect_to, $redirect_to, wp_get_current_user());
                wp_safe_redirect($validated_url);
                exit;
            }
        }
    }

    public function handle_logout_request() {
        $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
        $referer_host = parse_url($referer, PHP_URL_HOST);
        $host = parse_url(home_url(), PHP_URL_HOST);
        
        if (is_user_logged_in() && $referer_host === $host) {
            wp_logout();
        }

        $redirect_to = isset($_GET['redirect_to']) ? esc_url_raw($_GET['redirect_to']) : home_url();
        
        add_filter('allowed_redirect_hosts', function ($hosts) {
            $hosts[] = 'bi-terminal.rus-silica.com';
            return $hosts;
        });

        wp_safe_redirect($redirect_to);
        exit;
    }

    public function handle_auth_request() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            header('Content-Type: application/json');
            http_response_code(405);
            exit(json_encode(['success' => false, 'message' => 'Method Not Allowed']));
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) $input = [];
        
        $email = sanitize_email($input['email'] ?? '');
        $password = $input['password'] ?? '';

        $user = wp_authenticate($email, $password);

        header('Content-Type: application/json');

        if (is_wp_error($user)) {
            http_response_code(401);
            exit(json_encode(['success' => false, 'message' => 'Неверный email или пароль']));
        }

        $token = $this->generate_hmac_token($user);

        if (is_wp_error($token)) {
            http_response_code(500);
            exit(json_encode(['success' => false, 'message' => $token->get_error_message()]));
        }

        echo json_encode([
            'success' => true,
            'token' => $token,
            'user' => [
                'email' => $user->user_email,
                'role' => $this->get_user_role($user),
            ]
        ]);
        exit;
    }

    public function handle_login_redirect($redirect_to, $requested_redirect_to, $user) {
        if (is_wp_error($user)) return $redirect_to;

        // FIX 2: Security - Ensure we ONLY leak signatures to our own domain
        $target_host = parse_url($redirect_to, PHP_URL_HOST);
        $local_host = parse_url(home_url(), PHP_URL_HOST);
        
        // If host is set and doesn't match local, reject appending the token
        if ($target_host && $target_host !== $local_host && $target_host !== 'bi-terminal.rus-silica.com') {
            return $redirect_to;
        }

        if (strpos($redirect_to, '/api/auth/wp-callback') !== false) {
            $token = $this->generate_hmac_token($user);
            
            if (is_wp_error($token)) {
                wp_die('SSO Configuration Error: ' . esc_html($token->get_error_message()));
            }

            // Standardize on PIPES to match Next.js sso-hmac.ts
            $parts = explode('|', $token);
            if (count($parts) === 5) {
                $redirect_to = add_query_arg([
                    'email' => $parts[1],
                    'role'  => $parts[2],
                    'ts'    => $parts[3],
                    'sig'   => $parts[4],
                ], $redirect_to);
            }
        }
        return $redirect_to;
    }

    private function generate_hmac_token($user) {
        if (!defined('RUSSILICA_BI_PROXY_SECRET') || empty(RUSSILICA_BI_PROXY_SECRET)) {
            return new WP_Error('missing_secret', 'RUSSILICA_BI_PROXY_SECRET not set');
        }

        $email = strtolower(trim($user->user_email));
        $role = $this->get_user_role($user);
        $ts = time();

        $message = "{$email}|{$role}|{$ts}";
        $sig = hash_hmac('sha256', $message, RUSSILICA_BI_PROXY_SECRET);

        // FIX 1: Using PIPES (|) to match the Next.js verifySsoToken logic exactly
        return "wp-sso-hmac|{$email}|{$role}|{$ts}|{$sig}";
    }

    private function get_user_role($user) {
        if (in_array('administrator', (array) $user->roles)) return 'admin';
        return 'user';
    }
}

new RusSilica_Headless_Auth();
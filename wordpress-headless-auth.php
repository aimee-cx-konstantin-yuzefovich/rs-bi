<?php
/**
 * Plugin Name: RusSilica Headless Auth
 * Description: REST API endpoint for Headless Next.js Authentication
 * Version: 1.0.2
 * Author: RusSilica
 */

if (!defined('ABSPATH')) {
    exit;
}

class RusSilica_Headless_Auth {
    public function __construct() {
        add_action('login_form_headless_auth', [$this, 'handle_auth_request']);
        add_action('login_form_headless_logout', [$this, 'handle_logout_request']);
        
        // Use priority 99 to ensure we append our args after other plugins modify the redirect
        add_filter('login_redirect',[$this, 'handle_login_redirect'], 99, 3);
    }

    public function handle_logout_request() {
        // FIX 3: Strict CSRF mitigation via parsed host comparison
        $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
        $referer_host = parse_url($referer, PHP_URL_HOST);
        $host = parse_url(home_url(), PHP_URL_HOST);
        
        if ( is_user_logged_in() && $referer_host === $host ) {
            wp_logout();
        }

        $redirect_to = isset($_GET['redirect_to']) ? esc_url_raw($_GET['redirect_to']) : home_url();

        add_filter('allowed_redirect_hosts', function ($hosts) {
            $hosts[] = parse_url(home_url(), PHP_URL_HOST);
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
            echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
            exit;
        }

        // FIX 4: Strict array check prevents PHP 8 TypeErrors
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            $input =[];
        }
        
        $email = sanitize_email($input['email'] ?? '');
        $password = $input['password'] ?? '';

        $user = wp_authenticate($email, $password);

        header('Content-Type: application/json');

        if (is_wp_error($user)) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Неверный email или пароль']);
            exit;
        }

        $token = $this->generate_hmac_token($user);

        if (is_wp_error($token)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $token->get_error_message()]);
            exit;
        }

        echo json_encode([
            'success' => true,
            'token' => $token,
            'user' =>[
                'email' => $user->user_email,
                'role' => $this->get_user_role($user),
            ]
        ]);
        exit;
    }

    public function handle_login_redirect($redirect_to, $requested_redirect_to, $user) {
        if (strpos($redirect_to, '/api/auth/wp-callback') !== false && !is_wp_error($user)) {
            $token = $this->generate_hmac_token($user);
            
            // FIX 2: Prevent infinite redirect loop if secret is missing
            if (is_wp_error($token)) {
                wp_die('BI Terminal SSO Error: ' . esc_html($token->get_error_message()));
            }

            $parts = explode(':', $token);
            if (count($parts) === 5) {
                // FIX 1: Use native add_query_arg for safe URL construction
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
            return new WP_Error(
                'missing_secret',
                'RUSSILICA_BI_PROXY_SECRET is not configured on the server',['status' => 500]
            );
        }

        $email = strtolower(trim($user->user_email));
        $role = $this->get_user_role($user);
        $ts = time();

        $message = "{$email}|{$role}|{$ts}";
        $sig = hash_hmac('sha256', $message, RUSSILICA_BI_PROXY_SECRET);

        return "wp-sso-hmac:{$email}:{$role}:{$ts}:{$sig}";
    }

    private function get_user_role($user) {
        if (in_array('administrator', (array) $user->roles)) {
            return 'admin';
        }
        return 'user';
    }
}

new RusSilica_Headless_Auth();
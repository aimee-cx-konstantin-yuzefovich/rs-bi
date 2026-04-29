<?php
/**
 * Plugin Name: RusSilica Headless Auth
 * Description: REST API endpoint for Headless Next.js Authentication
 * Version: 1.0.1
 * Author: RusSilica
 */

if (!defined('ABSPATH')) {
    exit;
}

class RusSilica_Headless_Auth {
    public function __construct() {
        add_action('login_form_headless_auth',[$this, 'handle_auth_request']);
        add_action('login_form_headless_logout',[$this, 'handle_logout_request']);
        
        // FIX 2: Added missing login_redirect hook to append HMAC params
        add_filter('login_redirect', [$this, 'handle_login_redirect'], 10, 3);
    }

    public function handle_logout_request() {
        // FIX 4: Basic CSRF mitigation via Referer check
        $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
        $host = parse_url(home_url(), PHP_URL_HOST);
        
        if ( is_user_logged_in() && strpos($referer, $host) !== false ) {
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

        // FIX 3: Prevent PHP 8 TypeError if body is empty/invalid
        $input = json_decode(file_get_contents('php://input'), true) ?:[];
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

    // FIX 2: Intercept standard WP login and append HMAC params for Next.js
    public function handle_login_redirect($redirect_to, $requested_redirect_to, $user) {
        // Only intercept if the redirect is going back to our Next.js callback
        if (strpos($redirect_to, '/api/auth/wp-callback') !== false && !is_wp_error($user)) {
            $token = $this->generate_hmac_token($user);
            
            if (!is_wp_error($token)) {
                // Token format is wp-sso-hmac:email:role:ts:sig
                $parts = explode(':', $token);
                if (count($parts) === 5) {
                    $url_parts = parse_url($redirect_to);
                    parse_str($url_parts['query'] ?? '', $query);
                    
                    // Append required HMAC parameters
                    $query['email'] = $parts[1];
                    $query['role']  = $parts[2];
                    $query['ts']    = $parts[3];
                    $query['sig']   = $parts[4];
                    
                    $new_query = http_build_query($query);
                    $redirect_to = $url_parts['scheme'] . '://' . $url_parts['host'] . 
                                   (isset($url_parts['port']) ? ':' . $url_parts['port'] : '') . 
                                   $url_parts['path'] . '?' . $new_query;
                }
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

        // FIX 1: Changed pipes (|) to colons (:) to match Next.js sso-hmac.ts expectations
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

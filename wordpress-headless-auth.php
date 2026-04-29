<?php
/**
 * Plugin Name: RusSilica Headless Auth
 * Description: REST API endpoint for Headless Next.js Authentication
 * Version: 1.0.0
 * Author: RusSilica
 */

if (!defined('ABSPATH')) {
    exit;
}

class RusSilica_Headless_Auth {
    public function __construct() {
        add_action('login_form_headless_auth', [$this, 'handle_auth_request']);
        add_action('login_form_headless_logout', [$this, 'handle_logout_request']);
    }

    public function handle_logout_request() {
        // Limit to logged-in users (prevents abuse for arbitrary visitors).
        if ( is_user_logged_in() ) {
            wp_logout();
        }

        $redirect_to = isset($_GET['redirect_to']) ? esc_url_raw($_GET['redirect_to']) : home_url();

        // Allow the BI terminal host explicitly.
        add_filter('allowed_redirect_hosts', function ($hosts) {
            $hosts[] = parse_url(home_url(), PHP_URL_HOST);
            // Add any extra hosts the BI terminal could be served from:
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
            echo json_encode([
                'success' => false,
                'message' => 'Method Not Allowed'
            ]);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $email = sanitize_email($input['email'] ?? '');
        $password = $input['password'] ?? '';

        // Authenticate user
        $user = wp_authenticate($email, $password);

        header('Content-Type: application/json');

        if (is_wp_error($user)) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'message' => 'Неверный email или пароль'
            ]);
            exit;
        }

        // Generate HMAC token
        $token = $this->generate_hmac_token($user);

        if (is_wp_error($token)) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => $token->get_error_message()
            ]);
            exit;
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

    private function generate_hmac_token($user) {
        // RUSSILICA_BI_PROXY_SECRET must be defined in wp-config.php
        if (!defined('RUSSILICA_BI_PROXY_SECRET') || empty(RUSSILICA_BI_PROXY_SECRET)) {
            return new WP_Error(
                'missing_secret',
                'RUSSILICA_BI_PROXY_SECRET is not configured on the server',
                ['status' => 500]
            );
        }

        $email = strtolower(trim($user->user_email));
        $role = $this->get_user_role($user);
        $ts = time();

        $message = "{$email}|{$role}|{$ts}";
        $sig = hash_hmac('sha256', $message, RUSSILICA_BI_PROXY_SECRET);

        return "wp-sso-hmac|{$email}|{$role}|{$ts}|{$sig}";
    }

    private function get_user_role($user) {
        if (in_array('administrator', (array) $user->roles)) {
            return 'admin';
        }
        return 'user';
    }
}

new RusSilica_Headless_Auth();

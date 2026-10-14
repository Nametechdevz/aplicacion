<?php

declare(strict_types=1);

return [
    'name' => env('APP_NAME', 'Nailora Beauty'),
    'env' => env('APP_ENV', 'production'),
    'debug' => filter_var(env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN),
    'url' => rtrim((string) env('APP_URL', 'http://localhost'), '/'),
    'timezone' => env('APP_TIMEZONE', 'America/Bogota'),
    'locale' => 'es_CO',
    'currency' => 'COP',

    'session' => [
        'name' => env('SESSION_NAME', 'nailora_session'),
        'secure' => env('SESSION_SECURE', 'auto'),
        'admin_lifetime_minutes' => (int) env('ADMIN_SESSION_LIFETIME', 120),
        'path' => BASE_PATH . '/storage/sessions',
    ],

    'install_token' => (string) env('INSTALL_TOKEN', ''),

    'uploads' => [
        'max_mb' => (int) env('UPLOAD_MAX_MB', 4),
        'max_dimension' => 1600,
        'allowed_mimes' => [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        ],
    ],

    'catalog' => [
        'per_page' => 12,
        'max_cart_quantity' => 50,
    ],

    'admin' => [
        'per_page' => 20,
        'login_max_attempts' => 5,
        'login_window_minutes' => 15,
    ],

    'log_path' => BASE_PATH . '/storage/logs',
];

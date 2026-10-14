<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Session;
use App\Models\AuditLog;
use App\Models\User;

final class AuthService
{
    // Hash ficticio para que el tiempo de respuesta no revele si el correo existe
    private const DUMMY_HASH = '$2y$10$NAvYlLK6ExQo0n/ZqD8FDu17VIdMdTMWVw0WMshP6fIrEBV6SBFXi';

    public static function isLocked(string $email, string $ip): bool
    {
        $window = (int) config('app.admin.login_window_minutes', 15);
        $max = (int) config('app.admin.login_max_attempts', 5);
        $since = date('Y-m-d H:i:s', time() - $window * 60);
        $byEmail = (int) Database::value(
            'SELECT COUNT(*) FROM login_attempts WHERE email_hash = :e AND successful = 0 AND attempted_at >= :s',
            ['e' => self::emailHash($email), 's' => $since]
        );
        $byIp = (int) Database::value(
            'SELECT COUNT(*) FROM login_attempts WHERE ip = :ip AND successful = 0 AND attempted_at >= :s',
            ['ip' => $ip, 's' => $since]
        );
        return $byEmail >= $max || $byIp >= $max * 4;
    }

    private static function emailHash(string $email): string
    {
        return hash('sha256', mb_strtolower(trim($email)));
    }

    private static function recordAttempt(string $email, string $ip, bool $success): void
    {
        Database::insert('login_attempts', ['ip' => $ip, 'email_hash' => self::emailHash($email), 'successful' => $success ? 1 : 0]);
        if (random_int(1, 50) === 1) {
            Database::query('DELETE FROM login_attempts WHERE attempted_at < :d', ['d' => date('Y-m-d H:i:s', time() - 86400 * 7)]);
        }
    }

    /** @return bool true si las credenciales son válidas y el usuario está activo */
    public static function attempt(string $email, string $password, string $ip): bool
    {
        $user = User::findByEmail($email);
        $valid = password_verify($password, $user['password_hash'] ?? self::DUMMY_HASH);
        $ok = $user !== null && $valid && (int) $user['is_active'] === 1;
        self::recordAttempt($email, $ip, $ok);
        if (!$ok) {
            return false;
        }

        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            User::updatePassword((int) $user['id'], $password);
        }
        Session::regenerate();
        $_SESSION['admin_user'] = [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
        ];
        $_SESSION['admin_last_activity'] = time();
        // Nuevo token CSRF tras el inicio de sesión
        $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        User::update((int) $user['id'], ['last_login_at' => date('Y-m-d H:i:s')]);
        AuditLog::record('auth.login', 'user', (int) $user['id']);
        return true;
    }

    public static function logout(): void
    {
        if (auth_id()) {
            AuditLog::record('auth.logout', 'user', auth_id());
        }
        $cart = $_SESSION['cart'] ?? null;
        Session::destroy();
        Session::start();
        Session::regenerate();
        if ($cart) {
            $_SESSION['cart'] = $cart;
        }
    }
}

<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Database;
use App\Core\ValidationException;

/** Inicio de sesión con limitación de intentos (fuerza bruta). */
final class AuthService
{
    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    public function attempt(string $username, string $password, string $ip): array
    {
        $username = mb_strtolower(trim($username));
        $user = $this->verifyCredentials($username, $password, $ip);
        if (!$user) {
            Audit::log('auth.failed', 'user', null, "Intento fallido para «{$username}»", null, null, null, null);
            throw new ValidationException('Usuario o contraseña incorrectos.');
        }
        Auth::login($user);
        $this->db->execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = :id', ['id' => $user['id']]);
        Audit::log('auth.login', 'user', (int) $user['id'], 'Inicio de sesión', null, null, null, (int) $user['id']);
        return $user;
    }

    /**
     * Verifica credenciales respetando el bloqueo por intentos fallidos.
     * Devuelve el usuario o null; lanza excepción si está bloqueado.
     */
    public function verifyCredentials(string $username, string $password, string $ip): ?array
    {
        $username = mb_strtolower(trim($username));
        $max = (int) Config::get('app.login_max_attempts', 5);
        $minutes = (int) Config::get('app.login_lock_minutes', 15);
        $since = gmdate('Y-m-d H:i:s', time() - $minutes * 60);

        $byUser = (int) $this->db->value(
            'SELECT COUNT(*) FROM login_attempts WHERE username = :u AND success = 0 AND attempted_at >= :s',
            ['u' => $username, 's' => $since]
        );
        $byIp = (int) $this->db->value(
            'SELECT COUNT(*) FROM login_attempts WHERE ip_address = :ip AND success = 0 AND attempted_at >= :s',
            ['ip' => $ip, 's' => $since]
        );
        if ($byUser >= $max || $byIp >= $max * 4) {
            throw new ValidationException("Demasiados intentos fallidos. Por seguridad, espere $minutes minutos antes de intentarlo de nuevo.");
        }

        $user = $this->db->one('SELECT * FROM users WHERE username = :u', ['u' => $username]);
        // Se verifica un hash ficticio cuando el usuario no existe para no revelar su existencia por tiempo de respuesta.
        $hash = $user['password_hash'] ?? '$2y$12$abcdefghijklmnopqrstuuJ2b1u2y0o2gIuVgS0hIUu3P0o0zN1y.';
        $ok = password_verify($password, $hash) && $user && (int) $user['is_active'] === 1;

        $this->db->insert('login_attempts', ['username' => mb_substr($username, 0, 60), 'ip_address' => $ip, 'success' => $ok ? 1 : 0]);
        if (!$ok) {
            return null;
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $this->db->execute('UPDATE users SET password_hash = :h WHERE id = :id', [
                'h' => password_hash($password, PASSWORD_DEFAULT), 'id' => $user['id'],
            ]);
        }
        // Limpia intentos fallidos previos del usuario.
        $this->db->execute('DELETE FROM login_attempts WHERE username = :u AND success = 0', ['u' => $username]);
        return $user;
    }
}

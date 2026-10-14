<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class User
{
    public const MIN_PASSWORD_LENGTH = 10;

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT id, name, email, role, is_active, last_login_at, created_at FROM users WHERE id = :id', ['id' => $id]);
    }

    public static function findWithHash(int $id): ?array
    {
        return Database::fetch('SELECT * FROM users WHERE id = :id', ['id' => $id]);
    }

    public static function findByEmail(string $email): ?array
    {
        return Database::fetch('SELECT * FROM users WHERE email = :email', ['email' => mb_strtolower(trim($email))]);
    }

    public static function all(): array
    {
        return Database::fetchAll('SELECT id, name, email, role, is_active, last_login_at, created_at FROM users ORDER BY name');
    }

    public static function count(): int
    {
        return (int) Database::value('SELECT COUNT(*) FROM users');
    }

    public static function create(string $name, string $email, string $password): int
    {
        return Database::insert('users', [
            'name' => $name,
            'email' => mb_strtolower(trim($email)),
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => 'admin',
            'is_active' => 1,
        ]);
    }

    public static function updatePassword(int $id, string $password): void
    {
        Database::update('users', ['password_hash' => password_hash($password, PASSWORD_DEFAULT)], 'id = :id', ['id' => $id]);
    }

    public static function update(int $id, array $data): void
    {
        Database::update('users', $data, 'id = :id', ['id' => $id]);
    }

    /** Devuelve un mensaje de error o null si la contraseña cumple la política. */
    public static function passwordPolicyError(string $password): ?string
    {
        if (mb_strlen($password) < self::MIN_PASSWORD_LENGTH) {
            return 'La contraseña debe tener al menos ' . self::MIN_PASSWORD_LENGTH . ' caracteres.';
        }
        if (mb_strlen($password) > 128) {
            return 'La contraseña no puede superar 128 caracteres.';
        }
        if (!preg_match('/[A-Za-zÁÉÍÓÚáéíóúÑñ]/u', $password) || !preg_match('/\d/', $password)) {
            return 'La contraseña debe combinar letras y números.';
        }
        return null;
    }
}

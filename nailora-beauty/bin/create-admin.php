<?php

declare(strict_types=1);

/**
 * Crea un usuario administrador desde la línea de comandos.
 * Uso: php bin/create-admin.php "Nombre" correo@dominio.com
 * La contraseña se solicita de forma interactiva (no queda en el historial).
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Models\User;

[$script, $name, $email] = array_pad($argv, 3, null);
if (!$name || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Uso: php bin/create-admin.php \"Nombre\" correo@dominio.com\n");
    exit(1);
}
if (User::findByEmail($email)) {
    fwrite(STDERR, "Ya existe un usuario con ese correo.\n");
    exit(1);
}

$password = getenv('NAILORA_ADMIN_PASSWORD') ?: null;
if ($password === null) {
    fwrite(STDOUT, 'Contraseña (mín. ' . User::MIN_PASSWORD_LENGTH . ' caracteres, letras y números): ');
    if (DIRECTORY_SEPARATOR === '/') {
        shell_exec('stty -echo');
    }
    $password = trim((string) fgets(STDIN));
    if (DIRECTORY_SEPARATOR === '/') {
        shell_exec('stty echo');
    }
    fwrite(STDOUT, "\n");
}
if ($error = User::passwordPolicyError($password)) {
    fwrite(STDERR, $error . "\n");
    exit(1);
}

$id = User::create($name, $email, $password);
fwrite(STDOUT, "Administrador creado (id $id).\n");

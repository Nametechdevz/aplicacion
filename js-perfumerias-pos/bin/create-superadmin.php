<?php
declare(strict_types=1);

/**
 * Creación segura del primer superadministrador (solo por consola).
 * No existe ninguna ruta web que permita crear superadministradores sin sesión.
 *
 *   php bin/create-superadmin.php
 *   (o no interactivo) php bin/create-superadmin.php --name="Nombre" --username=admin --email=a@b.co
 *   La contraseña se solicita sin eco, o se lee de la variable JSP_ADMIN_PASSWORD.
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Database;

$opts = getopt('', ['name:', 'username:', 'email::']);
$ask = static function (string $label, bool $secret = false): string {
    echo $label;
    if ($secret && DIRECTORY_SEPARATOR === '/' ) {
        shell_exec('stty -echo');
        $v = trim((string) fgets(STDIN));
        shell_exec('stty echo');
        echo "\n";
        return $v;
    }
    return trim((string) fgets(STDIN));
};

$db = Database::connection();
$existing = (int) $db->value("SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'superadmin'");
if ($existing > 0) {
    echo "Ya existe al menos un superadministrador ($existing). Para crear más, hágalo desde Usuarios en la aplicación.\n";
    exit(0);
}

$name = $opts['name'] ?? $ask('Nombre completo: ');
$username = strtolower($opts['username'] ?? $ask('Usuario (minúsculas): '));
$email = $opts['email'] ?? $ask('Correo (opcional): ');
$password = getenv('JSP_ADMIN_PASSWORD') ?: $ask('Contraseña (mín. 10 caracteres, letras y números): ', true);
if (!getenv('JSP_ADMIN_PASSWORD')) {
    $confirm = $ask('Repita la contraseña: ', true);
    if ($confirm !== $password) {
        fwrite(STDERR, "Las contraseñas no coinciden.\n");
        exit(1);
    }
}
if (!preg_match('/^[a-z0-9._-]{3,60}$/', $username) || mb_strlen($name) < 3) {
    fwrite(STDERR, "Nombre o usuario no válidos.\n");
    exit(1);
}
if (mb_strlen($password) < 10 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
    fwrite(STDERR, "La contraseña debe tener al menos 10 caracteres e incluir letras y números.\n");
    exit(1);
}

$db->transaction(function () use ($db, $name, $username, $email, $password) {
    $id = $db->insert('users', [
        'name' => $name, 'username' => $username, 'email' => $email ?: null,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT), 'password_changed_at' => gmdate('Y-m-d H:i:s'),
    ]);
    $db->query("INSERT INTO user_roles (user_id, role_id) SELECT :u, id FROM roles WHERE code = 'superadmin'", ['u' => $id]);
    $db->query("INSERT INTO branch_user_assignments (branch_id, user_id, is_default) SELECT id, :u, 1 FROM branches WHERE code = 'ALM'", ['u' => $id]);
    App\Services\Audit::log('user.create', 'user', $id, "Superadministrador inicial creado por consola: $username", null, null, null, $id);
});
echo "Superadministrador «{$username}» creado. Ya puede iniciar sesión.\n";

<?php

/*
 * Nailora Beauty no lee este archivo: está como referencia.
 *
 * La configuración real se toma del archivo .env en la raíz del proyecto
 * (copie .env.example a .env). config/app.php y config/database.php leen
 * esas variables. Si su hosting no permite archivos .env, puede definir
 * las mismas variables de entorno desde el panel del hosting.
 *
 * Las opciones del negocio (WhatsApp, textos, envíos, políticas, etc.)
 * se editan desde /admin/configuracion y se guardan en la tabla `settings`.
 */

return [
    'APP_URL' => 'https://www.su-dominio.com',
    'DB_HOST' => '127.0.0.1',
    'DB_DATABASE' => 'nailora',
    'DB_USERNAME' => 'usuario_bd',
    'DB_PASSWORD' => '(definir en .env)',
];

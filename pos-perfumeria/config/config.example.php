<?php
// Copia este archivo como config.php y ajusta tus datos.
return [
    'app' => [
        'name'     => 'POS Perfumería',
        'env'      => 'production',          // 'development' muestra errores
        'timezone' => 'America/Bogota',
        // Llave secreta aleatoria (mínimo 32 caracteres) para firmar sesiones/CSRF
        'key'      => 'CAMBIA-ESTA-LLAVE-POR-UNA-ALEATORIA-DE-32+',
    ],
    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => 'pos_perfumeria',
        'user'    => 'root',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],
];

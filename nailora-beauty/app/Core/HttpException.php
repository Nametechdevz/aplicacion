<?php

declare(strict_types=1);

namespace App\Core;

use RuntimeException;

class HttpException extends RuntimeException
{
    public function __construct(private int $status, string $message = '')
    {
        parent::__construct($message !== '' ? $message : match ($status) {
            403 => 'No tiene permiso para realizar esta acción.',
            404 => 'La página que busca no existe o ya no está disponible.',
            405 => 'Método no permitido.',
            419 => 'La sesión del formulario expiró. Recargue la página e inténtelo de nuevo.',
            429 => 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
            default => 'Ocurrió un error.',
        });
    }

    public function getStatus(): int
    {
        return $this->status;
    }
}

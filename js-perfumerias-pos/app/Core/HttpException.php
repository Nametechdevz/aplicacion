<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/** Error controlado con código HTTP y mensaje apto para mostrar al usuario. */
class HttpException extends RuntimeException
{
    public function __construct(public readonly int $status, string $message = '', public readonly array $errors = [])
    {
        parent::__construct($message);
    }

    public static function forbidden(string $message = 'No tiene permiso para realizar esta acción.'): self
    {
        return new self(403, $message);
    }

    public static function notFound(string $message = 'El recurso solicitado no existe.'): self
    {
        return new self(404, $message);
    }
}

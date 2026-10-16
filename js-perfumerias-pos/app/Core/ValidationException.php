<?php
declare(strict_types=1);

namespace App\Core;

/** Error de validación o de regla de negocio (HTTP 422). */
final class ValidationException extends HttpException
{
    public function __construct(string $message, array $errors = [])
    {
        parent::__construct(422, $message, $errors);
    }

    public static function field(string $field, string $message): self
    {
        return new self($message, [$field => $message]);
    }
}

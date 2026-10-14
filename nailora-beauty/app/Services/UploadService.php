<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\ErrorHandler;
use DomainException;

/**
 * Subida segura de imágenes:
 *  - verifica el error de PHP, el tamaño y que el archivo venga de una subida HTTP;
 *  - detecta el tipo MIME real con finfo y getimagesize (no confía en la extensión);
 *  - genera un nombre aleatorio y la extensión según el tipo real;
 *  - re-codifica la imagen con GD cuando está disponible (elimina contenido incrustado
 *    y limita las dimensiones);
 *  - solo escribe en carpetas predefinidas dentro de public/uploads.
 */
final class UploadService
{
    private const FOLDERS = ['products', 'categories', 'settings'];

    /** Solo para pruebas automatizadas desde CLI. */
    public static bool $allowNonUploadedFiles = false;

    public static function storeImage(array $file, string $folder): string
    {
        if (!in_array($folder, self::FOLDERS, true)) {
            throw new DomainException('Carpeta de destino no permitida.');
        }
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            throw new DomainException(match ($error) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'La imagen supera el tamaño máximo permitido.',
                UPLOAD_ERR_PARTIAL => 'La imagen se subió de forma incompleta. Inténtelo de nuevo.',
                UPLOAD_ERR_NO_FILE => 'No se seleccionó ninguna imagen.',
                default => 'No se pudo subir la imagen.',
            });
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || (!self::$allowNonUploadedFiles && !is_uploaded_file($tmp))) {
            throw new DomainException('Archivo no válido.');
        }

        $maxBytes = (int) config('app.uploads.max_mb', 4) * 1024 * 1024;
        $size = filesize($tmp) ?: 0;
        if ($size <= 0 || $size > $maxBytes) {
            throw new DomainException('La imagen debe pesar como máximo ' . config('app.uploads.max_mb', 4) . ' MB.');
        }

        $allowed = config('app.uploads.allowed_mimes');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        try {
            $info = getimagesize($tmp);
        } catch (\ErrorException) {
            $info = false;
        }
        if (!isset($allowed[$mime]) || $info === false || ($info['mime'] ?? '') !== $mime) {
            throw new DomainException('Formato no permitido. Use imágenes JPG, PNG o WebP.');
        }
        [$width, $height] = $info;
        if ($width < 50 || $height < 50 || $width > 8000 || $height > 8000) {
            throw new DomainException('Las dimensiones de la imagen no son válidas (mínimo 50 px, máximo 8000 px).');
        }

        $dir = PUBLIC_PATH . '/uploads/' . $folder;
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new DomainException('No se pudo crear la carpeta de imágenes.');
        }
        if (!is_writable($dir)) {
            throw new DomainException('La carpeta de imágenes no tiene permisos de escritura. Revise la instalación.');
        }

        $name = bin2hex(random_bytes(16));
        $extension = $allowed[$mime];
        $target = $dir . '/' . $name . '.' . $extension;

        if (self::reencode($tmp, $mime, $width, $height, $dir . '/' . $name, $extension, $target)) {
            return 'uploads/' . $folder . '/' . basename($target);
        }

        $moved = self::$allowNonUploadedFiles ? copy($tmp, $target) : move_uploaded_file($tmp, $target);
        if (!$moved) {
            throw new DomainException('No se pudo guardar la imagen.');
        }
        chmod($target, 0644);
        return 'uploads/' . $folder . '/' . basename($target);
    }

    /** Re-codifica y redimensiona con GD. Devuelve false si GD no está disponible. */
    private static function reencode(string $tmp, string $mime, int $width, int $height, string $base, string &$extension, string &$target): bool
    {
        if (!extension_loaded('gd')) {
            return false;
        }
        try {
            $source = match ($mime) {
                'image/jpeg' => function_exists('imagecreatefromjpeg') ? imagecreatefromjpeg($tmp) : false,
                'image/png' => function_exists('imagecreatefrompng') ? imagecreatefrompng($tmp) : false,
                'image/webp' => function_exists('imagecreatefromwebp') ? imagecreatefromwebp($tmp) : false,
                default => false,
            };
        } catch (\ErrorException) {
            $source = false;
        }
        if ($source === false) {
            throw new DomainException('La imagen está dañada o no se puede procesar.');
        }

        $max = (int) config('app.uploads.max_dimension', 1600);
        $scale = min(1, $max / max($width, $height));
        $newW = max(1, (int) round($width * $scale));
        $newH = max(1, (int) round($height * $scale));
        $canvas = imagecreatetruecolor($newW, $newH);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, imagecolorallocatealpha($canvas, 255, 255, 255, 127));
        imagecopyresampled($canvas, $source, 0, 0, 0, 0, $newW, $newH, $width, $height);

        $ok = false;
        if (function_exists('imagewebp')) {
            $extension = 'webp';
            $target = $base . '.webp';
            $ok = imagewebp($canvas, $target, 82);
        } elseif ($mime === 'image/png') {
            $extension = 'png';
            $target = $base . '.png';
            $ok = imagepng($canvas, $target, 6);
        } else {
            $extension = 'jpg';
            $target = $base . '.jpg';
            $ok = imagejpeg($canvas, $target, 85);
        }
        imagedestroy($canvas);
        imagedestroy($source);
        if (!$ok) {
            ErrorHandler::log('GD no pudo escribir la imagen', ['target' => basename($target)]);
            throw new DomainException('No se pudo guardar la imagen.');
        }
        chmod($target, 0644);
        return true;
    }

    /** Elimina un archivo subido solo si está dentro de public/uploads. */
    public static function delete(?string $path): void
    {
        if ($path === null || $path === '' || !str_starts_with($path, 'uploads/') || str_contains($path, '..')) {
            return;
        }
        $root = realpath(PUBLIC_PATH . '/uploads');
        $file = realpath(PUBLIC_PATH . '/' . $path);
        if ($root === false || $file === false || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)) {
            return;
        }
        if (!unlink($file)) {
            ErrorHandler::log('No se pudo eliminar la imagen', ['path' => $path]);
        }
    }
}

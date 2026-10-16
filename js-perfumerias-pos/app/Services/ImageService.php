<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;

/**
 * Carga segura de fotografías de producto:
 *  - valida error de subida, tamaño, extensión y tipo MIME real (finfo),
 *  - verifica que sea una imagen decodificable,
 *  - la vuelve a codificar con GD a WebP (elimina metadatos y cualquier
 *    contenido incrustado), en dos tamaños: catálogo y miniatura,
 *  - guarda con nombres aleatorios en una carpeta sin ejecución de código.
 */
final class ImageService
{
    private const ALLOWED = ['image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png'], 'image/webp' => ['webp']];
    private const MAIN_SIZE = 1000;
    private const THUMB_SIZE = 360;
    private const MAX_PIXELS = 40_000_000;

    public function __construct(private ?Database $db = null, private ?string $dir = null)
    {
        $this->db ??= Database::connection();
        $this->dir ??= public_path('uploads/products');
    }

    public function upload(int $productId, array $file): int
    {
        Auth::authorize('products.manage');
        if (!$this->db->value('SELECT id FROM products WHERE id = :id', ['id' => $productId])) {
            throw HttpException::notFound('El producto no existe.');
        }
        $count = (int) $this->db->value('SELECT COUNT(*) FROM product_images WHERE product_id = :p', ['p' => $productId]);
        if ($count >= 8) {
            throw new ValidationException('Cada producto admite como máximo 8 imágenes.');
        }
        [$main, $thumb, $w, $h] = $this->process($file);
        return $this->db->transaction(function () use ($productId, $main, $thumb, $w, $h, $count) {
            $id = $this->db->insert('product_images', [
                'product_id' => $productId, 'file_name' => $main, 'thumb_name' => $thumb,
                'width' => $w, 'height' => $h, 'is_primary' => $count === 0 ? 1 : 0,
                'sort_order' => $count, 'created_by' => Auth::id(),
            ]);
            Audit::log('product.image_upload', 'product', $productId, 'Imagen cargada', null, ['image_id' => $id]);
            return $id;
        });
    }

    /** @return array{0:string,1:string,2:int,3:int} */
    public function process(array $file): array
    {
        if (!isset($file['error']) || is_array($file['error'])) {
            throw new ValidationException('No se recibió ninguna imagen.');
        }
        $maxBytes = (int) Config::get('app.upload_max_mb', 5) * 1024 * 1024;
        if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE || ($file['size'] ?? 0) > $maxBytes) {
            throw new ValidationException('La imagen supera el tamaño máximo de ' . Config::get('app.upload_max_mb', 5) . ' MB.');
        }
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new ValidationException('La imagen no se pudo cargar. Intente de nuevo.');
        }
        $tmp = (string) $file['tmp_name'];
        if (PHP_SAPI !== 'cli' && !is_uploaded_file($tmp)) {
            throw new ValidationException('Archivo no válido.');
        }
        $ext = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        if (!isset(self::ALLOWED[$mime]) || !in_array($ext, self::ALLOWED[$mime], true)) {
            throw new ValidationException('Formato no permitido. Use imágenes JPG, PNG o WebP.');
        }
        $info = @getimagesize($tmp);
        if (!$info || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > self::MAX_PIXELS) {
            throw new ValidationException('El archivo no es una imagen válida o sus dimensiones son excesivas.');
        }
        $src = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($tmp),
            'image/png' => @imagecreatefrompng($tmp),
            'image/webp' => @imagecreatefromwebp($tmp),
        };
        if (!$src) {
            throw new ValidationException('No fue posible procesar la imagen. Verifique que no esté dañada.');
        }
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $src = $this->orient($src, $tmp);
        }
        if (!is_dir($this->dir) && !mkdir($this->dir, 0755, true) && !is_dir($this->dir)) {
            throw new \RuntimeException('No se pudo crear el directorio de imágenes');
        }
        $name = bin2hex(random_bytes(16));
        [$mainFile, $w, $h] = $this->resizeTo($src, self::MAIN_SIZE, $name . '.webp', 82);
        [$thumbFile] = $this->resizeTo($src, self::THUMB_SIZE, $name . '_t.webp', 78);
        imagedestroy($src);
        return [$mainFile, $thumbFile, $w, $h];
    }

    public function delete(int $productId, int $imageId): void
    {
        Auth::authorize('products.manage');
        $img = $this->db->one('SELECT * FROM product_images WHERE id = :id AND product_id = :p', ['id' => $imageId, 'p' => $productId]);
        if (!$img) {
            throw HttpException::notFound('La imagen no existe.');
        }
        $this->db->transaction(function () use ($img, $productId) {
            $this->db->execute('DELETE FROM product_images WHERE id = :id', ['id' => $img['id']]);
            if ((int) $img['is_primary']) {
                $next = $this->db->value('SELECT id FROM product_images WHERE product_id = :p ORDER BY sort_order, id LIMIT 1', ['p' => $productId]);
                if ($next) {
                    $this->db->execute('UPDATE product_images SET is_primary = 1 WHERE id = :id', ['id' => $next]);
                }
            }
            Audit::log('product.image_delete', 'product', $productId, 'Imagen eliminada', ['image_id' => $img['id']], null);
        });
        foreach (['file_name', 'thumb_name'] as $f) {
            $path = $this->dir . '/' . basename($img[$f]);
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    public function setPrimary(int $productId, int $imageId): void
    {
        Auth::authorize('products.manage');
        if (!$this->db->value('SELECT id FROM product_images WHERE id = :id AND product_id = :p', ['id' => $imageId, 'p' => $productId])) {
            throw HttpException::notFound('La imagen no existe.');
        }
        $this->db->transaction(function () use ($productId, $imageId) {
            $this->db->execute('UPDATE product_images SET is_primary = (id = :id) WHERE product_id = :p', ['id' => $imageId, 'p' => $productId]);
        });
    }

    private function resizeTo(\GdImage $src, int $max, string $fileName, int $quality): array
    {
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, $max / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        if (!imagewebp($dst, $this->dir . '/' . $fileName, $quality)) {
            throw new \RuntimeException('No se pudo guardar la imagen');
        }
        imagedestroy($dst);
        return [$fileName, $nw, $nh];
    }

    private function orient(\GdImage $img, string $path): \GdImage
    {
        $exif = @exif_read_data($path);
        $o = (int) ($exif['Orientation'] ?? 1);
        $angle = match ($o) { 3 => 180, 6 => -90, 8 => 90, default => 0 };
        if ($angle !== 0) {
            $rot = imagerotate($img, $angle, 0);
            if ($rot) {
                imagedestroy($img);
                return $rot;
            }
        }
        return $img;
    }
}

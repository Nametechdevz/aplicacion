<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Plantillas PHP nativas. Las vistas escapan toda salida con e().
 * Un layout recibe $content con la vista ya renderizada.
 */
final class View
{
    public static function render(string $view, array $data = [], ?string $layout = 'layouts/app'): string
    {
        $content = self::partial($view, $data);
        if ($layout === null) {
            return $content;
        }
        return self::partial($layout, array_merge($data, ['content' => $content]));
    }

    public static function partial(string $__view, array $__data = []): string
    {
        $__file = dirname(__DIR__) . '/Views/' . $__view . '.php';
        if (!is_file($__file)) {
            throw new \RuntimeException("Vista no encontrada: $__view");
        }
        extract($__data, EXTR_SKIP);
        ob_start();
        try {
            include $__file;
        } catch (\Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        return (string) ob_get_clean();
    }
}

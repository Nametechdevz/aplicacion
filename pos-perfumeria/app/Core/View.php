<?php
namespace App\Core;

class View
{
    public static array $sections = [];

    public static function start(): void
    {
        ob_start();
    }

    public static function end(string $name = 'scripts'): void
    {
        self::$sections[$name] = (self::$sections[$name] ?? '') . ob_get_clean();
    }

    public static function section(string $name = 'scripts'): string
    {
        return self::$sections[$name] ?? '';
    }

    public static function render(string $view, array $data = [], ?string $layout = 'layout'): void
    {
        $content = self::capture($view, $data);
        if ($layout === null) {
            echo $content;
            return;
        }
        echo self::capture($layout, array_merge($data, ['content' => $content]));
    }

    public static function capture(string $view, array $data = []): string
    {
        $file = BASE_PATH . '/app/Views/' . $view . '.php';
        if (!is_file($file)) {
            throw new \RuntimeException("Vista no encontrada: $view");
        }
        extract($data, EXTR_SKIP);
        ob_start();
        include $file;
        return (string) ob_get_clean();
    }
}

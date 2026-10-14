<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Page
{
    public static function findActive(string $slug): ?array
    {
        return Database::fetch('SELECT * FROM pages WHERE slug = :slug AND is_active = 1', ['slug' => $slug]);
    }

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT * FROM pages WHERE id = :id', ['id' => $id]);
    }

    public static function all(): array
    {
        return Database::fetchAll('SELECT * FROM pages ORDER BY sort_order, title');
    }

    public static function footerLinks(): array
    {
        try {
            return Database::fetchAll('SELECT slug, title FROM pages WHERE is_active = 1 ORDER BY sort_order, title');
        } catch (\Throwable) {
            return [];
        }
    }

    public static function update(int $id, array $data): void
    {
        Database::update('pages', $data, 'id = :id', ['id' => $id]);
    }
}

<?php

declare(strict_types=1);

namespace App\Core;

final class Paginator
{
    public readonly int $page;
    public readonly int $lastPage;
    public readonly int $offset;

    public function __construct(public readonly int $total, public readonly int $perPage, int $page)
    {
        $this->lastPage = max(1, (int) ceil($total / max(1, $perPage)));
        $this->page = min(max(1, $page), $this->lastPage);
        $this->offset = ($this->page - 1) * $this->perPage;
    }

    public function hasPages(): bool
    {
        return $this->lastPage > 1;
    }

    public function from(): int
    {
        return $this->total === 0 ? 0 : $this->offset + 1;
    }

    public function to(): int
    {
        return min($this->total, $this->offset + $this->perPage);
    }

    /** URL de una página conservando el resto de parámetros de la consulta. */
    public function url(int $page, string $path, array $query, string $param = 'pagina'): string
    {
        $query = array_filter($query, static fn ($v) => $v !== '' && $v !== null && $v !== []);
        if ($page > 1) {
            $query[$param] = $page;
        } else {
            unset($query[$param]);
        }
        return url($path) . ($query ? '?' . http_build_query($query) : '');
    }

    /** Lista de páginas a mostrar con huecos ("…") representados por null. */
    public function window(int $around = 1): array
    {
        $pages = [];
        for ($i = 1; $i <= $this->lastPage; $i++) {
            if ($i === 1 || $i === $this->lastPage || abs($i - $this->page) <= $around) {
                $pages[] = $i;
            } elseif (end($pages) !== null) {
                $pages[] = null;
            }
        }
        return $pages;
    }
}

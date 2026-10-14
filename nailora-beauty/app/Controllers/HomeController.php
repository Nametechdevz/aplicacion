<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Page;
use App\Models\Product;
use App\Models\Promotion;
use App\Services\PricingService;

final class HomeController extends StorefrontController
{
    public function index(): void
    {
        $promotedIds = Promotion::promotedProductIds();
        $this->view('storefront/home', $this->seo('') + [
            'categories' => Category::active(),
            'featured' => PricingService::decorate(Product::featured(8)),
            'newest' => PricingService::decorate(Product::newest(4)),
            'bestSellers' => PricingService::decorate(Product::bestSellers(4, 2)),
            'onSale' => PricingService::decorate(Product::onSale($promotedIds, 4)),
            'brands' => Brand::withProducts(),
            'benefits' => $this->benefits(),
            'canonical' => url('/'),
        ]);
    }

    /** Beneficios editables en Configuración: una línea por beneficio, "Título|Descripción". */
    private function benefits(): array
    {
        $items = [];
        $icons = ['truck', 'chat', 'shield', 'gift'];
        foreach (preg_split('/\r?\n/', (string) setting('benefits', '')) as $i => $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            [$title, $text] = array_pad(array_map('trim', explode('|', $line, 2)), 2, '');
            $items[] = ['title' => $title, 'text' => $text, 'icon' => $icons[$i % count($icons)]];
        }
        return $items;
    }

    public function page(string $slug): void
    {
        $page = Page::findActive($slug);
        if (!$page) {
            abort(404);
        }
        $this->view('pages/show', $this->seo($page['title'], $page['meta_description']) + ['page' => $page]);
    }

    public function sitemap(): void
    {
        header('Content-Type: application/xml; charset=utf-8');
        $urls = [['loc' => url('/'), 'lastmod' => null], ['loc' => url('catalogo'), 'lastmod' => null]];
        foreach (Category::active() as $c) {
            $urls[] = ['loc' => url('categoria/' . $c['slug']), 'lastmod' => $c['updated_at']];
        }
        foreach (Product::sitemapEntries() as $p) {
            $urls[] = ['loc' => url('producto/' . $p['slug']), 'lastmod' => $p['updated_at']];
        }
        foreach (Page::footerLinks() as $p) {
            $urls[] = ['loc' => url('pagina/' . $p['slug']), 'lastmod' => null];
        }
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($urls as $u) {
            echo '  <url><loc>' . e($u['loc']) . '</loc>' . ($u['lastmod'] ? '<lastmod>' . date('Y-m-d', strtotime($u['lastmod'])) . '</lastmod>' : '') . "</url>\n";
        }
        echo '</urlset>';
    }

    public function robots(): void
    {
        header('Content-Type: text/plain; charset=utf-8');
        echo "User-agent: *\n";
        echo "Disallow: /admin\n";
        echo "Disallow: /carrito\n";
        echo "Disallow: /checkout\n";
        echo "Disallow: /pedido/\n";
        echo "Disallow: /instalar\n";
        echo "\nSitemap: " . url('sitemap.xml') . "\n";
    }
}

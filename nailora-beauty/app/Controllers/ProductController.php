<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\PricingService;
use App\Services\ShippingService;
use App\Services\WhatsAppService;

final class ProductController extends StorefrontController
{
    public function index(): void
    {
        $this->catalog(null, null);
    }

    public function category(string $slug): void
    {
        $category = Category::findActiveBySlug($slug);
        if (!$category) {
            abort(404, 'Esta categoría no existe o no está disponible.');
        }
        $this->catalog($category, null);
    }

    public function brand(string $slug): void
    {
        $brand = Brand::findActiveBySlug($slug);
        if (!$brand) {
            abort(404, 'Esta marca no existe o no está disponible.');
        }
        $this->catalog(null, $brand);
    }

    private function catalog(?array $category, ?array $brand): void
    {
        $r = $this->request;
        $categories = Category::active();
        $brands = Brand::withProducts();
        $types = Product::types();

        // Filtros saneados: cualquier valor no reconocido se ignora
        $categorySlug = $category['slug'] ?? (string) $r->query('categoria', '');
        if (!$category && $categorySlug !== '') {
            $category = Category::findActiveBySlug($categorySlug);
        }
        $brandSlug = $brand['slug'] ?? (string) $r->query('marca', '');
        if (!$brand && $brandSlug !== '') {
            $brand = Brand::findActiveBySlug($brandSlug);
        }
        $type = (string) $r->query('tipo', '');
        if ($type !== '' && !in_array($type, array_column($types, 'name'), true)) {
            $type = '';
        }
        $sort = (string) $r->query('orden', 'relevancia');
        if (!isset(Product::SORTS[$sort])) {
            $sort = 'relevancia';
        }
        $min = parse_money($r->query('min'));
        $max = parse_money($r->query('max'));
        if ($min !== null && $max !== null && $min > $max) {
            [$min, $max] = [$max, $min];
        }
        $q = mb_substr((string) $r->query('q', ''), 0, 80);
        $inStock = $r->query('disponibles') === '1';
        $page = max(1, (int) $r->query('pagina', 1));

        $filters = [
            'q' => $q,
            'category_id' => $category['id'] ?? null,
            'brand_id' => $brand['id'] ?? null,
            'type' => $type,
            'min' => $min,
            'max' => $max,
            'in_stock' => $inStock,
            'sort' => $sort,
        ];
        [$products, $pager] = Product::search($filters, $page, (int) config('app.catalog.per_page', 12));
        $products = PricingService::decorate($products);

        // Parámetros activos para conservarlos en la paginación y en los enlaces
        $query = array_filter([
            'q' => $q,
            'categoria' => $category && !str_starts_with($this->request->path, '/categoria/') ? $category['slug'] : null,
            'marca' => $brand && !str_starts_with($this->request->path, '/marca/') ? $brand['slug'] : null,
            'tipo' => $type,
            'min' => $min !== null ? (int) $min : null,
            'max' => $max !== null ? (int) $max : null,
            'disponibles' => $inStock ? '1' : null,
            'orden' => $sort !== 'relevancia' ? $sort : null,
        ], static fn ($v) => $v !== null && $v !== '');

        $title = $category['name'] ?? ($brand['name'] ?? ($q !== '' ? 'Resultados para "' . $q . '"' : 'Catálogo'));
        $description = $category['description'] ?? 'Explora esmaltes, geles, herramientas y accesorios para uñas con envíos a toda Colombia.';
        $basePath = $category && str_starts_with($this->request->path, '/categoria/') ? 'categoria/' . $category['slug']
            : ($brand && str_starts_with($this->request->path, '/marca/') ? 'marca/' . $brand['slug'] : 'catalogo');

        $seo = $this->seo($title, $description);
        $seo['canonical'] = $pager->url($pager->page, $basePath, array_intersect_key($query, ['pagina' => 1]));
        if ($q !== '' || count($query) > 1) {
            $seo['robots'] = 'noindex,follow';
        }

        $this->view('storefront/catalog', $seo + [
            'products' => $products,
            'pager' => $pager,
            'categories' => $categories,
            'brands' => $brands,
            'types' => $types,
            'category' => $category,
            'brand' => $brand,
            'filters' => $filters,
            'query' => $query,
            'basePath' => $basePath,
            'heading' => $title,
            'priceBounds' => Product::priceBounds(),
        ]);
    }

    public function show(string $slug): void
    {
        $product = Product::findActiveBySlug($slug);
        if (!$product) {
            abort(404, 'Este producto no existe o ya no está disponible.');
        }
        $images = Product::images((int) $product['id']);
        $variants = [];
        if ((int) $product['has_variants'] === 1) {
            foreach (ProductVariant::forProduct((int) $product['id'], true) as $variant) {
                $variant['pricing'] = PricingService::price($product, $variant);
                $variants[] = $variant;
            }
        }
        $pricing = PricingService::price($product, $variants[0] ?? null);
        $related = PricingService::decorate(Product::related($product, 4));
        $productUrl = url('producto/' . $product['slug']);

        $seo = $this->seo(
            $product['meta_title'] ?: $product['name'],
            $product['meta_description'] ?: ($product['short_description'] ?: $product['name']),
            [
                'canonical' => $productUrl,
                'ogImage' => $images ? image_url($images[0]['path']) : null,
                'ogType' => 'product',
            ]
        );

        $this->view('storefront/product', $seo + [
            'product' => $product,
            'images' => $images,
            'variants' => $variants,
            'pricing' => $pricing,
            'related' => $related,
            'shipping' => ShippingService::quote(0),
            'consultLink' => WhatsAppService::link(WhatsAppService::productMessage($product, $productUrl)),
            'structuredData' => $this->structuredData($product, $images, $variants, $pricing, $productUrl),
        ]);
    }

    /** Datos estructurados schema.org/Product con información real (precio y disponibilidad actuales). */
    private function structuredData(array $product, array $images, array $variants, array $pricing, string $productUrl): array
    {
        $data = [
            '@context' => 'https://schema.org',
            '@type' => 'Product',
            'name' => $product['name'],
            'sku' => $product['sku'],
            'description' => str_limit(strip_tags((string) ($product['short_description'] ?: $product['description'])), 300),
            'url' => $productUrl,
            'category' => $product['category_name'],
        ];
        if ($images) {
            $data['image'] = array_map(static fn ($img) => image_url($img['path']), $images);
        }
        if (!empty($product['brand_name'])) {
            $data['brand'] = ['@type' => 'Brand', 'name' => $product['brand_name']];
        }
        $availability = (int) $product['available_stock'] > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
        if ($variants) {
            $prices = array_map(static fn ($v) => $v['pricing']['final'], $variants);
            $data['offers'] = [
                '@type' => 'AggregateOffer',
                'priceCurrency' => 'COP',
                'lowPrice' => (string) round(min($prices)),
                'highPrice' => (string) round(max($prices)),
                'offerCount' => count($variants),
                'availability' => $availability,
            ];
        } else {
            $data['offers'] = [
                '@type' => 'Offer',
                'priceCurrency' => 'COP',
                'price' => (string) round($pricing['final']),
                'availability' => $availability,
                'url' => $productUrl,
            ];
        }
        return $data;
    }
}

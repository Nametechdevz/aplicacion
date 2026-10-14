<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Request;
use App\Core\View;
use App\Models\Category;
use App\Models\Page;
use App\Services\CartService;
use App\Services\WhatsAppService;

abstract class StorefrontController extends Controller
{
    public function __construct(Request $request)
    {
        parent::__construct($request);
        View::share('navCategories', Category::active());
        View::share('footerPages', Page::footerLinks());
        View::share('cartCount', CartService::count());
        View::share('whatsappLink', WhatsAppService::link('Hola, ' . setting('store_name') . '. Quisiera más información.'));
    }

    /** Metadatos SEO comunes. */
    protected function seo(string $title, ?string $description = null, array $extra = []): array
    {
        $store = (string) setting('store_name');
        return array_merge([
            'pageTitle' => $title === '' ? $store . ' — ' . setting('store_tagline', '') : $title . ' | ' . $store,
            'metaDescription' => str_limit($description ?? (string) setting('store_description', ''), 160),
            'canonical' => url(ltrim($this->request->path, '/')),
            'ogImage' => null,
            'ogType' => 'website',
            'robots' => 'index,follow',
        ], $extra);
    }
}

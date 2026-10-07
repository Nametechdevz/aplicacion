<?php
namespace App\Controllers;

class BrandController extends SimpleCatalogController
{
    protected function table(): string { return 'brands'; }
    protected function label(): string { return 'Marcas'; }
    protected function path(): string { return '/brands'; }
}

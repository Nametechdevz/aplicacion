<?php
namespace App\Controllers;

class CategoryController extends SimpleCatalogController
{
    protected function table(): string { return 'categories'; }
    protected function label(): string { return 'Categorías'; }
    protected function path(): string { return '/categories'; }
}

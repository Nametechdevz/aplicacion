<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Validator;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Product;
use App\Models\Promotion;

final class PromotionController extends AdminController
{
    public function index(): void
    {
        $this->render('promotions/index', ['title' => 'Promociones', 'promotions' => Promotion::all()], ['Promociones' => null]);
    }

    public function create(): void
    {
        $this->form(null);
    }

    public function edit(string $id): void
    {
        $this->form(Promotion::find((int) $id) ?? abort(404));
    }

    private function form(?array $promotion): void
    {
        $this->render('promotions/form', [
            'title' => $promotion ? 'Editar promoción' : 'Nueva promoción',
            'promotion' => $promotion,
            'products' => Product::options(),
            'categories' => Category::all(),
        ], ['Promociones' => 'admin/promociones', $promotion['name'] ?? 'Nueva' => null]);
    }

    private function validated(?array $promotion): array
    {
        $back = $promotion ? 'admin/promociones/' . $promotion['id'] . '/editar' : 'admin/promociones/nueva';
        $input = $this->request->all();
        $parsed = parse_money($input['discount_value'] ?? null);
        $input['discount_value'] = $parsed === null ? '' : (string) $parsed;
        $v = Validator::make($input, [
            'name' => 'required|string|min:3|max:150',
            'discount_type' => 'required|in:percent,fixed',
            'discount_value' => 'required|numeric|min:1|max:99999999',
            'scope' => 'required|in:all,products,categories',
            'starts_at' => 'required|datetime',
            'ends_at' => 'required|datetime',
            'is_active' => 'bool',
        ], ['name' => 'nombre', 'discount_value' => 'valor del descuento', 'starts_at' => 'inicio', 'ends_at' => 'fin', 'scope' => 'alcance']);
        $data = $v->validated();
        if (!$v->fails()) {
            if ($data['discount_type'] === 'percent' && $data['discount_value'] > 90) {
                $v->addError('discount_value', 'El porcentaje máximo permitido es 90%.');
            }
            if ($data['ends_at'] <= $data['starts_at']) {
                $v->addError('ends_at', 'La fecha de fin debe ser posterior a la de inicio.');
            }
        }
        $productIds = array_values(array_filter(array_map('intval', (array) ($input['product_ids'] ?? []))));
        $categoryIds = array_values(array_filter(array_map('intval', (array) ($input['category_ids'] ?? []))));
        if (($data['scope'] ?? '') === 'products' && !$productIds) {
            $v->addError('product_ids', 'Seleccione al menos un producto.');
        }
        if (($data['scope'] ?? '') === 'categories' && !$categoryIds) {
            $v->addError('category_ids', 'Seleccione al menos una categoría.');
        }
        if ($v->fails()) {
            $this->failValidation($v->errors(), $back);
        }
        // Solo ids existentes
        $validProducts = array_column(Product::options(), 'id');
        $validCategories = array_column(Category::all(), 'id');
        return [
            [
                'name' => clean_text($data['name'], 150),
                'discount_type' => $data['discount_type'],
                'discount_value' => round((float) $data['discount_value'], $data['discount_type'] === 'percent' ? 2 : 0),
                'scope' => $data['scope'],
                'starts_at' => $data['starts_at'],
                'ends_at' => $data['ends_at'],
                'is_active' => $data['is_active'],
            ],
            array_values(array_intersect($productIds, $validProducts)),
            array_values(array_intersect($categoryIds, $validCategories)),
        ];
    }

    public function store(): void
    {
        [$data, $products, $categories] = $this->validated(null);
        $id = Promotion::save(null, $data, $products, $categories);
        AuditLog::record('promotion.create', 'promotion', $id, $data);
        $this->done('Promoción creada.', 'admin/promociones');
    }

    public function update(string $id): void
    {
        $promotion = Promotion::find((int) $id) ?? abort(404);
        [$data, $products, $categories] = $this->validated($promotion);
        Promotion::save((int) $id, $data, $products, $categories);
        AuditLog::record('promotion.update', 'promotion', (int) $id, $data);
        $this->done('Promoción actualizada.', 'admin/promociones');
    }

    public function toggle(string $id): void
    {
        $promotion = Promotion::find((int) $id) ?? abort(404);
        $active = !(int) $promotion['is_active'];
        Promotion::setActive((int) $id, $active);
        AuditLog::record($active ? 'promotion.activate' : 'promotion.deactivate', 'promotion', (int) $id);
        $this->done($active ? 'Promoción activada (se aplica solo dentro de sus fechas).' : 'Promoción desactivada.', 'admin/promociones');
    }

    public function destroy(string $id): void
    {
        $promotion = Promotion::find((int) $id) ?? abort(404);
        Promotion::delete((int) $id);
        AuditLog::record('promotion.delete', 'promotion', (int) $id, ['name' => $promotion['name']]);
        $this->done('Promoción eliminada. Los pedidos anteriores conservan el descuento que tenían.', 'admin/promociones');
    }
}

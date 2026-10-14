<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Database;
use App\Core\Paginator;
use App\Core\Session;
use App\Models\AuditLog;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\InventoryService;
use DomainException;

final class InventoryController extends AdminController
{
    /** Existencias por unidad de inventario (producto simple o variante). */
    public function index(): void
    {
        $q = mb_substr((string) $this->request->query('q', ''), 0, 80);
        $state = (string) $this->request->query('estado', '');
        $where = ['1=1'];
        $params = [];
        if ($q !== '') {
            $where[] = '(s.name LIKE :q1 OR s.sku LIKE :q2 OR s.variant_name LIKE :q3)';
            $params['q1'] = $params['q2'] = $params['q3'] = "%$q%";
        }
        match ($state) {
            'agotados' => $where[] = 's.stock = 0',
            'bajo' => $where[] = 's.stock > 0 AND s.stock <= s.low_stock_threshold',
            default => null,
        };
        $base = "SELECT * FROM (
                SELECT p.id AS product_id, NULL AS variant_id, p.name, NULL AS variant_name, p.sku, p.stock, p.low_stock_threshold, p.is_active, p.cost_price, p.price
                FROM products p WHERE p.has_variants = 0
                UNION ALL
                SELECT p.id, v.id, p.name, v.name, v.sku, v.stock, p.low_stock_threshold, (p.is_active AND v.is_active), p.cost_price, COALESCE(v.price, p.price)
                FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.has_variants = 1
            ) s WHERE " . implode(' AND ', $where);
        $total = (int) Database::value("SELECT COUNT(*) FROM ($base) t", $params);
        $pager = new Paginator($total, $this->perPage(), $this->page());
        $rows = Database::fetchAll("$base ORDER BY (s.stock = 0) DESC, (s.stock <= s.low_stock_threshold) DESC, s.name, s.variant_name LIMIT {$pager->perPage} OFFSET {$pager->offset}", $params);

        $this->render('inventory/index', [
            'title' => 'Inventario',
            'rows' => $rows,
            'pager' => $pager,
            'q' => $q,
            'state' => $state,
            'query' => array_filter(['q' => $q, 'estado' => $state]),
            'counts' => Product::countByStock(),
        ], ['Inventario' => null]);
    }

    public function movements(): void
    {
        $f = [
            'product_id' => (int) $this->request->query('producto', 0),
            'type' => (string) $this->request->query('tipo', ''),
            'from' => $this->validDate($this->request->query('desde')),
            'to' => $this->validDate($this->request->query('hasta')),
        ];
        [$rows, $pager] = InventoryMovement::paginate($f, $this->page(), 30);
        $this->render('inventory/movements', [
            'title' => 'Historial de inventario',
            'rows' => $rows,
            'pager' => $pager,
            'filters' => $f,
            'products' => Product::options(),
            'query' => array_filter(['producto' => $f['product_id'] ?: null, 'tipo' => $f['type'], 'desde' => $f['from'], 'hasta' => $f['to']]),
        ], ['Inventario' => 'admin/inventario', 'Historial' => null]);
    }

    private function validDate(?string $value): ?string
    {
        $d = $value ? \DateTime::createFromFormat('Y-m-d', $value) : false;
        return $d && $d->format('Y-m-d') === $value ? $value : null;
    }

    public function adjustForm(): void
    {
        $productId = (int) $this->request->query('producto', 0);
        $product = $productId ? Product::find($productId) : null;
        $variants = $product && (int) $product['has_variants'] ? ProductVariant::forProduct($productId) : [];
        $this->render('inventory/adjust', [
            'title' => 'Registrar movimiento',
            'products' => Product::options(),
            'product' => $product,
            'variants' => $variants,
            'variantId' => (int) $this->request->query('variante', 0),
            'recent' => $product ? InventoryMovement::paginate(['product_id' => $productId], 1, 8)[0] : [],
        ], ['Inventario' => 'admin/inventario', 'Movimiento' => null]);
    }

    public function adjust(): void
    {
        $r = $this->request;
        $productId = $r->int('product_id');
        $variantId = $r->int('variant_id') ?: null;
        $type = (string) $r->input('movement_type', '');
        $quantity = $r->int('quantity', -1);
        $reason = clean_text((string) $r->input('reason', ''), 255);
        $reference = clean_text((string) $r->input('reference', ''), 120);
        $back = 'admin/inventario/ajustar?producto=' . $productId . ($variantId ? '&variante=' . $variantId : '');

        try {
            if (!Product::find($productId)) {
                throw new DomainException('Seleccione un producto.');
            }
            if ($quantity < 0) {
                throw new DomainException('Ingrese una cantidad válida.');
            }
            $result = InventoryService::adjust($productId, $variantId, $type, $quantity, $reason, $reference ?: null, auth_id());
        } catch (DomainException $e) {
            Session::flashInput($r->all());
            $this->done($e->getMessage(), $back, 'error');
        }
        AuditLog::record('inventory.adjust', 'product', $productId, ['variant_id' => $variantId, 'type' => $type, 'before' => $result['before'], 'after' => $result['after']]);
        $this->done("Movimiento registrado: existencias {$result['before']} → {$result['after']}.", $back);
    }
}

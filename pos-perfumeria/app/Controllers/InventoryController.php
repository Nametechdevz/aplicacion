<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;
use App\Services\Inventory;

class InventoryController extends Controller
{
    public function index(): void
    {
        $where = 'p.active = 1';
        $params = [];
        if (input('filter') === 'low') {
            $where .= ' AND p.stock <= p.min_stock';
        } elseif (input('filter') === 'out') {
            $where .= ' AND p.stock <= 0';
        }
        if ($q = (string) input('q', '')) {
            $where .= ' AND (p.name LIKE ? OR p.code LIKE ? OR b.name LIKE ?)';
            array_push($params, "%$q%", "%$q%", "%$q%");
        }
        $totals = DB::one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(GREATEST(stock,0)),0) AS units, COALESCE(SUM(GREATEST(stock,0) * cost),0) AS cost_value,
                    COALESCE(SUM(GREATEST(stock,0) * price),0) AS price_value
               FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE $where",
            $params
        );
        $pg = paginate((int) $totals['n'], 40);
        $rows = DB::all(
            "SELECT p.*, b.name AS brand,
                    (SELECT COALESCE(SUM(-qty),0) FROM inventory_movements m WHERE m.product_id = p.id AND m.type = 'venta' AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS sold30
               FROM products p LEFT JOIN brands b ON b.id = p.brand_id
              WHERE $where ORDER BY (p.stock <= p.min_stock) DESC, b.name, p.name LIMIT {$pg['limit']} OFFSET {$pg['offset']}",
            $params
        );
        $this->view('inventory/index', ['title' => 'Inventario', 'rows' => $rows, 'totals' => $totals, 'pg' => $pg]);
    }

    public function kardex(): void
    {
        $productId = (int) input('product_id', 0);
        $from = (string) input('from', date('Y-m-d', strtotime('-30 days')));
        $to = (string) input('to', date('Y-m-d'));
        $where = 'DATE(m.created_at) BETWEEN ? AND ?';
        $params = [$from, $to];
        if ($productId) {
            $where .= ' AND m.product_id = ?';
            $params[] = $productId;
        }
        if (in_array($t = (string) input('type', ''), ['compra', 'venta', 'devolucion', 'ajuste_entrada', 'ajuste_salida', 'inicial'], true)) {
            $where .= ' AND m.type = ?';
            $params[] = $t;
        }
        $pg = paginate((int) DB::value("SELECT COUNT(*) FROM inventory_movements m WHERE $where", $params), 50);
        $rows = DB::all(
            "SELECT m.*, p.name AS product, p.code, u.name AS user_name FROM inventory_movements m
               JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.user_id
              WHERE $where ORDER BY m.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}",
            $params
        );
        $product = $productId ? DB::one('SELECT * FROM products WHERE id = ?', [$productId]) : null;
        $products = DB::all('SELECT id, name, code, size_ml FROM products ORDER BY name');
        $this->view('inventory/kardex', ['title' => 'Kárdex de inventario', 'rows' => $rows, 'pg' => $pg, 'from' => $from, 'to' => $to, 'product' => $product, 'products' => $products]);
    }

    public function adjustForm(): void
    {
        $products = DB::all('SELECT p.id, p.name, p.code, p.stock, p.size_ml, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.active = 1 ORDER BY p.name');
        $this->view('inventory/adjust', ['title' => 'Ajuste de inventario', 'products' => $products, 'selected' => (int) input('product_id', 0)]);
    }

    public function adjust(): void
    {
        $productId = (int) input('product_id', 0);
        $mode = (string) input('mode', 'set');
        $qty = (int) input('qty', 0);
        $note = mb_substr((string) input('note', ''), 0, 255);
        $p = DB::one('SELECT * FROM products WHERE id = ?', [$productId]);
        if (!$p || $note === '') {
            flash('danger', 'Selecciona el producto e indica el motivo del ajuste.');
            redirect('/inventory/adjust?product_id=' . $productId);
        }
        $delta = match ($mode) {
            'add'      => abs($qty),
            'subtract' => -abs($qty),
            default    => $qty - (int) $p['stock'], // conteo físico
        };
        if ($delta === 0) {
            flash('info', 'No hubo cambios en el stock.');
            redirect('/inventory');
        }
        DB::transaction(fn() => Inventory::move($productId, $delta > 0 ? 'ajuste_entrada' : 'ajuste_salida', $delta, null, null, $note, Auth::id()));
        flash('success', "Stock de {$p['name']} ajustado: " . ($delta > 0 ? '+' : '') . $delta . ' unidades.');
        redirect('/inventory/kardex?product_id=' . $productId);
    }
}

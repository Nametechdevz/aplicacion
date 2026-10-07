<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;
use App\Services\Inventory;
use RuntimeException;

class PurchaseController extends Controller
{
    public function index(): void
    {
        $pg = paginate((int) DB::value('SELECT COUNT(*) FROM purchases'), 30);
        $rows = DB::all(
            "SELECT p.*, s.name AS supplier, u.name AS user_name, (SELECT SUM(qty) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS units
               FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id JOIN users u ON u.id = p.user_id
              ORDER BY p.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}"
        );
        $this->view('purchases/index', ['title' => 'Compras', 'rows' => $rows, 'pg' => $pg]);
    }

    public function create(): void
    {
        $this->view('purchases/form', [
            'title'     => 'Registrar compra',
            'suppliers' => DB::all('SELECT id, name, nit FROM suppliers ORDER BY name'),
            'products'  => DB::all('SELECT p.id, p.code, p.name, p.size_ml, p.cost, p.tax_rate, p.stock, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.active = 1 ORDER BY p.name'),
        ]);
    }

    public function store(): void
    {
        try {
            $items = [];
            foreach ((array) ($_POST['items'] ?? []) as $it) {
                $qty = (int) ($it['qty'] ?? 0);
                $pid = (int) ($it['product_id'] ?? 0);
                if ($qty <= 0 || !$pid) {
                    continue;
                }
                $cost = round((float) ($it['unit_cost'] ?? 0), 2);
                $rate = (float) ($it['tax_rate'] ?? 0);
                $sub = round($cost * $qty, 2);
                $tax = round($sub * $rate / 100, 2);
                $items[] = ['product_id' => $pid, 'qty' => $qty, 'unit_cost' => $cost, 'tax_rate' => $rate, 'subtotal' => $sub, 'tax' => $tax, 'total' => $sub + $tax];
            }
            if (!$items) {
                throw new RuntimeException('Agrega al menos un producto con cantidad.');
            }
            $id = DB::transaction(function () use ($items) {
                $id = DB::insert('purchases', [
                    'supplier_id'    => (int) input('supplier_id', 0) ?: null,
                    'user_id'        => Auth::id(),
                    'invoice_number' => mb_substr((string) input('invoice_number', ''), 0, 60) ?: null,
                    'purchase_date'  => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) input('purchase_date')) ? input('purchase_date') : date('Y-m-d'),
                    'subtotal'       => round(array_sum(array_column($items, 'subtotal')), 2),
                    'tax_total'      => round(array_sum(array_column($items, 'tax')), 2),
                    'total'          => round(array_sum(array_column($items, 'total')), 2),
                    'notes'          => mb_substr((string) input('notes', ''), 0, 255) ?: null,
                ]);
                foreach ($items as $it) {
                    DB::insert('purchase_items', ['purchase_id' => $id] + $it);
                    Inventory::move($it['product_id'], 'compra', $it['qty'], $it['unit_cost'], 'COMPRA-' . $id, input('invoice_number') ? 'Factura proveedor ' . input('invoice_number') : null, Auth::id());
                }
                return $id;
            });
            flash('success', 'Compra registrada y stock actualizado.');
            redirect('/purchases/' . $id);
        } catch (RuntimeException $e) {
            flash('danger', $e->getMessage());
            redirect('/purchases/create');
        }
    }

    public function show(int $id): void
    {
        $p = DB::one('SELECT p.*, s.name AS supplier, s.nit, u.name AS user_name FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id JOIN users u ON u.id = p.user_id WHERE p.id = ?', [$id]) ?? redirect('/purchases');
        $items = DB::all('SELECT pi.*, pr.name, pr.code, pr.size_ml FROM purchase_items pi JOIN products pr ON pr.id = pi.product_id WHERE pi.purchase_id = ?', [$id]);
        $this->view('purchases/show', ['title' => 'Compra #' . $id, 'p' => $p, 'items' => $items]);
    }
}

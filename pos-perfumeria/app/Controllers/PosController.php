<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;
use App\Core\Settings;
use App\Services\Cash;
use App\Services\SaleService;

class PosController extends Controller
{
    public function index(): void
    {
        $session = Cash::openSession(Auth::id());
        $products = DB::all(
            'SELECT p.id, p.code, p.name, p.price, p.tax_rate, p.stock, p.size_ml, p.concentration, p.gender, p.image, p.category_id,
                    b.name AS brand
               FROM products p LEFT JOIN brands b ON b.id = p.brand_id
              WHERE p.active = 1 ORDER BY b.name, p.name'
        );
        $categories = DB::all('SELECT c.id, c.name FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.active = 1) ORDER BY c.name');
        $consumer = DB::one('SELECT id, name, doc_type, doc_number, email FROM customers WHERE id = 1');
        $this->view('pos/index', [
            'title'       => 'Punto de venta',
            'bodyClass'   => 'pos-page',
            'session'     => $session,
            'products'    => $products,
            'categories'  => $categories,
            'consumer'    => $consumer,
            'maxDiscount' => Auth::isAdmin() ? 100 : (float) Settings::get('cashier_max_discount', '20'),
            'allowNegative' => Settings::get('allow_negative_stock', '0') === '1',
            'hasFev'      => (bool) DB::value("SELECT COUNT(*) FROM numbering_ranges WHERE doc_type = 'FEV' AND active = 1"),
        ]);
    }

    public function searchProducts(): void
    {
        $q = trim((string) input('q', ''));
        if ($q === '') {
            json_response(['ok' => true, 'items' => []]);
        }
        $like = '%' . $q . '%';
        $items = DB::all(
            'SELECT p.id, p.code, p.name, p.price, p.tax_rate, p.stock, p.size_ml, p.concentration, b.name AS brand
               FROM products p LEFT JOIN brands b ON b.id = p.brand_id
              WHERE p.active = 1 AND (p.code = ? OR p.name LIKE ? OR b.name LIKE ? OR p.code LIKE ?)
              ORDER BY (p.code = ?) DESC, p.name LIMIT 20',
            [$q, $like, $like, $like, $q]
        );
        json_response(['ok' => true, 'items' => $items]);
    }

    public function checkout(): void
    {
        try {
            $result = SaleService::create($this->jsonBody(), Auth::user());
            $sale = DB::one('SELECT id, full_number, doc_type, total, change_amount FROM sales WHERE id = ?', [$result['sale_id']]);
            json_response([
                'ok'          => true,
                'sale'        => $sale,
                'edoc_status' => $result['edoc']['status'] ?? 'error',
                'edoc_message'=> $result['edoc']['response'] ?? '',
                'ticket_url'  => url('/sales/' . $sale['id'] . '/' . ($sale['doc_type'] === 'FEV' ? 'invoice' : 'ticket')),
                'sale_url'    => url('/sales/' . $sale['id']),
            ]);
        } catch (\RuntimeException $e) {
            json_response(['ok' => false, 'error' => $e->getMessage()], 422);
        }
    }
}

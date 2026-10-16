<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Response;

/** Búsqueda global y centro de notificaciones (respetan permisos y sucursales). */
final class SearchController extends Controller
{
    public function search(): Response
    {
        $q = mb_substr($this->request->str('q'), 0, 60);
        if (mb_strlen($q) < 2) {
            return $this->json(['ok' => true]);
        }
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $out = ['ok' => true, 'products' => [], 'sales' => [], 'customers' => [], 'transfers' => []];
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);

        if (Auth::can('products.view')) {
            $rows = $this->db->all(
                "SELECT p.id, p.name, p.code, b.name AS brand,
                        (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS thumb
                 FROM products p LEFT JOIN brands b ON b.id = p.brand_id
                 WHERE p.name LIKE :q1 OR p.code LIKE :q2 OR p.sku LIKE :q3 OR p.barcode = :exact ORDER BY p.is_active DESC, p.name LIMIT 6",
                ['q1' => $like, 'q2' => $like, 'q3' => $like, 'exact' => $q]
            );
            foreach ($rows as $r) {
                $out['products'][] = ['title' => $r['name'], 'sub' => trim(($r['brand'] ?? '') . ' · ' . $r['code'], ' ·'), 'url' => url('/products/' . $r['id']), 'thumb' => upload_url($r['thumb'])];
            }
        }
        if (Auth::can('sales.view_own') || Auth::can('sales.view_branch')) {
            $own = Auth::can('sales.view_branch') ? '' : ' AND s.user_id = :uid';
            $params = array_merge($bp, ['q1' => $like, 'q2' => $like]);
            if ($own) {
                $params['uid'] = Auth::id();
            }
            $rows = $this->db->all(
                "SELECT s.id, s.number, s.total, s.created_at, c.full_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
                 WHERE s.branch_id IN ($in) $own AND (s.number LIKE :q1 OR c.full_name LIKE :q2) ORDER BY s.id DESC LIMIT 5",
                $params
            );
            foreach ($rows as $r) {
                $out['sales'][] = ['title' => $r['number'] . ' · ' . money($r['total']), 'sub' => fmt_dt($r['created_at']) . ($r['full_name'] ? ' · ' . $r['full_name'] : ''), 'url' => url('/sales/' . $r['id'])];
            }
        }
        if (Auth::can('customers.view')) {
            $rows = $this->db->all(
                'SELECT id, full_name, phone, document_number FROM customers WHERE full_name LIKE :q1 OR phone LIKE :q2 OR document_number LIKE :q3 ORDER BY full_name LIMIT 5',
                ['q1' => $like, 'q2' => $like, 'q3' => $like]
            );
            foreach ($rows as $r) {
                $out['customers'][] = ['title' => $r['full_name'], 'sub' => trim(($r['document_number'] ?? '') . ' ' . ($r['phone'] ?? '')), 'url' => url('/customers/' . $r['id'])];
            }
        }
        if (Auth::can('transfers.request') || Auth::can('transfers.approve') || Auth::can('transfers.receive')) {
            [$in2, $bp2] = Database::in(Auth::branchIds() ?: [0], 'c');
            $rows = $this->db->all(
                "SELECT t.id, t.number, t.status FROM stock_transfers t WHERE t.number LIKE :q1 AND (t.from_branch_id IN ($in) OR t.to_branch_id IN ($in2)) ORDER BY t.id DESC LIMIT 4",
                array_merge($bp, $bp2, ['q1' => $like])
            );
            foreach ($rows as $r) {
                $out['transfers'][] = ['title' => $r['number'], 'sub' => strip_tags(status_badge($r['status'])), 'url' => url('/transfers/' . $r['id'])];
            }
        }
        return $this->json($out);
    }

    public function notifications(): Response
    {
        $items = [];
        $ids = Auth::branchIds() ?: [0];
        [$in, $bp] = Database::in($ids);
        if (Auth::can('discounts.approve')) {
            $rows = $this->db->all(
                "SELECT da.id, da.requested_percent, u.name, b.name AS branch FROM discount_approvals da JOIN users u ON u.id = da.requested_by
                 JOIN branches b ON b.id = da.branch_id
                 WHERE da.status = 'pending' AND da.expires_at > UTC_TIMESTAMP() AND da.branch_id IN ($in) AND da.requested_by <> :me ORDER BY da.id DESC LIMIT 5",
                array_merge($bp, ['me' => Auth::id()])
            );
            foreach ($rows as $r) {
                $items[] = ['icon' => 'percent', 'title' => 'Descuento de ' . pct($r['requested_percent'], 1) . ' por autorizar', 'sub' => $r['name'] . ' · ' . $r['branch'], 'url' => url('/approvals')];
            }
        }
        if (Auth::can('transfers.receive')) {
            $n = (int) $this->db->value("SELECT COUNT(*) FROM stock_transfers WHERE status = 'in_transit' AND to_branch_id IN ($in)", $bp);
            if ($n) {
                $items[] = ['icon' => 'transfer', 'title' => "$n transferencia(s) en camino", 'sub' => 'Confirme la recepción al llegar la mercancía', 'url' => url('/transfers', ['status' => 'open'])];
            }
        }
        if (Auth::can('transfers.approve')) {
            $n = (int) $this->db->value("SELECT COUNT(*) FROM stock_transfers WHERE status IN ('requested','received_with_differences') AND from_branch_id IN ($in)", $bp);
            if ($n) {
                $items[] = ['icon' => 'transfer', 'title' => "$n transferencia(s) requieren gestión", 'sub' => 'Solicitudes o diferencias por resolver', 'url' => url('/transfers', ['status' => 'open'])];
            }
        }
        if (Auth::can('inventory.view')) {
            $n = (int) $this->db->value(
                "SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id AND p.is_active = 1
                 WHERE i.branch_id IN ($in) AND i.min_stock > 0 AND (i.quantity - i.reserved) <= i.min_stock",
                $bp
            );
            if ($n) {
                $items[] = ['icon' => 'alert', 'title' => "$n producto(s) en o bajo el mínimo", 'sub' => 'Revise reposición o transferencias', 'url' => url('/inventory', ['status' => 'low'])];
            }
        }
        if (Auth::can('cash.approve')) {
            $n = (int) $this->db->value("SELECT COUNT(*) FROM cash_sessions WHERE status = 'closed' AND branch_id IN ($in)", $bp);
            if ($n) {
                $items[] = ['icon' => 'wallet', 'title' => "$n cierre(s) de caja por aprobar", 'sub' => 'Revise diferencias y apruebe', 'url' => url('/cash/sessions', ['status' => 'closed'])];
            }
        }
        if (Auth::can('returns.approve')) {
            $n = (int) $this->db->value("SELECT COUNT(*) FROM returns WHERE status = 'pending' AND branch_id IN ($in)", $bp);
            if ($n) {
                $items[] = ['icon' => 'undo', 'title' => "$n devolución(es) por aprobar", 'sub' => 'Solicitudes de clientes', 'url' => url('/returns', ['status' => 'pending'])];
            }
        }
        return $this->json(['ok' => true, 'items' => $items]);
    }
}

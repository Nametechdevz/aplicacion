<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Core\ValidationException;
use App\Services\Audit;
use App\Validators\Validator;

/**
 * Clientes. Los datos personales solo se muestran a usuarios con permiso;
 * el historial de compras se limita a las sucursales del usuario.
 */
final class CustomerController extends Controller
{
    public function index(): Response
    {
        [$page, $per, $offset] = $this->page();
        $q = mb_substr($this->request->str('q'), 0, 60);
        $where = '1 = 1';
        $params = [];
        if ($q !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
            $where = '(c.full_name LIKE :q1 OR c.document_number LIKE :q2 OR c.phone LIKE :q3 OR c.email LIKE :q4)';
            $params = ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $like];
        }
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $rows = $this->db->all(
            "SELECT c.*, b.name AS branch_name,
                    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed' AND s.branch_id IN ($in)) AS purchases,
                    (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed' AND s.branch_id IN (" . str_replace(':in', ':x', $in) . ")) AS total,
                    (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS last_purchase
             FROM customers c LEFT JOIN branches b ON b.id = c.branch_id
             WHERE $where ORDER BY c.full_name LIMIT $per OFFSET $offset",
            array_merge($params, $bp, $this->renamed($bp, 'x'))
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM customers c WHERE $where", $params);
        return $this->view('customers/index', [
            'title' => 'Clientes', 'active' => 'customers', 'crumbs' => [['Clientes', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'q' => $q,
        ]);
    }

    public function show(int $id): Response
    {
        $c = $this->db->one('SELECT c.*, b.name AS branch_name FROM customers c LEFT JOIN branches b ON b.id = c.branch_id WHERE c.id = :id', ['id' => $id]);
        if (!$c) {
            throw HttpException::notFound('El cliente no existe.');
        }
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $own = Auth::can('sales.view_branch') ? '' : ' AND s.user_id = :uid';
        $params = array_merge($bp, ['c' => $id], $own ? ['uid' => Auth::id()] : []);
        $sales = $this->db->all(
            "SELECT s.id, s.number, s.created_at, s.total, s.status, s.items_count, b.name AS branch_name, u.name AS seller
             FROM sales s JOIN branches b ON b.id = s.branch_id JOIN users u ON u.id = s.user_id
             WHERE s.customer_id = :c AND s.branch_id IN ($in) $own ORDER BY s.id DESC LIMIT 50",
            $params
        );
        $stats = $this->db->one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(s.total), 0) AS total, MAX(s.created_at) AS last, COALESCE(AVG(s.total), 0) AS avg
             FROM sales s WHERE s.customer_id = :c AND s.status = 'completed' AND s.branch_id IN ($in) $own",
            $params
        );
        $favorites = $this->db->all(
            "SELECT si.product_name, SUM(si.quantity) AS qty, MAX(si.unit_code) AS unit, COUNT(*) AS times
             FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE s.customer_id = :c AND s.status = 'completed' AND s.branch_id IN ($in) $own
             GROUP BY si.product_name ORDER BY times DESC, qty DESC LIMIT 5",
            $params
        );
        return $this->view('customers/show', [
            'title' => $c['full_name'], 'active' => 'customers', 'crumbs' => [['Clientes', '/customers'], [$c['full_name'], null]],
            'c' => $c, 'sales' => $sales, 'stats' => $stats, 'favorites' => $favorites,
        ]);
    }

    public function store(): Response
    {
        $id = $this->save(null, $this->request->post);
        return $this->success('Cliente registrado.', '/customers/' . $id);
    }

    public function update(int $id): Response
    {
        $this->save($id, $this->request->post);
        return $this->success('Datos del cliente actualizados.', '/customers/' . $id);
    }

    public function search(): Response
    {
        $q = mb_substr($this->request->str('q'), 0, 60);
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $rows = $this->db->all(
            "SELECT c.id, c.full_name, c.document_number, c.phone,
                    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS purchases
             FROM customers c WHERE c.is_active = 1 " . ($q !== '' ? 'AND (c.full_name LIKE :q1 OR c.document_number LIKE :q2 OR c.phone LIKE :q3)' : '') . '
             ORDER BY ' . ($q !== '' ? 'c.full_name' : 'c.updated_at DESC') . ' LIMIT 8',
            $q !== '' ? ['q1' => $like, 'q2' => $like, 'q3' => $like] : []
        );
        return $this->json(['ok' => true, 'items' => array_map(static fn ($r) => [
            'id' => (int) $r['id'], 'full_name' => $r['full_name'], 'document_number' => $r['document_number'],
            'phone' => $r['phone'], 'purchases' => (int) $r['purchases'],
        ], $rows)]);
    }

    public function quickStore(): Response
    {
        $id = $this->save(null, $this->request->post ?: $this->request->json());
        $c = $this->db->one('SELECT id, full_name, document_number, phone FROM customers WHERE id = :id', ['id' => $id]);
        $c['id'] = (int) $c['id'];
        return $this->json(['ok' => true, 'customer' => $c + ['purchases' => 0]]);
    }

    private function save(?int $id, array $input): int
    {
        Auth::authorize('customers.manage');
        $data = Validator::make($input, [
            'full_name' => 'required|string|max:160',
            'document_type' => 'nullable|in:CC,CE,NIT,PAS,TI',
            'document_number' => 'nullable|regex:/^[0-9A-Za-z\-.]{3,30}$/',
            'phone' => 'nullable|regex:/^[0-9 +()\-]{7,40}$/',
            'email' => 'nullable|email|max:160',
            'preferences' => 'nullable|string|max:500',
            'notes' => 'nullable|string|max:500',
        ], ['full_name' => 'el nombre completo', 'document_number' => 'el documento', 'phone' => 'el teléfono', 'email' => 'el correo']);
        if ($data['document_number'] && $this->db->value(
            'SELECT id FROM customers WHERE document_number = :d' . ($id ? ' AND id <> :id' : ''),
            $id ? ['d' => $data['document_number'], 'id' => $id] : ['d' => $data['document_number']]
        )) {
            throw ValidationException::field('document_number', 'Ya existe un cliente con ese documento.');
        }
        if ($id) {
            $before = $this->db->one('SELECT * FROM customers WHERE id = :id', ['id' => $id]);
            if (!$before) {
                throw HttpException::notFound();
            }
            $this->db->update('customers', $data, 'id = :id', ['id' => $id]);
            [$old, $new] = Audit::diff($before, $data);
            Audit::log('customer.update', 'customer', $id, 'Cliente modificado: ' . $data['full_name'], $old, $new);
            return $id;
        }
        $data['branch_id'] = Auth::activeBranchId();
        $data['created_by'] = Auth::id();
        $newId = $this->db->insert('customers', $data);
        Audit::log('customer.create', 'customer', $newId, 'Cliente registrado: ' . $data['full_name'], null, null, $data['branch_id']);
        return $newId;
    }

    private function renamed(array $params, string $prefix): array
    {
        $out = [];
        foreach ($params as $k => $v) {
            $out[preg_replace('/^in/', $prefix, $k)] = $v;
        }
        return $out;
    }
}

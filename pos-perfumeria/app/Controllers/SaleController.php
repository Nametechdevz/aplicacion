<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;
use App\Core\Settings;
use App\Services\CreditNoteService;
use RuntimeException;

class SaleController extends Controller
{
    public function index(): void
    {
        $from = (string) input('from', date('Y-m-01'));
        $to = (string) input('to', date('Y-m-d'));
        $where = ['DATE(s.issued_at) BETWEEN ? AND ?'];
        $params = [$from, $to];
        if ($q = (string) input('q', '')) {
            $where[] = '(s.full_number LIKE ? OR c.name LIKE ? OR c.doc_number LIKE ?)';
            array_push($params, "%$q%", "%$q%", "%$q%");
        }
        if (in_array($t = (string) input('doc_type', ''), ['POS', 'FEV'], true)) {
            $where[] = 's.doc_type = ?';
            $params[] = $t;
        }
        if (in_array($st = (string) input('status', ''), ['completada', 'devolucion_parcial', 'anulada'], true)) {
            $where[] = 's.status = ?';
            $params[] = $st;
        }
        if (!Auth::isAdmin()) {
            $where[] = 's.user_id = ?';
            $params[] = Auth::id();
        } elseif ($uid = (int) input('user_id', 0)) {
            $where[] = 's.user_id = ?';
            $params[] = $uid;
        }
        $w = implode(' AND ', $where);
        $base = "FROM sales s JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = s.user_id LEFT JOIN electronic_documents ed ON ed.sale_id = s.id WHERE $w";
        $sum = DB::one("SELECT COUNT(*) AS n, COALESCE(SUM(s.total),0) AS total, COALESCE(SUM(s.tax_total),0) AS tax $base", $params);
        $pg = paginate((int) $sum['n'], 30);
        $sales = DB::all("SELECT s.*, c.name AS customer, u.name AS cashier, ed.status AS edoc_status $base ORDER BY s.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}", $params);
        $users = Auth::isAdmin() ? DB::all('SELECT id, name FROM users ORDER BY name') : [];
        $this->view('sales/index', compact('sales', 'sum', 'pg', 'from', 'to', 'users') + ['title' => 'Ventas']);
    }

    private function load(int $id): array
    {
        $sale = DB::one(
            'SELECT s.*, u.name AS cashier FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
            [$id]
        );
        if (!$sale) {
            flash('danger', 'Venta no encontrada.');
            redirect('/sales');
        }
        return [
            'sale'     => $sale,
            'customer' => DB::one('SELECT * FROM customers WHERE id = ?', [$sale['customer_id']]),
            'items'    => DB::all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [$id]),
            'payments' => DB::all('SELECT * FROM sale_payments WHERE sale_id = ?', [$id]),
            'edoc'     => DB::one('SELECT * FROM electronic_documents WHERE sale_id = ?', [$id]),
            'range'    => $sale['numbering_range_id'] ? DB::one('SELECT * FROM numbering_ranges WHERE id = ?', [$sale['numbering_range_id']]) : null,
            'company'  => Settings::all(),
        ];
    }

    public function show(int $id): void
    {
        $d = $this->load($id);
        $d['creditNotes'] = DB::all('SELECT cn.*, ed.status AS edoc_status FROM credit_notes cn LEFT JOIN electronic_documents ed ON ed.credit_note_id = cn.id WHERE cn.sale_id = ? ORDER BY cn.id', [$id]);
        $d['title'] = ($d['sale']['doc_type'] === 'FEV' ? 'Factura ' : 'Documento POS ') . $d['sale']['full_number'];
        $this->view('sales/show', $d);
    }

    public function ticket(int $id): void
    {
        $this->view('print/ticket', $this->load($id), null);
    }

    public function invoice(int $id): void
    {
        $this->view('print/invoice', $this->load($id), null);
    }

    public function returnForm(int $id): void
    {
        $this->requireAdmin();
        $d = $this->load($id);
        if ($d['sale']['status'] === 'anulada') {
            flash('warning', 'Esta venta ya está anulada.');
            redirect('/sales/' . $id);
        }
        $d['title'] = 'Devolución / Nota crédito · ' . $d['sale']['full_number'];
        $d['reasons'] = CreditNoteService::REASONS;
        $this->view('sales/return', $d);
    }

    public function returnStore(int $id): void
    {
        $this->requireAdmin();
        try {
            $qtys = array_map('intval', (array) ($_POST['qty'] ?? []));
            $r = CreditNoteService::create($id, $qtys, (string) input('reason_code'), (string) input('reason_text', ''), (string) input('refund_method', 'efectivo'), Auth::user());
            $status = $r['edoc']['status'] ?? 'error';
            flash($status === 'aceptado' ? 'success' : 'warning', 'Nota crédito registrada. Estado DIAN: ' . $status . '.');
            redirect('/credit-notes/' . $r['credit_note_id']);
        } catch (RuntimeException $e) {
            flash('danger', $e->getMessage());
            redirect('/sales/' . $id . '/return');
        }
    }

    public function creditNotes(): void
    {
        $pg = paginate((int) DB::value('SELECT COUNT(*) FROM credit_notes'), 30);
        $notes = DB::all(
            "SELECT cn.*, s.full_number AS sale_number, c.name AS customer, u.name AS user_name, ed.status AS edoc_status
               FROM credit_notes cn JOIN sales s ON s.id = cn.sale_id JOIN customers c ON c.id = s.customer_id
               JOIN users u ON u.id = cn.user_id LEFT JOIN electronic_documents ed ON ed.credit_note_id = cn.id
              ORDER BY cn.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}"
        );
        $this->view('sales/credit_notes', ['title' => 'Devoluciones y notas crédito', 'notes' => $notes, 'pg' => $pg]);
    }

    public function creditNote(int $id): void
    {
        $cn = DB::one('SELECT cn.*, u.name AS user_name FROM credit_notes cn JOIN users u ON u.id = cn.user_id WHERE cn.id = ?', [$id]);
        if (!$cn) {
            redirect('/credit-notes');
        }
        $d = $this->load((int) $cn['sale_id']);
        $d['cn'] = $cn;
        $d['cnItems'] = DB::all('SELECT * FROM credit_note_items WHERE credit_note_id = ?', [$id]);
        $d['cnEdoc'] = DB::one('SELECT * FROM electronic_documents WHERE credit_note_id = ?', [$id]);
        $d['reasons'] = CreditNoteService::REASONS;
        $this->view('print/credit_note', $d, null);
    }

    private function requireAdmin(): void
    {
        if (!Auth::isAdmin()) {
            flash('danger', 'Solo un administrador puede registrar devoluciones.');
            redirect('/sales');
        }
    }
}

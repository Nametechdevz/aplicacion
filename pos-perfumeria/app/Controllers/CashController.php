<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;
use App\Services\Cash;

class CashController extends Controller
{
    public function index(): void
    {
        $session = Cash::openSession(Auth::id());
        $summary = $session ? Cash::summary((int) $session['id']) : null;
        $where = Auth::isAdmin() ? '1=1' : 'cs.user_id = ' . Auth::id();
        $pg = paginate((int) DB::value("SELECT COUNT(*) FROM cash_sessions cs WHERE $where"), 20);
        $history = DB::all(
            "SELECT cs.*, u.name AS user_name,
                    (SELECT COALESCE(SUM(total),0) FROM sales s WHERE s.cash_session_id = cs.id) AS sales_total
               FROM cash_sessions cs JOIN users u ON u.id = cs.user_id
              WHERE $where ORDER BY cs.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}"
        );
        $this->view('cash/index', ['title' => 'Caja', 'session' => $session, 's' => $summary, 'history' => $history, 'pg' => $pg]);
    }

    public function open(): void
    {
        if (Cash::openSession(Auth::id())) {
            flash('warning', 'Ya tienes una caja abierta.');
        } else {
            $amount = max(0, (float) input('opening_amount', 0));
            DB::insert('cash_sessions', ['user_id' => Auth::id(), 'opened_at' => date('Y-m-d H:i:s'), 'opening_amount' => $amount]);
            flash('success', 'Caja abierta con base de ' . money($amount) . '.');
        }
        $to = (string) input('redirect', '/cash');
        redirect(str_starts_with($to, '/') && !str_starts_with($to, '//') ? $to : '/cash');
    }

    public function movement(): void
    {
        $session = Cash::openSession(Auth::id());
        $amount = round((float) input('amount', 0), 2);
        $type = input('type') === 'ingreso' ? 'ingreso' : 'egreso';
        $concept = mb_substr((string) input('concept', ''), 0, 200);
        if (!$session || $amount <= 0 || $concept === '') {
            flash('danger', 'Indica un valor mayor a cero y el concepto (con la caja abierta).');
            redirect('/cash');
        }
        DB::insert('cash_movements', ['cash_session_id' => $session['id'], 'type' => $type, 'amount' => $amount, 'concept' => $concept, 'user_id' => Auth::id()]);
        flash('success', ucfirst($type) . ' registrado.');
        redirect('/cash');
    }

    public function close(): void
    {
        $session = Cash::openSession(Auth::id());
        if (!$session) {
            flash('warning', 'No tienes caja abierta.');
            redirect('/cash');
        }
        $sum = Cash::summary((int) $session['id']);
        $counted = round((float) input('counted_cash', 0), 2);
        DB::update('cash_sessions', [
            'closed_at'     => date('Y-m-d H:i:s'),
            'expected_cash' => $sum['expected'],
            'counted_cash'  => $counted,
            'difference'    => round($counted - $sum['expected'], 2),
            'notes'         => mb_substr((string) input('notes', ''), 0, 255) ?: null,
            'status'        => 'cerrada',
        ], 'id = ?', [$session['id']]);
        flash('success', 'Caja cerrada. Diferencia: ' . money($counted - $sum['expected']) . '.');
        redirect('/cash/' . $session['id']);
    }

    public function show(int $id): void
    {
        $s = $this->loadSummary($id);
        $this->view('cash/show', ['title' => 'Cierre de caja #' . $id, 's' => $s]);
    }

    public function print(int $id): void
    {
        $this->view('cash/print', ['s' => $this->loadSummary($id)], null);
    }

    private function loadSummary(int $id): array
    {
        $row = DB::one('SELECT user_id FROM cash_sessions WHERE id = ?', [$id]);
        if (!$row || (!Auth::isAdmin() && (int) $row['user_id'] !== Auth::id())) {
            flash('danger', 'Sesión de caja no encontrada.');
            redirect('/cash');
        }
        return Cash::summary($id);
    }
}

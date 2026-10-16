<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Response;

/** Consulta de auditoría (solo lectura: no existe ninguna ruta de edición o borrado). */
final class AuditController extends Controller
{
    public function index(): Response
    {
        [$page, $per, $offset] = $this->page();
        $where = ['1 = 1'];
        $params = [];
        if (!Auth::isGlobal()) {
            [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
            $where[] = "a.branch_id IN ($in)";
            $params += $bp;
        }
        $branch = $this->request->int('branch');
        if ($branch) {
            Auth::authorizeBranch($branch);
            $where[] = 'a.branch_id = :fb';
            $params['fb'] = $branch;
        }
        $user = $this->request->int('user');
        if ($user) {
            $where[] = 'a.user_id = :u';
            $params['u'] = $user;
        }
        $module = $this->request->str('module');
        if ($module !== '' && preg_match('/^[a-z_]+$/', $module)) {
            $where[] = 'a.action LIKE :m';
            $params['m'] = $module . '.%';
        }
        $from = $this->request->str('from');
        $to = $this->request->str('to');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            [$s, $e] = utc_range($from, $to);
            $where[] = 'a.created_at >= :s AND a.created_at < :e';
            $params += ['s' => $s, 'e' => $e];
        }
        $q = mb_substr($this->request->str('q'), 0, 60);
        if ($q !== '') {
            $where[] = 'a.description LIKE :q';
            $params['q'] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        }
        $w = implode(' AND ', $where);
        $rows = $this->db->all(
            "SELECT a.*, u.name AS user_name, b.name AS branch_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN branches b ON b.id = a.branch_id
             WHERE $w ORDER BY a.id DESC LIMIT $per OFFSET $offset",
            $params
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM audit_logs a WHERE $w", $params);
        return $this->view('audit/index', [
            'title' => 'Auditoría', 'active' => 'audit', 'crumbs' => [['Auditoría', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per,
            'users' => $this->db->all('SELECT id, name FROM users ORDER BY name'),
            'branches' => $this->db->all('SELECT id, name, type FROM branches WHERE id IN (' . implode(',', array_map('intval', Auth::branchIds() ?: [0])) . ') ORDER BY type = \'store\', name'),
            'branchName' => $branch ? $this->db->value('SELECT name FROM branches WHERE id = :id', ['id' => $branch]) : null,
            'filters' => ['branch' => $branch, 'user' => $user, 'module' => $module, 'from' => $from, 'to' => $to, 'q' => $q],
        ]);
    }
}

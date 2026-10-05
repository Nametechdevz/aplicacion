<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\DB;
use App\Services\Dian\ElectronicInvoice;

class EdocController extends Controller
{
    public function index(): void
    {
        $status = (string) input('status', '');
        $where = '1=1';
        $params = [];
        if ($status === 'problemas') {
            $where = "ed.status IN ('error','rechazado','pendiente')";
        } elseif (in_array($status, ['aceptado', 'rechazado', 'error', 'pendiente'], true)) {
            $where = 'ed.status = ?';
            $params[] = $status;
        }
        if ($q = (string) input('q', '')) {
            $where .= ' AND (ed.full_number LIKE ? OR ed.uuid LIKE ?)';
            array_push($params, "%$q%", "%$q%");
        }
        $pg = paginate((int) DB::value("SELECT COUNT(*) FROM electronic_documents ed WHERE $where", $params), 30);
        $docs = DB::all(
            "SELECT ed.*, COALESCE(s.total, cn.total) AS total, COALESCE(s.issued_at, cn.issued_at) AS issued_at,
                    COALESCE(s.id, cn.sale_id) AS link_sale_id
               FROM electronic_documents ed
               LEFT JOIN sales s ON s.id = ed.sale_id
               LEFT JOIN credit_notes cn ON cn.id = ed.credit_note_id
              WHERE $where ORDER BY ed.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}",
            $params
        );
        $counts = array_column(DB::all('SELECT status, COUNT(*) AS n FROM electronic_documents GROUP BY status'), 'n', 'status');
        $this->view('edocs/index', ['title' => 'Facturación electrónica DIAN', 'docs' => $docs, 'pg' => $pg, 'counts' => $counts, 'status' => $status]);
    }

    public function xml(int $id): void
    {
        $doc = DB::one('SELECT * FROM electronic_documents WHERE id = ?', [$id]);
        $file = $doc ? realpath(BASE_PATH . '/storage/' . $doc['xml_path']) : false;
        if (!$file || !str_starts_with($file, realpath(BASE_PATH . '/storage/xml'))) {
            flash('danger', 'XML no disponible.');
            redirect('/edocs');
        }
        header('Content-Type: application/xml; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . basename($file) . '"');
        readfile($file);
        exit;
    }

    public function retry(int $id): void
    {
        try {
            $doc = ElectronicInvoice::retry($id);
            flash($doc['status'] === 'aceptado' ? 'success' : 'warning', 'Documento ' . $doc['full_number'] . ': ' . $doc['status'] . '. ' . mb_substr((string) $doc['response'], 0, 300));
        } catch (\Throwable $e) {
            flash('danger', $e->getMessage());
        }
        $this->back('/edocs');
    }

    public function retryAll(): void
    {
        $ids = DB::all("SELECT id FROM electronic_documents WHERE status IN ('error','pendiente','rechazado') ORDER BY id LIMIT 100");
        $ok = 0;
        foreach ($ids as $r) {
            try {
                if (ElectronicInvoice::retry((int) $r['id'])['status'] === 'aceptado') {
                    $ok++;
                }
            } catch (\Throwable $e) {
                // se continúa con los demás
            }
        }
        flash('info', "Reenvío terminado: $ok de " . count($ids) . ' documento(s) aceptados.');
        redirect('/edocs');
    }
}

<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\DB;
use RuntimeException;

class CustomerController extends Controller
{
    public function index(): void
    {
        $q = (string) input('q', '');
        $where = '1=1';
        $params = [];
        if ($q !== '') {
            $where = '(name LIKE ? OR doc_number LIKE ? OR email LIKE ? OR phone LIKE ?)';
            $params = array_fill(0, 4, "%$q%");
        }
        $pg = paginate((int) DB::value("SELECT COUNT(*) FROM customers WHERE $where", $params));
        $customers = DB::all(
            "SELECT c.*, (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id) AS purchases,
                    (SELECT COALESCE(SUM(total),0) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'anulada') AS spent
               FROM customers c WHERE $where ORDER BY c.id = 1 DESC, c.name LIMIT {$pg['limit']} OFFSET {$pg['offset']}",
            $params
        );
        $this->view('customers/index', ['title' => 'Clientes', 'customers' => $customers, 'pg' => $pg, 'q' => $q]);
    }

    public function show(int $id): void
    {
        $c = DB::one('SELECT * FROM customers WHERE id = ?', [$id]) ?? redirect('/customers');
        $sales = DB::all('SELECT s.*, ed.status AS edoc_status FROM sales s LEFT JOIN electronic_documents ed ON ed.sale_id = s.id WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 100', [$id]);
        $favorites = DB::all(
            "SELECT si.description, SUM(si.qty) AS qty FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE s.customer_id = ? GROUP BY si.product_id, si.description ORDER BY qty DESC LIMIT 5",
            [$id]
        );
        $this->view('customers/show', ['title' => $c['name'], 'c' => $c, 'sales' => $sales, 'favorites' => $favorites]);
    }

    public function create(): void
    {
        $this->view('customers/form', ['title' => 'Nuevo cliente', 'c' => []]);
    }

    public function edit(int $id): void
    {
        $c = DB::one('SELECT * FROM customers WHERE id = ?', [$id]) ?? redirect('/customers');
        $this->view('customers/form', ['title' => 'Editar cliente', 'c' => $c]);
    }

    public function store(): void
    {
        try {
            $id = DB::insert('customers', self::validate($_POST));
            flash('success', 'Cliente creado.');
            redirect('/customers/' . $id);
        } catch (RuntimeException $e) {
            remember_input();
            flash('danger', $e->getMessage());
            redirect('/customers/create');
        }
    }

    public function update(int $id): void
    {
        if ($id === 1) {
            flash('warning', 'El cliente "Consumidor final" no se puede modificar.');
            redirect('/customers');
        }
        try {
            DB::update('customers', self::validate($_POST, $id), 'id = ?', [$id]);
            flash('success', 'Cliente actualizado.');
            redirect('/customers/' . $id);
        } catch (RuntimeException $e) {
            remember_input();
            flash('danger', $e->getMessage());
            redirect('/customers/' . $id . '/edit');
        }
    }

    public function search(): void
    {
        $q = trim((string) input('q', ''));
        $like = "%$q%";
        $items = DB::all('SELECT id, doc_type, doc_number, name, email, phone FROM customers WHERE doc_number LIKE ? OR name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 15', [$like, $like, $like]);
        foreach ($items as &$i) {
            $i['doc_label'] = doc_type_short($i['doc_type']);
        }
        json_response(['ok' => true, 'items' => $items]);
    }

    public function quickStore(): void
    {
        try {
            $data = self::validate($this->jsonBody());
            $id = DB::insert('customers', $data);
            json_response(['ok' => true, 'customer' => ['id' => $id, 'name' => $data['name'], 'doc_number' => $data['doc_number'], 'email' => $data['email']]]);
        } catch (RuntimeException $e) {
            json_response(['ok' => false, 'error' => $e->getMessage()], 422);
        }
    }

    public static function validate(array $in, ?int $id = null): array
    {
        $t = fn($k) => trim((string) ($in[$k] ?? ''));
        $docType = $t('doc_type') ?: '13';
        if (!array_key_exists($docType, doc_types())) {
            throw new RuntimeException('Tipo de documento no válido.');
        }
        $docNumber = $docType === '41' || $docType === '42' ? preg_replace('/[^A-Za-z0-9]/', '', $t('doc_number')) : preg_replace('/\D/', '', $t('doc_number'));
        if ($docNumber === '' || strlen($docNumber) < 3) {
            throw new RuntimeException('Número de documento no válido.');
        }
        if ($t('name') === '') {
            throw new RuntimeException('El nombre o razón social es obligatorio.');
        }
        $email = $t('email');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('El correo electrónico no es válido.');
        }
        $dup = DB::value('SELECT id FROM customers WHERE doc_type = ? AND doc_number = ?' . ($id ? ' AND id <> ' . (int) $id : ''), [$docType, $docNumber]);
        if ($dup) {
            throw new RuntimeException('Ya existe un cliente con ese documento.');
        }
        $personType = $docType === '31' ? (int) ($t('person_type') ?: 1) : 2;
        $regime = in_array($t('tax_regime'), ['48', '49'], true) ? $t('tax_regime') : '49';
        return [
            'doc_type'             => $docType,
            'doc_number'           => $docNumber,
            'dv'                   => $docType === '31' ? nit_dv($docNumber) : null,
            'name'                 => mb_strtoupper(mb_substr($t('name'), 0, 200)),
            'person_type'          => $personType,
            'tax_regime'           => $regime,
            'tax_responsibilities' => mb_substr($t('tax_responsibilities') ?: 'R-99-PN', 0, 60),
            'email'                => $email ?: null,
            'phone'                => mb_substr($t('phone'), 0, 40) ?: null,
            'address'              => mb_substr($t('address'), 0, 200) ?: null,
            'city_code'            => preg_replace('/\D/', '', $t('city_code')) ?: null,
            'city_name'            => mb_substr($t('city_name'), 0, 80) ?: null,
            'department'           => mb_substr($t('department'), 0, 80) ?: null,
            'birthday'             => preg_match('/^\d{4}-\d{2}-\d{2}$/', $t('birthday')) ? $t('birthday') : null,
            'notes'                => mb_substr($t('notes'), 0, 255) ?: null,
        ];
    }
}

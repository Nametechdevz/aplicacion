<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;
use App\Services\Inventory;
use RuntimeException;

class ProductController extends Controller
{
    public const CONCENTRATIONS = ['Parfum', 'EDP', 'EDT', 'EDC', 'Body Mist', 'Splash', 'Aceite', 'Otro'];

    public function index(): void
    {
        [$where, $params] = $this->filters();
        $pg = paginate((int) DB::value("SELECT COUNT(*) FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE $where", $params), 30);
        $products = DB::all(
            "SELECT p.*, b.name AS brand, c.name AS category FROM products p
               LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
              WHERE $where ORDER BY p.active DESC, b.name, p.name LIMIT {$pg['limit']} OFFSET {$pg['offset']}",
            $params
        );
        $this->view('products/index', [
            'title'      => 'Productos',
            'products'   => $products,
            'pg'         => $pg,
            'brands'     => DB::all('SELECT * FROM brands ORDER BY name'),
            'categories' => DB::all('SELECT * FROM categories ORDER BY name'),
        ]);
    }

    private function filters(): array
    {
        $where = ['1=1'];
        $params = [];
        if ($q = (string) input('q', '')) {
            $where[] = '(p.name LIKE ? OR p.code LIKE ? OR b.name LIKE ?)';
            array_push($params, "%$q%", "%$q%", "%$q%");
        }
        if ($b = (int) input('brand_id', 0)) {
            $where[] = 'p.brand_id = ?';
            $params[] = $b;
        }
        if ($c = (int) input('category_id', 0)) {
            $where[] = 'p.category_id = ?';
            $params[] = $c;
        }
        if (in_array($g = (string) input('gender', ''), ['Femenino', 'Masculino', 'Unisex'], true)) {
            $where[] = 'p.gender = ?';
            $params[] = $g;
        }
        $st = (string) input('state', 'active');
        if ($st === 'active') {
            $where[] = 'p.active = 1';
        } elseif ($st === 'inactive') {
            $where[] = 'p.active = 0';
        }
        return [implode(' AND ', $where), $params];
    }

    public function create(): void
    {
        $this->form(['tax_rate' => 19, 'gender' => 'Unisex', 'active' => 1]);
    }

    public function edit(int $id): void
    {
        $p = DB::one('SELECT * FROM products WHERE id = ?', [$id]) ?? redirect('/products');
        $this->form($p);
    }

    private function form(array $p): void
    {
        $this->view('products/form', [
            'title'      => empty($p['id']) ? 'Nuevo producto' : 'Editar producto',
            'p'          => $p,
            'brands'     => DB::all('SELECT * FROM brands ORDER BY name'),
            'categories' => DB::all('SELECT * FROM categories ORDER BY name'),
            'concentrations' => self::CONCENTRATIONS,
        ]);
    }

    public function store(): void
    {
        try {
            $data = $this->validate($_POST);
            $stock = max(0, (int) input('initial_stock', 0));
            $id = DB::transaction(function () use ($data, $stock) {
                $id = DB::insert('products', $data + ['stock' => 0]);
                if ($stock > 0) {
                    Inventory::move($id, 'inicial', $stock, (float) $data['cost'], null, 'Inventario inicial', Auth::id());
                }
                return $id;
            });
            $this->handleImage($id);
            flash('success', 'Producto creado.');
            redirect(input('save_new') ? '/products/create' : '/products');
        } catch (RuntimeException $e) {
            remember_input();
            flash('danger', $e->getMessage());
            redirect('/products/create');
        }
    }

    public function update(int $id): void
    {
        try {
            DB::update('products', $this->validate($_POST, $id), 'id = ?', [$id]);
            $this->handleImage($id);
            flash('success', 'Producto actualizado.');
            redirect('/products');
        } catch (RuntimeException $e) {
            remember_input();
            flash('danger', $e->getMessage());
            redirect('/products/' . $id . '/edit');
        }
    }

    public function toggle(int $id): void
    {
        DB::run('UPDATE products SET active = 1 - active WHERE id = ?', [$id]);
        flash('success', 'Estado del producto actualizado.');
        $this->back('/products');
    }

    private function validate(array $in, ?int $id = null): array
    {
        $code = trim((string) ($in['code'] ?? ''));
        $name = trim((string) ($in['name'] ?? ''));
        if ($code === '' || $name === '') {
            throw new RuntimeException('Código y nombre son obligatorios.');
        }
        if (DB::value('SELECT id FROM products WHERE code = ?' . ($id ? ' AND id <> ' . (int) $id : ''), [$code])) {
            throw new RuntimeException('Ya existe un producto con el código ' . $code . '.');
        }
        $price = (float) str_replace(',', '.', (string) ($in['price'] ?? 0));
        if ($price <= 0) {
            throw new RuntimeException('El precio de venta debe ser mayor a cero.');
        }
        $tax = (float) ($in['tax_rate'] ?? 19);
        if (!in_array($tax, [0.0, 5.0, 19.0], true)) {
            throw new RuntimeException('Tarifa de IVA no válida (0, 5 o 19%).');
        }
        $conc = trim((string) ($in['concentration'] ?? ''));
        return [
            'code'             => mb_substr($code, 0, 60),
            'name'             => mb_substr($name, 0, 200),
            'brand_id'         => (int) ($in['brand_id'] ?? 0) ?: null,
            'category_id'      => (int) ($in['category_id'] ?? 0) ?: null,
            'gender'           => in_array($in['gender'] ?? '', ['Femenino', 'Masculino', 'Unisex'], true) ? $in['gender'] : 'Unisex',
            'concentration'    => $conc !== '' ? mb_substr($conc, 0, 30) : null,
            'size_ml'          => (int) ($in['size_ml'] ?? 0) ?: null,
            'olfactive_family' => mb_substr(trim((string) ($in['olfactive_family'] ?? '')), 0, 60) ?: null,
            'cost'             => max(0, (float) str_replace(',', '.', (string) ($in['cost'] ?? 0))),
            'price'            => $price,
            'tax_rate'         => $tax,
            'min_stock'        => max(0, (int) ($in['min_stock'] ?? 0)),
            'active'           => !empty($in['active']) ? 1 : 0,
        ];
    }

    private function handleImage(int $id): void
    {
        $f = $_FILES['image'] ?? null;
        if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) {
            return;
        }
        if ($f['error'] !== UPLOAD_ERR_OK || $f['size'] > 3 * 1024 * 1024) {
            flash('warning', 'La imagen no se pudo subir (máximo 3 MB).');
            return;
        }
        $info = @getimagesize($f['tmp_name']);
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$info['mime'] ?? ''] ?? null;
        if (!$ext) {
            flash('warning', 'Formato de imagen no permitido (usa JPG, PNG o WEBP).');
            return;
        }
        $name = 'p' . $id . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (move_uploaded_file($f['tmp_name'], BASE_PATH . '/public/uploads/' . $name)) {
            $old = DB::value('SELECT image FROM products WHERE id = ?', [$id]);
            if ($old && is_file(BASE_PATH . '/public/uploads/' . basename($old))) {
                @unlink(BASE_PATH . '/public/uploads/' . basename($old));
            }
            DB::update('products', ['image' => $name], 'id = ?', [$id]);
        }
    }

    // ---------- Importar / exportar CSV ----------
    private const CSV_COLS = ['codigo', 'nombre', 'marca', 'categoria', 'genero', 'concentracion', 'ml', 'familia_olfativa', 'costo', 'precio', 'iva', 'stock', 'stock_minimo'];

    public function importForm(): void
    {
        $this->view('products/import', ['title' => 'Importar productos', 'cols' => self::CSV_COLS]);
    }

    public function import(): void
    {
        $f = $_FILES['file'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
            flash('danger', 'Selecciona un archivo CSV.');
            redirect('/products/import');
        }
        $fh = fopen($f['tmp_name'], 'r');
        $first = fgets($fh);
        $delim = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
        rewind($fh);
        $header = array_map(fn($h) => mb_strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), fgetcsv($fh, 0, $delim) ?: []);
        if (!in_array('codigo', $header, true) || !in_array('nombre', $header, true) || !in_array('precio', $header, true)) {
            flash('danger', 'El archivo debe tener al menos las columnas: codigo, nombre, precio.');
            redirect('/products/import');
        }
        $created = $updated = 0;
        $errors = [];
        $line = 1;
        $brandCache = $catCache = [];
        $num = fn($v) => (float) str_replace(['$', ' ', '.', ','], ['', '', '', '.'], (string) $v);
        while (($row = fgetcsv($fh, 0, $delim)) !== false) {
            $line++;
            if (count(array_filter($row, fn($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }
            $r = array_combine($header, array_pad(array_slice($row, 0, count($header)), count($header), ''));
            try {
                $brandId = null;
                if ($bn = trim($r['marca'] ?? '')) {
                    $brandId = $brandCache[$bn] ??= (int) (DB::value('SELECT id FROM brands WHERE name = ?', [$bn]) ?: DB::insert('brands', ['name' => $bn]));
                }
                $catId = null;
                if ($cname = trim($r['categoria'] ?? '')) {
                    $catId = $catCache[$cname] ??= (int) (DB::value('SELECT id FROM categories WHERE name = ?', [$cname]) ?: DB::insert('categories', ['name' => $cname]));
                }
                $g = ucfirst(mb_strtolower(trim($r['genero'] ?? '')));
                $g = ['Mujer' => 'Femenino', 'Hombre' => 'Masculino', 'F' => 'Femenino', 'M' => 'Masculino', 'U' => 'Unisex'][$g] ?? $g;
                $data = [
                    'code' => trim($r['codigo']), 'name' => trim($r['nombre']), 'brand_id' => $brandId, 'category_id' => $catId,
                    'gender' => $g, 'concentration' => trim($r['concentracion'] ?? ''), 'size_ml' => (int) ($r['ml'] ?? 0),
                    'olfactive_family' => trim($r['familia_olfativa'] ?? ''), 'cost' => $num($r['costo'] ?? 0), 'price' => $num($r['precio']),
                    'tax_rate' => isset($r['iva']) && trim($r['iva']) !== '' ? (float) $r['iva'] : 19, 'min_stock' => (int) ($r['stock_minimo'] ?? 0), 'active' => 1,
                ];
                $existing = DB::value('SELECT id FROM products WHERE code = ?', [$data['code']]);
                $valid = $this->validate($data, $existing ? (int) $existing : null);
                DB::transaction(function () use ($existing, $valid, $r, &$created, &$updated) {
                    if ($existing) {
                        DB::update('products', $valid, 'id = ?', [$existing]);
                        $updated++;
                    } else {
                        $id = DB::insert('products', $valid + ['stock' => 0]);
                        $stock = (int) ($r['stock'] ?? 0);
                        if ($stock > 0) {
                            Inventory::move($id, 'inicial', $stock, (float) $valid['cost'], null, 'Importación CSV', Auth::id());
                        }
                        $created++;
                    }
                });
            } catch (\Throwable $e) {
                $errors[] = "Fila $line: " . $e->getMessage();
            }
        }
        fclose($fh);
        flash('success', "Importación terminada: $created creados, $updated actualizados.");
        if ($errors) {
            flash('warning', implode(' | ', array_slice($errors, 0, 15)) . (count($errors) > 15 ? ' …' : ''));
        }
        redirect('/products');
    }

    public function export(): void
    {
        $rows = DB::all('SELECT p.*, b.name AS brand, c.name AS category FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="productos_' . date('Ymd') . '.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, self::CSV_COLS, ';');
        foreach ($rows as $p) {
            fputcsv($out, [$p['code'], $p['name'], $p['brand'], $p['category'], $p['gender'], $p['concentration'], $p['size_ml'], $p['olfactive_family'],
                number_format((float) $p['cost'], 2, ',', ''), number_format((float) $p['price'], 2, ',', ''), $p['tax_rate'], $p['stock'], $p['min_stock']], ';');
        }
        fclose($out);
        exit;
    }

    public function labels(): void
    {
        $ids = array_filter(array_map('intval', explode(',', (string) input('ids', ''))));
        $products = $ids
            ? DB::all('SELECT p.*, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id IN (' . implode(',', $ids) . ')')
            : DB::all('SELECT p.*, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.active = 1 ORDER BY p.name LIMIT 200');
        $this->view('products/labels', ['products' => $products, 'copies' => max(1, min(50, (int) input('copies', 1)))], null);
    }
}

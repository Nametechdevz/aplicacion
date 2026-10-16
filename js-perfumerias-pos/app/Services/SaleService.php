<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Support\Dec;
use App\Validators\Validator;
use PDOException;

/**
 * Registro de ventas.
 *
 * El servidor nunca confía en precios, descuentos, totales ni sucursal del
 * navegador: recalcula todo desde el catálogo, valida límites de descuento y
 * autorizaciones, bloquea existencias y registra pagos y caja en una sola
 * transacción. La clave client_request_id hace la operación idempotente.
 */
final class SaleService
{
    private InventoryService $inventory;
    private DiscountService $discounts;
    private CashService $cash;

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
        $this->inventory = new InventoryService($this->db);
        $this->discounts = new DiscountService($this->db);
        $this->cash = new CashService($this->db);
    }

    /**
     * Calcula líneas y totales. Con $lock = true bloquea existencias y
     * autorizaciones (solo dentro de la transacción de la venta).
     */
    public function quote(array $input, int $userId, int $branchId, bool $lock = false): array
    {
        $items = $input['items'] ?? [];
        if (!is_array($items) || $items === []) {
            throw new ValidationException('El carrito está vacío.');
        }
        if (count($items) > 200) {
            throw new ValidationException('La venta supera el máximo de 200 líneas.');
        }
        $minMarginGlobal = Settings::get('min_margin_pct', '0') ?? '0';
        $lines = [];
        $productIds = [];
        foreach ($items as $i => $item) {
            $productId = (int) ($item['product_id'] ?? 0);
            $variantId = isset($item['variant_id']) && $item['variant_id'] !== '' && $item['variant_id'] !== null ? (int) $item['variant_id'] : null;
            $product = $this->db->one(
                'SELECT p.*, u.code AS unit_code, b.name AS brand_name, c.name AS category_name
                 FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id
                 LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
                 WHERE p.id = :id',
                ['id' => $productId]
            );
            if (!$product || !(int) $product['is_active']) {
                throw new ValidationException('Uno de los productos del carrito no existe o está inactivo.');
            }
            $variant = null;
            if ($variantId !== null) {
                $variant = $this->db->one('SELECT * FROM product_variants WHERE id = :id AND product_id = :p', ['id' => $variantId, 'p' => $productId]);
                if (!$variant || !(int) $variant['is_active']) {
                    throw new ValidationException("La presentación seleccionada de «{$product['name']}» no está disponible.");
                }
            }
            $precision = $variant ? 0 : (int) $product['qty_precision'];
            $quantity = Validator::quantity($item['quantity'] ?? '', $precision, "la cantidad de «{$product['name']}»");
            $listPrice = $variant ? Dec::norm($variant['price']) : Dec::norm($product['price']);
            $qtyBase = $variant ? Dec::mul($quantity, $variant['base_qty'], 3) : $quantity;
            // COP: los importes se liquidan en pesos enteros (redondeo comercial al peso).
            $gross = Dec::norm(Dec::mul($quantity, $listPrice, 2), $this->moneyScale());

            // Descuento solicitado
            $disc = is_array($item['discount'] ?? null) ? $item['discount'] : null;
            $discType = null;
            $discValue = null;
            $discAmount = '0.00';
            if ($disc && ($disc['type'] ?? '') !== '' && ($disc['value'] ?? '') !== '' && ($disc['value'] ?? null) !== null) {
                $discType = (string) $disc['type'];
                $raw = str_replace(',', '.', trim((string) $disc['value']));
                if (!Dec::isValid($raw) || Dec::isNegative($raw)) {
                    throw new ValidationException("El descuento de «{$product['name']}» no es válido.");
                }
                $discValue = Dec::norm($raw, 4);
                $discAmount = match ($discType) {
                    'percent' => Dec::cmp($discValue, '100') > 0
                        ? throw new ValidationException('El porcentaje de descuento no puede superar 100 %.')
                        : Dec::pct($gross, $discValue, 2),
                    'amount' => Dec::norm($discValue, 2),
                    'final_price' => Dec::sub($gross, Dec::mul($quantity, $discValue, 2), 2),
                    default => throw new ValidationException('Tipo de descuento no válido.'),
                };
                $discAmount = Dec::norm($discAmount, $this->moneyScale());
                if (Dec::isNegative($discAmount)) {
                    throw new ValidationException("El precio final de «{$product['name']}» no puede ser mayor que el precio de lista.");
                }
                if (Dec::cmp($discAmount, $gross) > 0) {
                    throw new ValidationException("El descuento de «{$product['name']}» supera el valor de la línea.");
                }
                if (Dec::isZero($discAmount)) {
                    $discType = null;
                    $discValue = null;
                }
            }
            $total = Dec::sub($gross, $discAmount, 2);
            $percent = Dec::percentOf($discAmount, $gross, 4);
            $limit = $this->discounts->effectiveLimit($userId, $branchId, $productId);
            $exceedsLimit = Dec::isPositive($discAmount) && Dec::cmp($percent, $limit) > 0;

            // Precio mínimo autorizado por unidad base.
            $belowMin = false;
            if ($product['min_price'] !== null && Dec::isPositive($qtyBase)) {
                $effectiveUnit = Dec::div($total, $qtyBase, 4);
                $belowMin = Dec::isPositive($discAmount) && Dec::cmp($effectiveUnit, $product['min_price']) < 0;
            }

            $unitCost = Dec::norm($product['cost'], 4);
            $costTotal = Dec::mul($qtyBase, $unitCost, 2);
            $margin = Dec::isPositive($total) ? Dec::percentOf(Dec::sub($total, $costTotal), $total, 2) : '0.00';
            $minMargin = $product['min_margin_pct'] ?? $minMarginGlobal;
            $belowMargin = Dec::isPositive($costTotal) && Dec::cmp($margin, (string) $minMargin) < 0;

            $approvalId = isset($disc['approval_id']) && $disc['approval_id'] ? (int) $disc['approval_id'] : null;
            $approval = null;
            if (($exceedsLimit || $belowMin) && $approvalId && $lock) {
                $approval = $this->discounts->lockApprovalFor($approvalId, $userId, $branchId, $productId, $percent);
            }

            $lines[] = [
                'index' => $i,
                'product' => $product,
                'variant' => $variant,
                'product_id' => $productId,
                'variant_id' => $variantId,
                'name' => $product['name'],
                'variant_name' => $variant['name'] ?? null,
                'unit_code' => $variant ? 'und' : $product['unit_code'],
                'quantity' => $quantity,
                'qty_base' => $qtyBase,
                'list_price' => $listPrice,
                'gross' => $gross,
                'discount_type' => $discType,
                'discount_value' => $discValue,
                'discount_amount' => $discAmount,
                'discount_percent' => $percent,
                'discount_reason' => isset($disc['reason']) ? mb_substr(trim((string) $disc['reason']), 0, 255) : null,
                'total' => $total,
                'unit_cost' => $unitCost,
                'cost_total' => $costTotal,
                'margin_pct' => $margin,
                'limit' => $limit,
                'requires_approval' => ($exceedsLimit || $belowMin) && !$approval,
                'below_min_price' => $belowMin,
                'below_margin' => $belowMargin,
                'approval' => $approval,
            ];
            $productIds[$productId] = true;
        }

        // Existencias: se suman los consumos por producto (varias líneas/presentaciones).
        $needed = [];
        foreach ($lines as $l) {
            $needed[$l['product_id']] = Dec::add($needed[$l['product_id']] ?? '0', $l['qty_base'], 3);
        }
        ksort($needed); // orden fijo de bloqueo para evitar interbloqueos
        $stock = [];
        foreach ($needed as $pid => $qty) {
            $row = $lock
                ? $this->inventory->lock($branchId, $pid)
                : ($this->db->one('SELECT quantity, reserved FROM inventory WHERE branch_id = :b AND product_id = :p', ['b' => $branchId, 'p' => $pid])
                    ?? ['quantity' => '0', 'reserved' => '0']);
            $available = Dec::sub($row['quantity'], $row['reserved'], 3);
            $stock[$pid] = ['available' => $available, 'needed' => $qty, 'ok' => Dec::cmp($available, $qty) >= 0 || $this->inventory->negativeAllowed($pid)];
        }

        $subtotal = Dec::sum(array_column($lines, 'gross'));
        $discountTotal = Dec::sum(array_column($lines, 'discount_amount'));
        $total = Dec::sum(array_column($lines, 'total'));
        $cost = Dec::sum(array_column($lines, 'cost_total'));
        return [
            'lines' => $lines,
            'stock' => $stock,
            'subtotal' => $subtotal,
            'discount_total' => $discountTotal,
            'total' => $total,
            'cost_total' => $cost,
            'requires_approval' => (bool) array_filter($lines, static fn ($l) => $l['requires_approval']),
            'below_margin' => (bool) array_filter($lines, static fn ($l) => $l['below_margin']),
            'stock_ok' => !array_filter($stock, static fn ($s) => !$s['ok']),
        ];
    }

    /** Decimales de liquidación: 0 para COP (pesos enteros). */
    private function moneyScale(): int
    {
        return (int) (Settings::get('money_decimals', '0') ?? '0');
    }

    /** Respuesta pública del cálculo (sin datos de costo para quien no puede verlos). */
    public function publicQuote(array $quote): array
    {
        $showCost = Auth::can('products.cost_view');
        return [
            'subtotal' => $quote['subtotal'],
            'discount_total' => $quote['discount_total'],
            'total' => $quote['total'],
            'requires_approval' => $quote['requires_approval'],
            'below_margin' => $quote['below_margin'],
            'stock_ok' => $quote['stock_ok'],
            'lines' => array_map(static fn ($l) => [
                'index' => $l['index'],
                'gross' => $l['gross'],
                'discount_amount' => $l['discount_amount'],
                'discount_percent' => $l['discount_percent'],
                'total' => $l['total'],
                'limit' => $l['limit'],
                'requires_approval' => $l['requires_approval'],
                'below_min_price' => $l['below_min_price'],
                'below_margin' => $l['below_margin'],
                'margin_pct' => $showCost ? $l['margin_pct'] : null,
            ], $quote['lines']),
            'stock' => array_map(static fn ($s) => ['ok' => $s['ok'], 'available' => $s['available']], $quote['stock']),
        ];
    }

    /** @return array{id:int, number:string, duplicate:bool, total:string, change:string} */
    public function create(array $input): array
    {
        Auth::authorize('pos.sell');
        $userId = Auth::requireId();
        $branchId = Auth::activeBranchId();
        if ($branchId === null) {
            throw new ValidationException('No tiene una sucursal asignada para vender.');
        }
        $branch = $this->db->one('SELECT * FROM branches WHERE id = :id', ['id' => $branchId]);
        if (!$branch || !(int) $branch['is_active'] || $branch['type'] !== 'store') {
            throw new ValidationException('La sucursal activa no está habilitada para ventas.');
        }
        $requestId = (string) ($input['client_request_id'] ?? '');
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $requestId)) {
            throw new ValidationException('Falta el identificador de la operación. Recargue el punto de venta.');
        }
        $existing = $this->findByRequest($requestId, $userId);
        if ($existing) {
            return $existing;
        }

        try {
            return $this->db->transaction(function () use ($input, $userId, $branchId, $branch, $requestId) {
                $session = $this->cash->openSessionFor($userId, $branchId);
                if (!$session) {
                    throw new ValidationException('Debe abrir su caja antes de registrar ventas.');
                }
                $session = $this->db->one("SELECT * FROM cash_sessions WHERE id = :id AND status = 'open' FOR UPDATE", ['id' => $session['id']]);
                if (!$session) {
                    throw new ValidationException('Su turno de caja fue cerrado. Abra la caja nuevamente.');
                }

                $customerId = isset($input['customer_id']) && $input['customer_id'] ? (int) $input['customer_id'] : null;
                if ($customerId && !$this->db->value('SELECT id FROM customers WHERE id = :id AND is_active = 1', ['id' => $customerId])) {
                    throw new ValidationException('El cliente seleccionado no existe.');
                }

                $quote = $this->quote($input, $userId, $branchId, true);
                foreach ($quote['lines'] as $l) {
                    if ($l['requires_approval']) {
                        throw new ValidationException(
                            "El descuento de «{$l['name']}» (" . pct($l['discount_percent'], 2) . ') requiere autorización de un supervisor.',
                            ['approval' => $l['index']]
                        );
                    }
                }
                if (!$quote['stock_ok']) {
                    foreach ($quote['stock'] as $pid => $s) {
                        if (!$s['ok']) {
                            $name = $this->db->value('SELECT name FROM products WHERE id = :id', ['id' => $pid]);
                            throw new ValidationException("Existencias insuficientes de «{$name}»: disponible " . qty($s['available']) . '.', ['stock' => $pid]);
                        }
                    }
                }

                $payments = $this->validatePayments($input['payments'] ?? [], $quote['total']);

                $number = Sequence::next('sale:' . $branchId, $branch['code'] . '-');
                $saleId = $this->db->insert('sales', [
                    'number' => $number,
                    'client_request_id' => $requestId,
                    'branch_id' => $branchId,
                    'register_id' => $session['register_id'],
                    'cash_session_id' => $session['id'],
                    'user_id' => $userId,
                    'customer_id' => $customerId,
                    'status' => 'completed',
                    'subtotal' => $quote['subtotal'],
                    'discount_total' => $quote['discount_total'],
                    'total' => $quote['total'],
                    'cost_total' => $quote['cost_total'],
                    'paid_total' => $payments['paid'],
                    'change_total' => $payments['change'],
                    'items_count' => count($quote['lines']),
                    'notes' => isset($input['notes']) ? mb_substr(trim((string) $input['notes']), 0, 255) ?: null : null,
                    'created_at' => gmdate('Y-m-d H:i:s'),
                ]);

                $approvalIds = [];
                foreach ($quote['lines'] as $l) {
                    $move = $this->inventory->change(
                        $branchId, $l['product_id'], Dec::neg($l['qty_base']), 'sale', 'sale', $saleId,
                        "Venta $number", $l['unit_cost']
                    );
                    $itemId = $this->db->insert('sale_items', [
                        'sale_id' => $saleId,
                        'product_id' => $l['product_id'],
                        'variant_id' => $l['variant_id'],
                        'product_code' => $l['product']['code'],
                        'product_sku' => $l['variant']['sku'] ?? $l['product']['sku'],
                        'product_name' => $l['name'],
                        'variant_name' => $l['variant_name'],
                        'brand_name' => $l['product']['brand_name'],
                        'category_name' => $l['product']['category_name'],
                        'unit_code' => $l['unit_code'],
                        'quantity' => $l['quantity'],
                        'qty_base' => $l['qty_base'],
                        'stock_before' => $move['before'],
                        'stock_after' => $move['after'],
                        'list_unit_price' => $l['list_price'],
                        'gross_amount' => $l['gross'],
                        'discount_type' => $l['discount_type'],
                        'discount_value' => $l['discount_value'],
                        'discount_amount' => $l['discount_amount'],
                        'total' => $l['total'],
                        'unit_cost' => $l['unit_cost'],
                        'cost_total' => $l['cost_total'],
                        'approval_id' => $l['approval']['id'] ?? null,
                    ]);
                    if (Dec::isPositive($l['discount_amount'])) {
                        $this->db->insert('discounts', [
                            'sale_id' => $saleId,
                            'sale_item_id' => $itemId,
                            'type' => $l['discount_type'],
                            'value' => $l['discount_value'],
                            'amount' => $l['discount_amount'],
                            'percent' => $l['discount_percent'],
                            'reason' => $l['discount_reason'],
                            'applied_by' => $userId,
                            'approval_id' => $l['approval']['id'] ?? null,
                            'approved_by' => $l['approval']['decided_by'] ?? null,
                            'below_margin' => $l['below_margin'] ? 1 : 0,
                        ]);
                    }
                    if ($l['approval']) {
                        $approvalIds[] = (int) $l['approval']['id'];
                    }
                }
                $this->discounts->markUsed($approvalIds, $saleId);

                foreach ($payments['rows'] as $p) {
                    $this->db->insert('sale_payments', [
                        'sale_id' => $saleId,
                        'payment_method_id' => $p['method']['id'],
                        'method_name' => $p['method']['name'],
                        'amount' => $p['applied'],
                        'received' => $p['received'],
                        'change_given' => $p['change'],
                        'reference' => $p['reference'],
                        'verification' => $p['method']['type'] === 'cash' ? 'not_required' : 'pending_manual',
                    ]);
                    $this->db->insert('cash_movements', [
                        'cash_session_id' => $session['id'],
                        'type' => 'sale',
                        'payment_method_id' => $p['method']['id'],
                        'amount' => $p['applied'],
                        'reference_type' => 'sale',
                        'reference_id' => $saleId,
                        'reason' => "Venta $number",
                        'user_id' => $userId,
                    ]);
                }

                Audit::log('sale.create', 'sale', $saleId, "Venta $number por " . money($quote['total']), null, [
                    'total' => $quote['total'], 'discount_total' => $quote['discount_total'], 'items' => count($quote['lines']),
                ], $branchId);
                if (Dec::isPositive($quote['discount_total'])) {
                    Audit::log('sale.discount', 'sale', $saleId, "Descuentos en venta $number: " . money($quote['discount_total']),
                        null, ['discount_total' => $quote['discount_total'], 'below_margin' => $quote['below_margin']], $branchId);
                }
                return [
                    'id' => $saleId, 'number' => $number, 'duplicate' => false,
                    'total' => $quote['total'], 'change' => $payments['change'],
                ];
            });
        } catch (PDOException $e) {
            // Carrera entre dos envíos idénticos: la restricción única protege; se devuelve la venta original.
            if ($e->getCode() === '23000' && ($existing = $this->findByRequest($requestId, $userId))) {
                return $existing;
            }
            throw $e;
        }
    }

    private function findByRequest(string $requestId, int $userId): ?array
    {
        $row = $this->db->one('SELECT id, number, total, change_total, user_id FROM sales WHERE client_request_id = :r', ['r' => $requestId]);
        if (!$row) {
            return null;
        }
        if ((int) $row['user_id'] !== $userId) {
            throw new ValidationException('Identificador de operación inválido.');
        }
        return ['id' => (int) $row['id'], 'number' => $row['number'], 'duplicate' => true, 'total' => $row['total'], 'change' => $row['change_total']];
    }

    /**
     * Valida pagos: los medios electrónicos no pueden exceder el total;
     * el efectivo puede exceder y genera cambio. La suma aplicada debe
     * coincidir exactamente con el total de la venta.
     */
    public function validatePayments(mixed $rows, string $total): array
    {
        if (!is_array($rows) || $rows === []) {
            throw new ValidationException('Registre al menos un medio de pago.');
        }
        if (count($rows) > 1 && !Settings::bool('allow_mixed_payments')) {
            throw new ValidationException('Los pagos mixtos no están habilitados.');
        }
        $methods = [];
        foreach ($this->db->all('SELECT * FROM payment_methods WHERE is_active = 1') as $m) {
            $methods[(int) $m['id']] = $m;
        }
        $clean = [];
        $nonCash = '0.00';
        $cash = '0.00';
        foreach ($rows as $r) {
            $mid = (int) ($r['method_id'] ?? 0);
            $method = $methods[$mid] ?? null;
            if (!$method) {
                throw new ValidationException('Uno de los medios de pago no está disponible.');
            }
            $amount = Validator::money($r['amount'] ?? '', "el valor pagado con {$method['name']}", false);
            $reference = isset($r['reference']) ? mb_substr(trim((string) $r['reference']), 0, 80) : '';
            if ((int) $method['requires_reference'] && mb_strlen($reference) < 3) {
                throw new ValidationException("Escriba la referencia o comprobante del pago con {$method['name']}.");
            }
            $clean[] = ['method' => $method, 'received' => $amount, 'reference' => $reference ?: null];
            if ($method['type'] === 'cash') {
                $cash = Dec::add($cash, $amount);
            } else {
                $nonCash = Dec::add($nonCash, $amount);
            }
        }
        if (Dec::cmp($nonCash, $total) > 0) {
            throw new ValidationException('Los pagos electrónicos superan el total de la venta. Ajuste los valores.');
        }
        $paid = Dec::add($cash, $nonCash);
        if (Dec::cmp($paid, $total) < 0) {
            throw new ValidationException('El valor recibido es menor que el total. Faltan ' . money(Dec::sub($total, $paid)) . '.');
        }
        $change = Dec::sub($paid, $total);
        // El cambio se descuenta del efectivo recibido.
        $remainingChange = $change;
        foreach ($clean as &$c) {
            $c['change'] = '0.00';
            $c['applied'] = $c['received'];
            if ($c['method']['type'] === 'cash' && Dec::isPositive($remainingChange)) {
                $give = Dec::min($remainingChange, $c['received']);
                $c['change'] = $give;
                $c['applied'] = Dec::sub($c['received'], $give);
                $remainingChange = Dec::sub($remainingChange, $give);
            }
        }
        unset($c);
        $clean = array_values(array_filter($clean, static fn ($c) => Dec::isPositive($c['applied'])));
        $applied = Dec::sum(array_column($clean, 'applied'));
        if (Dec::cmp($applied, $total) !== 0) {
            throw new ValidationException('Los pagos registrados no coinciden con el total de la venta.');
        }
        return ['rows' => $clean, 'paid' => $paid, 'change' => $change];
    }

    /** Anulación controlada: genera movimientos compensatorios y conserva la venta original. */
    public function void(int $saleId, string $reason): void
    {
        Auth::authorize('sales.void');
        if (mb_strlen(trim($reason)) < 5) {
            throw ValidationException::field('reason', 'Explique el motivo de la anulación (mínimo 5 caracteres).');
        }
        $this->db->transaction(function () use ($saleId, $reason) {
            $sale = $this->db->one('SELECT * FROM sales WHERE id = :id FOR UPDATE', ['id' => $saleId]);
            if (!$sale) {
                throw HttpException::notFound('La venta no existe.');
            }
            Auth::authorizeBranch((int) $sale['branch_id']);
            if ($sale['status'] !== 'completed') {
                throw new ValidationException('La venta ya está anulada.');
            }
            if ($this->db->value("SELECT id FROM returns WHERE sale_id = :s AND status <> 'rejected' LIMIT 1", ['s' => $saleId])) {
                throw new ValidationException('La venta tiene devoluciones registradas; gestione el caso como devolución.');
            }
            $session = $this->db->one('SELECT * FROM cash_sessions WHERE id = :id FOR UPDATE', ['id' => $sale['cash_session_id']]);
            if ($session['status'] !== 'open') {
                throw new ValidationException('El turno de caja de esta venta ya se cerró. Registre una devolución en lugar de anularla.');
            }
            $items = $this->db->all('SELECT * FROM sale_items WHERE sale_id = :s ORDER BY product_id', ['s' => $saleId]);
            foreach ($items as $it) {
                $this->inventory->change((int) $sale['branch_id'], (int) $it['product_id'], $it['qty_base'], 'sale_void', 'sale', $saleId,
                    "Anulación venta {$sale['number']}", $it['unit_cost'], true);
            }
            foreach ($this->db->all('SELECT * FROM sale_payments WHERE sale_id = :s', ['s' => $saleId]) as $p) {
                $this->db->insert('cash_movements', [
                    'cash_session_id' => $session['id'], 'type' => 'void', 'payment_method_id' => $p['payment_method_id'],
                    'amount' => Dec::neg($p['amount']), 'reference_type' => 'sale', 'reference_id' => $saleId,
                    'reason' => 'Anulación: ' . mb_substr($reason, 0, 200), 'user_id' => Auth::id(),
                ]);
            }
            $this->db->update('sales', [
                'status' => 'voided', 'voided_by' => Auth::id(), 'voided_at' => gmdate('Y-m-d H:i:s'),
                'void_reason' => mb_substr(trim($reason), 0, 255),
            ], 'id = :id', ['id' => $saleId]);
            Audit::log('sale.void', 'sale', $saleId, "Venta {$sale['number']} anulada: $reason",
                ['status' => 'completed'], ['status' => 'voided'], (int) $sale['branch_id']);
        });
    }

    /** Venta con detalle, validando el alcance del usuario. */
    public function find(int $saleId): array
    {
        $sale = $this->db->one(
            'SELECT s.*, b.name AS branch_name, b.code AS branch_code, b.address AS branch_address, b.phone AS branch_phone,
                    b.receipt_footer, u.name AS seller_name, c.full_name AS customer_name, c.document_number AS customer_document,
                    c.phone AS customer_phone, cr.name AS register_name, v.name AS voided_by_name
             FROM sales s
             JOIN branches b ON b.id = s.branch_id
             JOIN users u ON u.id = s.user_id
             JOIN cash_registers cr ON cr.id = s.register_id
             LEFT JOIN customers c ON c.id = s.customer_id
             LEFT JOIN users v ON v.id = s.voided_by
             WHERE s.id = :id',
            ['id' => $saleId]
        );
        if (!$sale) {
            throw HttpException::notFound('La venta no existe.');
        }
        $this->authorizeView($sale);
        $sale['items'] = $this->db->all(
            'SELECT si.*, d.reason AS discount_reason, au.name AS approved_by_name,
                    (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = si.product_id AND pi.is_primary = 1 LIMIT 1) AS thumb
             FROM sale_items si
             LEFT JOIN discounts d ON d.sale_item_id = si.id
             LEFT JOIN users au ON au.id = d.approved_by
             WHERE si.sale_id = :s ORDER BY si.id',
            ['s' => $saleId]
        );
        $sale['payments'] = $this->db->all('SELECT * FROM sale_payments WHERE sale_id = :s ORDER BY id', ['s' => $saleId]);
        $sale['returns'] = $this->db->all(
            'SELECT r.*, u.name AS user_name FROM returns r JOIN users u ON u.id = r.user_id WHERE r.sale_id = :s ORDER BY r.id',
            ['s' => $saleId]
        );
        return $sale;
    }

    public function authorizeView(array $sale): void
    {
        Auth::authorizeBranch((int) $sale['branch_id']);
        if (!Auth::can('sales.view_branch') && (int) $sale['user_id'] !== Auth::id()) {
            throw HttpException::forbidden('Solo puede consultar sus propias ventas.');
        }
    }

    public function registerReprint(int $saleId): void
    {
        Auth::authorize('sales.reprint');
        $this->db->execute('UPDATE sales SET reprint_count = reprint_count + 1 WHERE id = :id', ['id' => $saleId]);
        $sale = $this->db->one('SELECT number, branch_id FROM sales WHERE id = :id', ['id' => $saleId]);
        Audit::log('sale.reprint', 'sale', $saleId, "Reimpresión del comprobante {$sale['number']}", null, null, (int) $sale['branch_id']);
    }
}

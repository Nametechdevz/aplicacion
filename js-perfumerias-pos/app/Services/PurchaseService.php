<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Support\Dec;
use App\Validators\Validator;

/**
 * Órdenes de compra, recepciones (totales o parciales) y devoluciones a
 * proveedor. Una orden no mueve inventario: solo la recepción efectiva.
 */
final class PurchaseService
{
    private InventoryService $inventory;
    private ProductService $products;

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
        $this->inventory = new InventoryService($this->db);
        $this->products = new ProductService($this->db);
    }

    public function create(array $input): int
    {
        Auth::authorize('purchases.manage');
        $data = Validator::make($input, [
            'supplier_id' => 'required|int',
            'branch_id' => 'required|int',
            'order_date' => 'required|date',
            'expected_date' => 'nullable|date',
            'additional_costs' => 'nullable|decimal:2|min:0',
            'notes' => 'nullable|string|max:500',
        ], ['supplier_id' => 'el proveedor', 'branch_id' => 'la sucursal de recepción', 'order_date' => 'la fecha de la orden']);
        Auth::authorizeBranch($data['branch_id']);
        if (!$this->db->value('SELECT id FROM suppliers WHERE id = :id AND is_active = 1', ['id' => $data['supplier_id']])) {
            throw ValidationException::field('supplier_id', 'Seleccione un proveedor activo.');
        }
        $lines = [];
        foreach ((array) ($input['items'] ?? []) as $row) {
            $pid = (int) ($row['product_id'] ?? 0);
            if (!$pid || trim((string) ($row['quantity'] ?? '')) === '') {
                continue;
            }
            $p = $this->db->one('SELECT id, name, qty_precision FROM products WHERE id = :id', ['id' => $pid]);
            if (!$p) {
                throw new ValidationException('Uno de los productos no existe.');
            }
            $qty = Validator::quantity($row['quantity'], (int) $p['qty_precision'], "la cantidad de «{$p['name']}»");
            $cost = str_replace(',', '.', trim((string) ($row['unit_cost'] ?? '')));
            if (!Dec::isValid($cost) || Dec::isNegative($cost)) {
                throw new ValidationException("Indique el costo unitario de «{$p['name']}».");
            }
            $cost = Dec::norm($cost, 4);
            $discount = Validator::money(($row['discount_amount'] ?? '') === '' ? '0' : $row['discount_amount'], 'el descuento de compra');
            $gross = Dec::mul($qty, $cost, 2);
            if (Dec::cmp($discount, $gross) > 0) {
                throw new ValidationException("El descuento de «{$p['name']}» supera el valor de la línea.");
            }
            $lines[] = ['product_id' => $pid, 'quantity' => $qty, 'unit_cost' => $cost, 'discount_amount' => $discount, 'line_total' => Dec::sub($gross, $discount)];
        }
        if (!$lines) {
            throw new ValidationException('Agregue al menos un producto a la orden.');
        }
        return $this->db->transaction(function () use ($data, $lines, $input) {
            $subtotal = Dec::sum(array_map(static fn ($l) => Dec::mul($l['quantity'], $l['unit_cost'], 2), $lines));
            $discount = Dec::sum(array_column($lines, 'discount_amount'));
            $additional = $data['additional_costs'] ?? '0.00';
            $number = Sequence::next('purchase', 'OC-');
            $status = ($input['submit'] ?? '') === 'order' ? 'ordered' : 'draft';
            $id = $this->db->insert('purchase_orders', [
                'number' => $number, 'supplier_id' => $data['supplier_id'], 'branch_id' => $data['branch_id'], 'status' => $status,
                'order_date' => $data['order_date'], 'expected_date' => $data['expected_date'],
                'subtotal' => $subtotal, 'discount_total' => $discount, 'additional_costs' => $additional,
                'total' => Dec::add(Dec::sub($subtotal, $discount), $additional), 'notes' => $data['notes'], 'created_by' => Auth::id(),
            ]);
            foreach ($lines as $l) {
                $l['purchase_order_id'] = $id;
                $this->db->insert('purchase_order_items', $l);
            }
            Audit::log('purchase.create', 'purchase_order', $id, "Orden de compra $number", null, ['status' => $status, 'total' => $subtotal], $data['branch_id']);
            return $id;
        });
    }

    public function markOrdered(int $id): void
    {
        Auth::authorize('purchases.manage');
        $this->db->transaction(function () use ($id) {
            $po = $this->lock($id, ['draft']);
            $this->db->update('purchase_orders', ['status' => 'ordered'], 'id = :id', ['id' => $id]);
            Audit::log('purchase.order', 'purchase_order', $id, "Orden {$po['number']} enviada al proveedor", ['status' => 'draft'], ['status' => 'ordered'], (int) $po['branch_id']);
        });
    }

    public function cancel(int $id, string $reason): void
    {
        Auth::authorize('purchases.manage');
        $this->db->transaction(function () use ($id, $reason) {
            $po = $this->lock($id, ['draft', 'ordered']);
            $this->db->update('purchase_orders', ['status' => 'cancelled', 'notes' => trim(($po['notes'] ?? '') . "\nCancelada: " . $reason)], 'id = :id', ['id' => $id]);
            Audit::log('purchase.cancel', 'purchase_order', $id, "Orden {$po['number']} cancelada: $reason", ['status' => $po['status']], ['status' => 'cancelled'], (int) $po['branch_id']);
        });
    }

    /**
     * Recepción de mercancía. Solo incrementa existencias por lo recibido; los
     * costos adicionales de la recepción se prorratean por valor para obtener
     * el costo puesto en bodega, que actualiza el costo vigente del producto.
     */
    public function receive(int $poId, array $input): int
    {
        Auth::authorize('purchases.manage');
        return $this->db->transaction(function () use ($poId, $input) {
            $po = $this->lock($poId, ['ordered', 'partial']);
            $items = $this->db->all(
                'SELECT poi.*, p.name, p.qty_precision FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id
                 WHERE poi.purchase_order_id = :id ORDER BY poi.product_id FOR UPDATE',
                ['id' => $poId]
            );
            $qtys = (array) ($input['received'] ?? []);
            $lines = [];
            foreach ($items as $it) {
                $raw = trim((string) ($qtys[$it['id']] ?? ''));
                if ($raw === '' || $raw === '0') {
                    continue;
                }
                $qty = Validator::quantity($raw, (int) $it['qty_precision'], "la cantidad recibida de «{$it['name']}»");
                $pending = Dec::sub($it['quantity'], $it['qty_received'], 3);
                if (Dec::cmp($qty, $pending) > 0) {
                    throw new ValidationException("La cantidad recibida de «{$it['name']}» supera lo pendiente (" . qty($pending) . ').');
                }
                // Costo neto unitario después del descuento de la línea.
                $netUnit = Dec::isPositive($it['quantity'])
                    ? Dec::div(Dec::sub(Dec::mul($it['quantity'], $it['unit_cost'], 4), $it['discount_amount'], 4), $it['quantity'], 4)
                    : $it['unit_cost'];
                $lines[] = ['item' => $it, 'qty' => $qty, 'unit' => $netUnit, 'value' => Dec::mul($qty, $netUnit, 2)];
            }
            if (!$lines) {
                throw new ValidationException('Indique al menos una cantidad recibida.');
            }
            $additional = Validator::money(($input['additional_costs'] ?? '') === '' ? '0' : $input['additional_costs'], 'los costos adicionales');
            $totalValue = Dec::sum(array_column($lines, 'value'));
            $number = Sequence::next('receipt', 'RM-');
            $receiptId = $this->db->insert('goods_receipts', [
                'number' => $number, 'purchase_order_id' => $poId, 'branch_id' => $po['branch_id'],
                'supplier_invoice' => mb_substr(trim((string) ($input['supplier_invoice'] ?? '')), 0, 60) ?: null,
                'invoice_date' => ($input['invoice_date'] ?? '') ?: null,
                'additional_costs' => $additional, 'total' => Dec::add($totalValue, $additional),
                'notes' => mb_substr(trim((string) ($input['notes'] ?? '')), 0, 500) ?: null, 'received_by' => Auth::id(),
            ]);
            foreach ($lines as $l) {
                $share = Dec::isPositive($totalValue) ? Dec::div(Dec::mul($additional, $l['value'], 4), $totalValue, 4) : '0';
                $landed = Dec::add($l['unit'], Dec::div($share, $l['qty'], 4), 4);
                $this->db->insert('goods_receipt_items', [
                    'goods_receipt_id' => $receiptId, 'purchase_order_item_id' => $l['item']['id'], 'product_id' => $l['item']['product_id'],
                    'quantity' => $l['qty'], 'unit_cost' => $landed, 'line_total' => Dec::mul($l['qty'], $landed, 2),
                ]);
                $this->products->applyIncomingCost((int) $l['item']['product_id'], $l['qty'], $landed, 'purchase');
                $this->inventory->change((int) $po['branch_id'], (int) $l['item']['product_id'], $l['qty'], 'purchase_receipt',
                    'goods_receipt', $receiptId, "Recepción $number ({$po['number']})", $landed);
                $this->db->execute('UPDATE purchase_order_items SET qty_received = qty_received + :q WHERE id = :id', ['q' => $l['qty'], 'id' => $l['item']['id']]);
            }
            $pending = (string) $this->db->value('SELECT COALESCE(SUM(quantity - qty_received), 0) FROM purchase_order_items WHERE purchase_order_id = :id', ['id' => $poId]);
            $status = Dec::isPositive($pending) ? 'partial' : 'received';
            $this->db->update('purchase_orders', ['status' => $status], 'id = :id', ['id' => $poId]);
            Audit::log('purchase.receive', 'purchase_order', $poId, "Recepción $number de {$po['number']}", ['status' => $po['status']], ['status' => $status, 'receipt' => $number], (int) $po['branch_id']);
            return $receiptId;
        });
    }

    /** Devolución a proveedor: reduce existencias de lo recibido. */
    public function supplierReturn(int $poId, array $input): int
    {
        Auth::authorize('purchases.manage');
        $reason = trim((string) ($input['reason'] ?? ''));
        if (mb_strlen($reason) < 4) {
            throw ValidationException::field('reason', 'Indique el motivo de la devolución al proveedor.');
        }
        return $this->db->transaction(function () use ($poId, $input, $reason) {
            $po = $this->lock($poId, ['partial', 'received']);
            $returned = $this->db->all(
                'SELECT sri.product_id, SUM(sri.quantity) AS q FROM supplier_return_items sri JOIN supplier_returns sr ON sr.id = sri.supplier_return_id
                 WHERE sr.purchase_order_id = :po GROUP BY sri.product_id',
                ['po' => $poId]
            );
            $returnedMap = array_column($returned, 'q', 'product_id');
            $lines = [];
            foreach ($this->db->all('SELECT poi.*, p.name, p.qty_precision FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id WHERE poi.purchase_order_id = :id ORDER BY poi.product_id', ['id' => $poId]) as $it) {
                $raw = trim((string) (($input['return'] ?? [])[$it['id']] ?? ''));
                if ($raw === '' || $raw === '0') {
                    continue;
                }
                $qty = Validator::quantity($raw, (int) $it['qty_precision'], "la cantidad a devolver de «{$it['name']}»");
                $max = Dec::sub($it['qty_received'], $returnedMap[$it['product_id']] ?? '0', 3);
                if (Dec::cmp($qty, $max) > 0) {
                    throw new ValidationException("No puede devolver más de lo recibido de «{$it['name']}» (" . qty($max) . ').');
                }
                $cost = (string) ($this->db->value('SELECT AVG(unit_cost) FROM goods_receipt_items WHERE purchase_order_item_id = :i', ['i' => $it['id']]) ?? $it['unit_cost']);
                $lines[] = ['product_id' => (int) $it['product_id'], 'qty' => $qty, 'cost' => Dec::norm($cost, 4)];
            }
            if (!$lines) {
                throw new ValidationException('Indique al menos una cantidad a devolver.');
            }
            $number = Sequence::next('supplier_return', 'DP-');
            $total = Dec::sum(array_map(static fn ($l) => Dec::mul($l['qty'], $l['cost'], 2), $lines));
            $id = $this->db->insert('supplier_returns', [
                'number' => $number, 'supplier_id' => $po['supplier_id'], 'purchase_order_id' => $poId, 'branch_id' => $po['branch_id'],
                'reason' => mb_substr($reason, 0, 255), 'total' => $total, 'created_by' => Auth::id(),
            ]);
            foreach ($lines as $l) {
                $this->db->insert('supplier_return_items', [
                    'supplier_return_id' => $id, 'product_id' => $l['product_id'], 'quantity' => $l['qty'],
                    'unit_cost' => $l['cost'], 'line_total' => Dec::mul($l['qty'], $l['cost'], 2),
                ]);
                $this->inventory->change((int) $po['branch_id'], $l['product_id'], Dec::neg($l['qty']), 'supplier_return',
                    'supplier_return', $id, "Devolución a proveedor $number", $l['cost']);
            }
            Audit::log('purchase.supplier_return', 'supplier_return', $id, "Devolución $number a proveedor: $reason", null, ['total' => $total], (int) $po['branch_id']);
            return $id;
        });
    }

    private function lock(int $id, array $allowed): array
    {
        $po = $this->db->one('SELECT * FROM purchase_orders WHERE id = :id FOR UPDATE', ['id' => $id]);
        if (!$po) {
            throw HttpException::notFound('La orden de compra no existe.');
        }
        Auth::authorizeBranch((int) $po['branch_id']);
        if (!in_array($po['status'], $allowed, true)) {
            throw new ValidationException('La orden de compra no admite esta acción en su estado actual.');
        }
        return $po;
    }
}

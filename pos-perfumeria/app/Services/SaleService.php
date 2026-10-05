<?php
namespace App\Services;

use App\Core\DB;
use App\Core\Settings;
use App\Services\Dian\ElectronicInvoice;
use RuntimeException;

class SaleService
{
    /**
     * Crea una venta completa: valida, descuenta inventario, registra pagos,
     * asigna consecutivo DIAN y emite el documento electrónico.
     *
     * @param array $data [customer_id, doc_type, global_discount, notes, items[], payments[]]
     * @param array $user Usuario autenticado
     */
    public static function create(array $data, array $user): array
    {
        $session = Cash::openSession((int) $user['id']);
        if (!$session) {
            throw new RuntimeException('Debes abrir la caja antes de vender.');
        }

        $docType = ($data['doc_type'] ?? 'POS') === 'FEV' ? 'FEV' : 'POS';
        $customerId = (int) ($data['customer_id'] ?? 1) ?: 1;
        $customer = DB::one('SELECT * FROM customers WHERE id = ?', [$customerId]);
        if (!$customer) {
            throw new RuntimeException('Cliente no encontrado.');
        }
        if ($docType === 'FEV') {
            if ($customerId === 1) {
                throw new RuntimeException('La factura electrónica requiere un cliente identificado (no consumidor final).');
            }
            if (empty($customer['email'])) {
                throw new RuntimeException('El cliente necesita un correo electrónico para recibir la factura electrónica.');
            }
        }

        $items = array_values(array_filter($data['items'] ?? [], fn($i) => (int) ($i['qty'] ?? 0) > 0));
        if (!$items) {
            throw new RuntimeException('La venta no tiene productos.');
        }

        $isAdmin = $user['role'] === 'admin';
        $maxDiscount = $isAdmin ? 100.0 : (float) Settings::get('cashier_max_discount', '20');
        $globalDiscount = (float) ($data['global_discount'] ?? 0);
        if ($globalDiscount < 0 || $globalDiscount > $maxDiscount) {
            throw new RuntimeException('Descuento global no permitido (máximo ' . $maxDiscount . '%).');
        }
        $allowNegative = Settings::get('allow_negative_stock', '0') === '1';

        $payments = [];
        foreach ($data['payments'] ?? [] as $p) {
            $amount = round((float) ($p['amount'] ?? 0), 2);
            $method = (string) ($p['method'] ?? '');
            if ($amount <= 0) {
                continue;
            }
            if (!array_key_exists($method, payment_methods())) {
                throw new RuntimeException('Medio de pago no válido: ' . $method);
            }
            $payments[] = ['method' => $method, 'amount' => $amount, 'reference' => mb_substr(trim((string) ($p['reference'] ?? '')), 0, 80) ?: null];
        }
        if (!$payments) {
            throw new RuntimeException('Registra al menos un pago.');
        }

        $saleId = DB::transaction(function () use ($items, $payments, $docType, $customerId, $session, $user, $isAdmin, $maxDiscount, $globalDiscount, $allowNegative, $data) {
            $lines = [];
            foreach ($items as $it) {
                $p = DB::one('SELECT * FROM products WHERE id = ? AND active = 1 FOR UPDATE', [(int) $it['product_id']]);
                if (!$p) {
                    throw new RuntimeException('Producto no disponible (#' . (int) $it['product_id'] . ').');
                }
                $qty = (int) $it['qty'];
                $lineDiscount = (float) ($it['discount'] ?? 0);
                if ($lineDiscount < 0 || $lineDiscount > $maxDiscount) {
                    throw new RuntimeException("Descuento no permitido en {$p['name']} (máximo {$maxDiscount}%).");
                }
                $price = (float) $p['price'];
                if ($isAdmin && isset($it['price']) && (float) $it['price'] > 0) {
                    $price = round((float) $it['price'], 2);
                }
                if (!$allowNegative) {
                    $already = array_sum(array_map(fn($l) => $l['product_id'] === (int) $p['id'] ? $l['qty'] : 0, $lines));
                    if ((int) $p['stock'] < $qty + $already) {
                        throw new RuntimeException("Stock insuficiente de {$p['name']}: disponible {$p['stock']}.");
                    }
                }
                $pct = Calculator::combineDiscounts($lineDiscount, $globalDiscount);
                $calc = Calculator::line($price, $qty, $pct, (float) $p['tax_rate']);
                $lines[] = [
                    'product_id'      => (int) $p['id'],
                    'code'            => $p['code'],
                    'description'     => trim($p['name'] . ($p['concentration'] ? ' ' . $p['concentration'] : '') . ($p['size_ml'] ? ' ' . $p['size_ml'] . 'ml' : '')),
                    'qty'             => $qty,
                    'unit_price'      => $price,
                    'unit_cost'       => (float) $p['cost'],
                    'discount_pct'    => $pct,
                    'discount_amount' => $calc['discount_amount'],
                    'tax_rate'        => (float) $p['tax_rate'],
                    'base'            => $calc['base'],
                    'tax'             => $calc['tax'],
                    'total'           => $calc['total'],
                ];
            }

            $subtotal = round(array_sum(array_column($lines, 'base')), 2);
            $taxTotal = round(array_sum(array_column($lines, 'tax')), 2);
            $total = round(array_sum(array_column($lines, 'total')), 2);
            $discountTotal = round(array_sum(array_column($lines, 'discount_amount')), 2);

            $paid = round(array_sum(array_column($payments, 'amount')), 2);
            if ($paid + 0.009 < $total) {
                throw new RuntimeException('El pago (' . money($paid) . ') no cubre el total (' . money($total) . ').');
            }
            $change = round($paid - $total, 2);
            $cashPaid = array_sum(array_map(fn($p) => $p['method'] === 'efectivo' ? $p['amount'] : 0, $payments));
            if ($change > 0.009 && $change - $cashPaid > 0.009) {
                throw new RuntimeException('Solo se puede dar cambio sobre pagos en efectivo.');
            }

            $num = Numbering::next($docType);
            $saleId = DB::insert('sales', [
                'cash_session_id'    => $session['id'],
                'user_id'            => $user['id'],
                'customer_id'        => $customerId,
                'doc_type'           => $docType,
                'numbering_range_id' => $num['range']['id'],
                'prefix'             => $num['range']['prefix'],
                'number'             => $num['number'],
                'full_number'        => $num['full_number'],
                'issued_at'          => date('Y-m-d H:i:s'),
                'subtotal'           => $subtotal,
                'discount_total'     => $discountTotal,
                'tax_total'          => $taxTotal,
                'total'              => $total,
                'paid'               => $paid,
                'change_amount'      => $change,
                'notes'              => mb_substr(trim((string) ($data['notes'] ?? '')), 0, 255) ?: null,
            ]);
            foreach ($lines as $l) {
                DB::insert('sale_items', ['sale_id' => $saleId] + $l);
                Inventory::move($l['product_id'], 'venta', -$l['qty'], $l['unit_cost'], $num['full_number'], null, (int) $user['id']);
            }
            foreach ($payments as $p) {
                DB::insert('sale_payments', ['sale_id' => $saleId] + $p);
            }
            return $saleId;
        });

        // La emisión electrónica nunca debe bloquear la venta: si falla queda en "error" y se reintenta.
        try {
            $edoc = ElectronicInvoice::issueForSale($saleId);
        } catch (\Throwable $e) {
            error_log('Error emitiendo documento electrónico venta ' . $saleId . ': ' . $e->getMessage());
            $edoc = ['status' => 'error', 'response' => $e->getMessage()];
        }

        return ['sale_id' => $saleId, 'edoc' => $edoc];
    }
}

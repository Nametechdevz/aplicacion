<?php
namespace App\Services;

use App\Core\DB;
use App\Services\Dian\ElectronicInvoice;
use RuntimeException;

class CreditNoteService
{
    public const REASONS = [
        '1' => 'Devolución parcial de los bienes',
        '2' => 'Anulación de factura electrónica',
        '3' => 'Rebaja o descuento parcial o total',
        '4' => 'Ajuste de precio',
        '5' => 'Otros',
    ];

    /**
     * @param array $qtys [sale_item_id => cantidad a devolver]
     */
    public static function create(int $saleId, array $qtys, string $reasonCode, string $reasonText, string $refundMethod, array $user): array
    {
        if (!isset(self::REASONS[$reasonCode])) {
            throw new RuntimeException('Concepto de nota crédito no válido.');
        }
        if (!array_key_exists($refundMethod, payment_methods())) {
            throw new RuntimeException('Medio de reembolso no válido.');
        }
        $reasonText = trim($reasonText) ?: self::REASONS[$reasonCode];

        $cnId = DB::transaction(function () use ($saleId, $qtys, $reasonCode, $reasonText, $refundMethod, $user) {
            $sale = DB::one('SELECT * FROM sales WHERE id = ? FOR UPDATE', [$saleId]);
            if (!$sale) {
                throw new RuntimeException('Venta no encontrada.');
            }
            if ($sale['status'] === 'anulada') {
                throw new RuntimeException('Esta venta ya fue anulada por completo.');
            }
            $items = DB::all('SELECT * FROM sale_items WHERE sale_id = ? FOR UPDATE', [$saleId]);

            if ($reasonCode === '2') { // anulación: todo lo pendiente
                $qtys = [];
                foreach ($items as $it) {
                    $qtys[$it['id']] = (int) $it['qty'] - (int) $it['returned_qty'];
                }
            }

            $lines = [];
            foreach ($items as $it) {
                $q = (int) ($qtys[$it['id']] ?? 0);
                if ($q <= 0) {
                    continue;
                }
                $available = (int) $it['qty'] - (int) $it['returned_qty'];
                if ($q > $available) {
                    throw new RuntimeException("Solo puedes devolver {$available} unidad(es) de {$it['description']}.");
                }
                // Proporcional al valor efectivamente cobrado (incluye descuentos)
                if ($q === $available && (int) $it['returned_qty'] === 0) {
                    $total = (float) $it['total'];
                } else {
                    $total = round((float) $it['total'] / (int) $it['qty'] * $q, 2);
                }
                $base = round($total / (1 + (float) $it['tax_rate'] / 100), 2);
                $lines[] = [
                    'sale_item_id' => (int) $it['id'],
                    'product_id'   => (int) $it['product_id'],
                    'code'         => $it['code'],
                    'description'  => $it['description'],
                    'qty'          => $q,
                    'unit_price'   => round($total / $q, 2),
                    'tax_rate'     => (float) $it['tax_rate'],
                    'base'         => $base,
                    'tax'          => round($total - $base, 2),
                    'total'        => $total,
                    'unit_cost'    => (float) $it['unit_cost'],
                ];
            }
            if (!$lines) {
                throw new RuntimeException('Selecciona al menos un producto a devolver.');
            }

            $num = Numbering::next('NC');
            $cnId = DB::insert('credit_notes', [
                'sale_id'            => $saleId,
                'user_id'            => $user['id'],
                'numbering_range_id' => $num['range']['id'],
                'prefix'             => $num['range']['prefix'],
                'number'             => $num['number'],
                'full_number'        => $num['full_number'],
                'reason_code'        => $reasonCode,
                'reason_text'        => mb_substr($reasonText, 0, 255),
                'refund_method'      => $refundMethod,
                'subtotal'           => round(array_sum(array_column($lines, 'base')), 2),
                'tax_total'          => round(array_sum(array_column($lines, 'tax')), 2),
                'total'              => round(array_sum(array_column($lines, 'total')), 2),
                'issued_at'          => date('Y-m-d H:i:s'),
            ]);
            foreach ($lines as $l) {
                $cost = $l['unit_cost'];
                unset($l['unit_cost']);
                DB::insert('credit_note_items', ['credit_note_id' => $cnId] + $l);
                DB::run('UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?', [$l['qty'], $l['sale_item_id']]);
                Inventory::move($l['product_id'], 'devolucion', $l['qty'], $cost, $num['full_number'], 'Devolución venta ' . $sale['full_number'], (int) $user['id']);
            }

            $pending = (int) DB::value('SELECT COALESCE(SUM(qty - returned_qty),0) FROM sale_items WHERE sale_id = ?', [$saleId]);
            DB::update('sales', ['status' => $pending === 0 ? 'anulada' : 'devolucion_parcial'], 'id = ?', [$saleId]);

            // Reembolso en efectivo sale de la caja abierta del usuario
            if ($refundMethod === 'efectivo') {
                $session = Cash::openSession((int) $user['id']);
                if (!$session) {
                    throw new RuntimeException('Para reembolsar en efectivo debes tener la caja abierta.');
                }
                DB::insert('cash_movements', [
                    'cash_session_id' => $session['id'],
                    'type'            => 'egreso',
                    'amount'          => round(array_sum(array_column($lines, 'total')), 2),
                    'concept'         => 'Reembolso ' . $num['full_number'] . ' (venta ' . $sale['full_number'] . ')',
                    'user_id'         => $user['id'],
                ]);
            }
            return $cnId;
        });

        try {
            $edoc = ElectronicInvoice::issueForCreditNote($cnId);
        } catch (\Throwable $e) {
            error_log('Error emitiendo nota crédito ' . $cnId . ': ' . $e->getMessage());
            $edoc = ['status' => 'error', 'response' => $e->getMessage()];
        }
        return ['credit_note_id' => $cnId, 'edoc' => $edoc];
    }
}

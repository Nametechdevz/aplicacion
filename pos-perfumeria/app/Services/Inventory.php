<?php
namespace App\Services;

use App\Core\DB;

class Inventory
{
    /**
     * Mueve stock de un producto y registra el kárdex. Llamar dentro de transacción.
     * $qty positivo = entrada, negativo = salida.
     */
    public static function move(int $productId, string $type, int $qty, ?float $unitCost, ?string $reference, ?string $note, int $userId): int
    {
        $p = DB::one('SELECT id, stock, cost FROM products WHERE id = ? FOR UPDATE', [$productId]);
        if (!$p) {
            throw new \RuntimeException('Producto no encontrado (#' . $productId . ')');
        }
        $newStock = (int) $p['stock'] + $qty;
        $data = ['stock' => $newStock];

        // Costo promedio ponderado en compras
        if ($type === 'compra' && $qty > 0 && $unitCost !== null) {
            $oldStock = max(0, (int) $p['stock']);
            $data['cost'] = $oldStock + $qty > 0
                ? round(($oldStock * (float) $p['cost'] + $qty * $unitCost) / ($oldStock + $qty), 2)
                : $unitCost;
        }
        DB::update('products', $data, 'id = ?', [$productId]);
        DB::insert('inventory_movements', [
            'product_id'  => $productId,
            'type'        => $type,
            'qty'         => $qty,
            'stock_after' => $newStock,
            'unit_cost'   => $unitCost ?? (float) $p['cost'],
            'reference'   => $reference,
            'note'        => $note,
            'user_id'     => $userId,
        ]);
        return $newStock;
    }
}

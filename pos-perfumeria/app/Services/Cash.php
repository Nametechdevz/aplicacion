<?php
namespace App\Services;

use App\Core\DB;

class Cash
{
    public static function openSession(int $userId): ?array
    {
        return DB::one("SELECT * FROM cash_sessions WHERE user_id = ? AND status = 'abierta' ORDER BY id DESC LIMIT 1", [$userId]);
    }

    public static function summary(int $sessionId): array
    {
        $s = DB::one('SELECT cs.*, u.name AS user_name FROM cash_sessions cs JOIN users u ON u.id = cs.user_id WHERE cs.id = ?', [$sessionId]);
        $byMethod = DB::all(
            'SELECT sp.method, SUM(sp.amount) AS total, COUNT(DISTINCT sp.sale_id) AS count
               FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
              WHERE s.cash_session_id = ? GROUP BY sp.method ORDER BY total DESC',
            [$sessionId]
        );
        $sales = DB::one(
            'SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total, COALESCE(SUM(change_amount),0) AS change_total,
                    COALESCE(SUM(tax_total),0) AS tax_total, COALESCE(SUM(discount_total),0) AS discount_total
               FROM sales WHERE cash_session_id = ?',
            [$sessionId]
        );
        $cashPayments = 0.0;
        foreach ($byMethod as $m) {
            if ($m['method'] === 'efectivo') {
                $cashPayments = (float) $m['total'];
            }
        }
        $mov = DB::one(
            "SELECT COALESCE(SUM(CASE WHEN type='ingreso' THEN amount END),0) AS ingresos,
                    COALESCE(SUM(CASE WHEN type='egreso' THEN amount END),0) AS egresos
               FROM cash_movements WHERE cash_session_id = ?",
            [$sessionId]
        );
        $movements = DB::all('SELECT cm.*, u.name AS user_name FROM cash_movements cm JOIN users u ON u.id = cm.user_id WHERE cash_session_id = ? ORDER BY cm.id', [$sessionId]);
        $cashSales = $cashPayments - (float) $sales['change_total'];
        $expected = round((float) $s['opening_amount'] + $cashSales + (float) $mov['ingresos'] - (float) $mov['egresos'], 2);

        return [
            'session'    => $s,
            'by_method'  => $byMethod,
            'sales'      => $sales,
            'cash_sales' => $cashSales,
            'ingresos'   => (float) $mov['ingresos'],
            'egresos'    => (float) $mov['egresos'],
            'movements'  => $movements,
            'expected'   => $expected,
        ];
    }
}

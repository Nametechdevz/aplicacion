<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;

/**
 * Consecutivos de documentos sin huecos por concurrencia: la fila de la
 * secuencia se bloquea (FOR UPDATE) dentro de la transacción del documento.
 */
final class Sequence
{
    public static function next(string $key, ?string $defaultPrefix = null, int $pad = 6): string
    {
        $db = Database::connection();
        if (!$db->inTransaction()) {
            throw new \LogicException('Sequence::next debe ejecutarse dentro de una transacción');
        }
        $row = $db->one('SELECT prefix, next_value FROM document_sequences WHERE seq_key = :k FOR UPDATE', ['k' => $key]);
        if (!$row) {
            $db->query(
                'INSERT IGNORE INTO document_sequences (seq_key, prefix, next_value) VALUES (:k, :p, 1)',
                ['k' => $key, 'p' => $defaultPrefix ?? strtoupper($key) . '-']
            );
            $row = $db->one('SELECT prefix, next_value FROM document_sequences WHERE seq_key = :k FOR UPDATE', ['k' => $key]);
        }
        $db->execute('UPDATE document_sequences SET next_value = next_value + 1 WHERE seq_key = :k', ['k' => $key]);
        return $row['prefix'] . str_pad((string) $row['next_value'], $pad, '0', STR_PAD_LEFT);
    }
}

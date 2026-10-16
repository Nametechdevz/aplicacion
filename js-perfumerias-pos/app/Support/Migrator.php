<?php
declare(strict_types=1);

namespace App\Support;

use PDO;

/** Ejecuta los scripts SQL de database/migrations en orden y registra cuáles se aplicaron. */
final class Migrator
{
    public function __construct(private PDO $pdo, private string $dir)
    {
    }

    public function run(callable $out): int
    {
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS migrations (
            migration VARCHAR(190) NOT NULL PRIMARY KEY,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $done = $this->pdo->query('SELECT migration FROM migrations')->fetchAll(PDO::FETCH_COLUMN);
        $files = glob($this->dir . '/*.sql');
        sort($files);
        $count = 0;
        foreach ($files as $file) {
            $name = basename($file);
            if (in_array($name, $done, true)) {
                continue;
            }
            $out("Aplicando {$name}…");
            foreach (self::statements((string) file_get_contents($file)) as $sql) {
                $this->pdo->exec($sql);
            }
            $stmt = $this->pdo->prepare('INSERT INTO migrations (migration) VALUES (?)');
            $stmt->execute([$name]);
            $count++;
        }
        return $count;
    }

    public function dropAll(): void
    {
        $this->pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($this->pdo->query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')->fetchAll(PDO::FETCH_NUM) as $row) {
            $this->pdo->exec('DROP TABLE IF EXISTS `' . str_replace('`', '', $row[0]) . '`');
        }
        $this->pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    /** Divide un script SQL en sentencias (ignora comentarios de línea). */
    public static function statements(string $sql): array
    {
        $lines = array_filter(explode("\n", $sql), static fn ($l) => !preg_match('/^\s*--/', $l));
        $parts = [];
        $buffer = '';
        $inString = false;
        $text = implode("\n", $lines);
        $len = strlen($text);
        for ($i = 0; $i < $len; $i++) {
            $ch = $text[$i];
            if ($ch === "'" && ($i === 0 || $text[$i - 1] !== '\\')) {
                $inString = !$inString;
            }
            if ($ch === ';' && !$inString) {
                if (trim($buffer) !== '') {
                    $parts[] = trim($buffer);
                }
                $buffer = '';
                continue;
            }
            $buffer .= $ch;
        }
        if (trim($buffer) !== '') {
            $parts[] = trim($buffer);
        }
        return $parts;
    }
}

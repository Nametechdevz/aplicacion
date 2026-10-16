<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOStatement;
use Throwable;

/**
 * Acceso a MySQL mediante PDO con consultas preparadas reales (sin emulación).
 * La sesión de base de datos trabaja en UTC; la aplicación convierte al mostrar.
 */
final class Database
{
    private static ?Database $instance = null;
    private PDO $pdo;

    public function __construct(array $config)
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $config['host'],
            (int) $config['port'],
            $config['database']
        );
        $this->pdo = new PDO($dsn, $config['username'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $this->pdo->exec("SET time_zone = '+00:00'");
        $this->pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    }

    public static function connection(): Database
    {
        if (self::$instance === null) {
            self::$instance = new Database(Config::get('database'));
        }
        return self::$instance;
    }

    public static function setConnection(?Database $db): void
    {
        self::$instance = $db;
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    public function query(string $sql, array $params = []): PDOStatement
    {
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $name = is_int($key) ? $key + 1 : (str_starts_with($key, ':') ? $key : ':' . $key);
            $type = match (true) {
                is_int($value) => PDO::PARAM_INT,
                is_bool($value) => PDO::PARAM_INT,
                $value === null => PDO::PARAM_NULL,
                default => PDO::PARAM_STR,
            };
            $stmt->bindValue($name, is_bool($value) ? (int) $value : $value, $type);
        }
        $stmt->execute();
        return $stmt;
    }

    public function all(string $sql, array $params = []): array
    {
        return $this->query($sql, $params)->fetchAll();
    }

    public function one(string $sql, array $params = []): ?array
    {
        $row = $this->query($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public function value(string $sql, array $params = []): mixed
    {
        $value = $this->query($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    public function column(string $sql, array $params = []): array
    {
        return $this->query($sql, $params)->fetchAll(PDO::FETCH_COLUMN);
    }

    public function execute(string $sql, array $params = []): int
    {
        return $this->query($sql, $params)->rowCount();
    }

    /** Inserta una fila y devuelve el id generado. Los nombres de columna vienen del código, nunca del usuario. */
    public function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        foreach ($cols as $c) {
            if (!preg_match('/^[a-z_][a-z0-9_]*$/', $c)) {
                throw new \InvalidArgumentException('Columna inválida');
            }
        }
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(', ', $cols),
            implode(', ', array_map(fn ($c) => ':' . $c, $cols))
        );
        $this->query($sql, $data);
        return (int) $this->pdo->lastInsertId();
    }

    public function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        $sets = [];
        $params = [];
        foreach ($data as $col => $value) {
            if (!preg_match('/^[a-z_][a-z0-9_]*$/', $col)) {
                throw new \InvalidArgumentException('Columna inválida');
            }
            $sets[] = "$col = :set_$col";
            $params["set_$col"] = $value;
        }
        $sql = sprintf('UPDATE %s SET %s WHERE %s', $table, implode(', ', $sets), $where);
        return $this->execute($sql, array_merge($params, $whereParams));
    }

    /**
     * Ejecuta el callback dentro de una transacción. Admite anidación (solo la
     * transacción externa confirma o revierte).
     */
    public function transaction(callable $callback): mixed
    {
        // La transacción externa es la única que confirma o revierte; las
        // llamadas anidadas se integran en ella.
        $outer = !$this->pdo->inTransaction();
        if ($outer) {
            $this->pdo->beginTransaction();
        }
        try {
            $result = $callback($this);
            if ($outer) {
                $this->pdo->commit();
            }
            return $result;
        } catch (Throwable $e) {
            if ($outer && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function inTransaction(): bool
    {
        return $this->pdo->inTransaction();
    }

    /** Genera marcadores :p0, :p1… para cláusulas IN. */
    public static function in(array $values, string $prefix = 'in'): array
    {
        $values = array_values($values);
        if ($values === []) {
            return ['NULL', []];
        }
        $placeholders = [];
        $params = [];
        foreach ($values as $i => $v) {
            $placeholders[] = ":{$prefix}{$i}";
            $params["{$prefix}{$i}"] = $v;
        }
        return [implode(', ', $placeholders), $params];
    }
}

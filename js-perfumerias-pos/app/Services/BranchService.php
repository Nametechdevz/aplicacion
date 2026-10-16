<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Validators\Validator;

final class BranchService
{
    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    public function save(?int $id, array $input): int
    {
        Auth::authorize('branches.manage');
        $data = Validator::make($input, [
            'code' => 'required|regex:/^[A-Z0-9]{2,10}$/',
            'name' => 'required|string|max:120',
            'type' => 'required|in:warehouse,store',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:80',
            'phone' => 'nullable|string|max:40',
            'email' => 'nullable|email|max:160',
            'receipt_footer' => 'nullable|string|max:255',
        ], ['code' => 'el código (2 a 10 letras mayúsculas o números)', 'name' => 'el nombre', 'type' => 'el tipo']);
        if ($this->db->value('SELECT id FROM branches WHERE code = :c' . ($id ? ' AND id <> :id' : ''), $id ? ['c' => $data['code'], 'id' => $id] : ['c' => $data['code']])) {
            throw ValidationException::field('code', 'Ya existe una sucursal con ese código.');
        }
        return $this->db->transaction(function () use ($id, $data) {
            if ($id) {
                $before = $this->db->one('SELECT * FROM branches WHERE id = :id FOR UPDATE', ['id' => $id]);
                if (!$before) {
                    throw HttpException::notFound();
                }
                if ($before['code'] !== $data['code'] && $this->db->value('SELECT id FROM sales WHERE branch_id = :id LIMIT 1', ['id' => $id])) {
                    throw ValidationException::field('code', 'El código no se puede cambiar porque ya numera ventas registradas.');
                }
                $this->db->update('branches', $data, 'id = :id', ['id' => $id]);
                [$old, $new] = Audit::diff($before, $data);
                Audit::log('branch.update', 'branch', $id, "Sucursal modificada: {$data['name']}", $old, $new, $id);
                return $id;
            }
            $newId = $this->db->insert('branches', $data);
            if ($data['type'] === 'store') {
                $this->db->insert('cash_registers', ['branch_id' => $newId, 'code' => 'CAJA1', 'name' => 'Caja 1']);
            }
            Audit::log('branch.create', 'branch', $newId, "Sucursal creada: {$data['name']}", null, $data, $newId);
            return $newId;
        });
    }

    public function toggle(int $id): bool
    {
        Auth::authorize('branches.manage');
        $b = $this->db->one('SELECT * FROM branches WHERE id = :id', ['id' => $id]);
        if (!$b) {
            throw HttpException::notFound();
        }
        $new = (int) $b['is_active'] ? 0 : 1;
        if (!$new && $this->db->value("SELECT id FROM cash_sessions WHERE branch_id = :id AND status = 'open' LIMIT 1", ['id' => $id])) {
            throw new ValidationException('La sucursal tiene cajas abiertas. Ciérrelas antes de desactivarla.');
        }
        $this->db->update('branches', ['is_active' => $new], 'id = :id', ['id' => $id]);
        Audit::log($new ? 'branch.activate' : 'branch.deactivate', 'branch', $id, $b['name'], ['is_active' => $b['is_active']], ['is_active' => $new], $id);
        return (bool) $new;
    }

    public function addRegister(int $branchId, string $name): int
    {
        Auth::authorize('branches.manage');
        $name = trim($name);
        if (mb_strlen($name) < 2) {
            throw new ValidationException('Indique el nombre de la caja.');
        }
        $n = (int) $this->db->value('SELECT COUNT(*) FROM cash_registers WHERE branch_id = :b', ['b' => $branchId]) + 1;
        $id = $this->db->insert('cash_registers', ['branch_id' => $branchId, 'code' => 'CAJA' . $n, 'name' => mb_substr($name, 0, 60)]);
        Audit::log('register.create', 'cash_register', $id, "Caja creada: $name", null, null, $branchId);
        return $id;
    }
}

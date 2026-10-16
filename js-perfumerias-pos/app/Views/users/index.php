<?php
use App\Core\View;
$roleTone = ['superadmin' => 'badge-dark', 'branch_admin' => 'badge-gold', 'cashier' => 'badge-neutral'];
$roleDesc = [
  'superadmin' => 'Control total: sucursales, catálogo, precios, inventario central, reportes y auditoría.',
  'branch_admin' => 'Gestiona sus sucursales: equipo, ventas, cierres, clientes y autorizaciones.',
  'cashier' => 'Vende desde el POS, opera su caja y registra clientes dentro de sus límites.',
];
?>
<div class="page-head">
  <div><div class="eyebrow">Administración</div><h1>Usuarios y roles</h1><p>Control de acceso por rol, permiso explícito y sucursal. Toda autorización se valida en el servidor.</p></div>
  <div class="page-actions"><a class="btn btn-primary" href="<?= e(url('/users/create')) ?>"><?= icon('user-plus') ?> Nuevo usuario</a></div>
</div>

<div class="grid grid-3 mb-3">
  <?php foreach ($roles as $r): ?>
    <a class="panel" href="<?= e(url('/users', ['role' => $r['code']])) ?>" style="display:block;transition:border-color .18s<?= $filters['role'] === $r['code'] ? ';border-color:var(--gold)' : '' ?>">
      <div class="panel-body">
        <div class="row-between"><span class="badge <?= $roleTone[$r['code']] ?? 'badge-neutral' ?> no-dot"><?= e($r['name']) ?></span><strong style="font-size:22px"><?= (int) $r['n'] ?></strong></div>
        <p class="muted mt-2" style="font-size:13px"><?= e($roleDesc[$r['code']] ?? $r['description']) ?></p>
        <p class="mt-2" style="font-size:12px;color:var(--text-2)">Descuento máximo del rol: <strong><?= e(pct($roleLimits[$r['id']] ?? 0, 0)) ?></strong></p>
      </div>
    </a>
  <?php endforeach; ?>
</div>

<section class="panel">
  <form class="toolbar" method="get" data-autosubmit>
    <div class="input-group grow"><?= icon('search') ?><input class="input" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Nombre, usuario o correo" aria-label="Buscar usuarios"></div>
    <select class="select" name="role" aria-label="Rol"><option value="">Todos los roles</option><?php foreach ($roles as $r): ?><option value="<?= e($r['code']) ?>" <?= $filters['role'] === $r['code'] ? 'selected' : '' ?>><?= e($r['name']) ?></option><?php endforeach; ?></select>
    <select class="select" name="branch" aria-label="Sucursal"><option value="">Todas las sucursales</option><?php foreach ($branches as $b): ?><option value="<?= (int) $b['id'] ?>" <?= (int) $filters['branch'] === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select>
    <select class="select" name="status" aria-label="Estado"><option value="">Todos</option><option value="active" <?= $filters['status'] === 'active' ? 'selected' : '' ?>>Activos</option><option value="inactive" <?= $filters['status'] === 'inactive' ? 'selected' : '' ?>>Inactivos</option></select>
  </form>
  <?php if (!$users): ?><?= View::partial('partials/empty', ['title' => 'Sin usuarios', 'text' => 'No hay usuarios con esos filtros.']) ?><?php else: ?>
  <div class="table-wrap">
    <table class="table table-stack">
      <thead><tr><th>Usuario</th><th>Rol</th><th>Sucursales</th><th class="num">Desc. máx.</th><th class="num">Ventas del mes</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($users as $u): $codes = explode(',', (string) $u['role_codes']); ?>
          <tr>
            <td class="cell-main"><div class="row" style="gap:12px"><span class="avatar"><?= e(initials($u['name'])) ?></span>
              <div><strong><?= e($u['name']) ?></strong><div class="muted" style="font-size:12px">@<?= e($u['username']) ?><?= $u['email'] ? ' · ' . e($u['email']) : '' ?></div></div></div></td>
            <td data-label="Rol"><?php foreach ($codes as $c): if ($c === '') { continue; } ?><span class="badge <?= $roleTone[$c] ?? 'badge-neutral' ?> no-dot" style="margin:2px 2px 2px 0"><?= e(['superadmin' => 'Superadmin', 'branch_admin' => 'Admin. sucursal', 'cashier' => 'Cajero'][$c] ?? $c) ?></span><?php endforeach; ?>
              <?php if ((int) $u['overrides']): ?><span class="pill" title="Permisos individuales">+<?= (int) $u['overrides'] ?> permisos</span><?php endif; ?></td>
            <td data-label="Sucursales"><span class="truncate" style="display:inline-block;max-width:220px"><?= e($u['branches'] ?: (in_array('superadmin', $codes, true) ? 'Todas' : '—')) ?></span></td>
            <td class="num" data-label="Desc. máx."><?= $u['own_limit'] !== null ? e(pct($u['own_limit'], 0)) . ' <span class="muted" style="font-size:11px">propio</span>' : '<span class="muted">Según rol</span>' ?></td>
            <td class="num" data-label="Ventas del mes"><?= (float) $u['month_sales'] > 0 ? e(money($u['month_sales'])) : '<span class="faint">—</span>' ?></td>
            <td data-label="Último acceso"><?= e($u['last_login_at'] ? time_ago($u['last_login_at']) : 'Nunca') ?></td>
            <td data-label="Estado"><?= status_badge((int) $u['is_active'] ? 'active' : 'inactive') ?></td>
            <td class="actions">
              <a class="btn btn-ghost btn-sm btn-icon" href="<?= e(url('/users/' . $u['id'] . '/edit')) ?>" title="Editar" aria-label="Editar <?= e($u['name']) ?>"><?= icon('edit', 'icon-sm') ?></a>
              <?php if ((int) $u['id'] !== \App\Core\Auth::id()): ?>
              <form method="post" action="<?= e(url('/users/' . $u['id'] . '/toggle')) ?>" style="display:inline" data-confirm="<?= (int) $u['is_active'] ? '¿Desactivar a ' . e($u['name']) . '?' : '¿Activar a ' . e($u['name']) . '?' ?>" data-confirm-text="<?= (int) $u['is_active'] ? 'No podrá iniciar sesión. Su historial se conserva.' : 'Podrá iniciar sesión nuevamente.' ?>" <?= (int) $u['is_active'] ? 'data-danger' : '' ?>>
                <?= csrf_field() ?><button class="btn btn-ghost btn-sm btn-icon <?= (int) $u['is_active'] ? 'btn-danger-ghost' : '' ?>" type="submit" title="<?= (int) $u['is_active'] ? 'Desactivar' : 'Activar' ?>" aria-label="<?= (int) $u['is_active'] ? 'Desactivar' : 'Activar' ?>"><?= icon('power', 'icon-sm') ?></button>
              </form>
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
</section>

<?php
$stores = array_filter($branches, fn ($b) => $b['type'] === 'store');
$totalToday = array_sum(array_map(fn ($b) => (float) $b['today'], $stores));
$totalMonth = array_sum(array_map(fn ($b) => (float) $b['month'], $stores));
?>
<div class="page-head">
  <div><div class="eyebrow">Administración</div><h1>Sucursales</h1><p>Puntos de venta y almacén central. Cada sucursal tiene sus propios accesos: sus usuarios solo ven la información de su sede, y usted puede auditarla por separado.</p></div>
  <div class="page-actions"><button class="btn btn-primary" type="button" data-open="branch-new"><?= icon('plus') ?> Nueva sucursal</button></div>
</div>

<section class="panel mb-3">
  <div class="kpi-strip">
    <div class="kpi is-hero"><div class="kpi-label"><?= icon('store') ?>Puntos de venta activos</div><div class="kpi-value"><?= count(array_filter($stores, fn ($b) => (int) $b['is_active'])) ?></div><div class="kpi-foot"><?= count($branches) - count($stores) ?> almacén(es)</div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('receipt') ?>Ventas de hoy</div><div class="kpi-value"><?= e(money((string) $totalToday)) ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('calendar') ?>Ventas del mes</div><div class="kpi-value"><?= e(money((string) $totalMonth)) ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('wallet') ?>Cajas abiertas</div><div class="kpi-value"><?= array_sum(array_map(fn ($b) => (int) $b['open_sessions'], $branches)) ?></div></div>
  </div>
</section>

<section class="panel">
  <div class="table-wrap">
    <table class="table table-stack">
      <thead><tr><th>Sucursal</th><th>Ubicación</th><th class="num">Equipo</th><th>Cajas</th><th class="num">Ventas mes</th><th class="num">Inventario</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($branches as $b): ?>
          <tr>
            <td class="cell-main">
              <div class="row" style="gap:12px">
                <span class="avatar" style="<?= $b['type'] === 'warehouse' ? 'background:var(--gold-soft);color:var(--gold-strong)' : '' ?>"><?= icon($b['type'] === 'warehouse' ? 'boxes' : 'store', 'icon-sm') ?></span>
                <div><strong><?= e($b['name']) ?></strong><div class="muted" style="font-size:12px"><span class="pill"><?= e($b['code']) ?></span> <?= $b['type'] === 'warehouse' ? 'Almacén central' : 'Punto de venta' ?></div></div>
              </div>
            </td>
            <td data-label="Ubicación"><?= e($b['address'] ?: '—') ?><div class="muted" style="font-size:12px"><?= e(trim(($b['city'] ?? '') . ($b['phone'] ? ' · ' . $b['phone'] : ''), ' ·')) ?></div></td>
            <td class="num" data-label="Equipo"><?php if ((int) $b['users']): ?><a class="link" href="<?= e(url('/users', ['branch' => $b['id']])) ?>"><?= (int) $b['users'] ?> <?= (int) $b['users'] === 1 ? 'usuario' : 'usuarios' ?></a><?php else: ?><a class="btn btn-sm" href="<?= e(url('/users/create', ['branch' => $b['id']])) ?>"><?= icon('user-plus', 'icon-sm') ?> Crear acceso</a><?php endif; ?></td>
            <td data-label="Cajas">
              <?php foreach ($registers[(int) $b['id']] ?? [] as $r): ?><span class="pill" style="margin:2px"><?= e($r['name']) ?></span><?php endforeach; ?>
              <?php if ((int) $b['open_sessions']): ?><span class="badge badge-success"><?= (int) $b['open_sessions'] ?> abierta(s)</span><?php endif; ?>
              <?php if ($b['type'] === 'store'): ?><button class="link-btn" type="button" data-open="register-<?= (int) $b['id'] ?>" style="display:block;margin-top:4px"><?= icon('plus', 'icon-sm') ?> Caja</button><?php endif; ?>
            </td>
            <td class="num" data-label="Ventas mes"><?php if ($b['type'] === 'store'): ?><strong><?= e(money($b['month'])) ?></strong><div class="muted" style="font-size:12px">hoy <?= e(money($b['today'])) ?></div><?php else: ?>—<?php endif; ?></td>
            <td class="num" data-label="Inventario"><?= e(money($b['stock_value'])) ?><?php if ((int) $b['low']): ?><div class="text-warning" style="font-size:12px"><?= (int) $b['low'] ?> bajo mínimo</div><?php endif; ?></td>
            <td data-label="Estado"><?= status_badge((int) $b['is_active'] ? 'active' : 'inactive') ?></td>
            <td class="actions nowrap">
              <button class="btn btn-ghost btn-sm btn-icon" type="button" data-open="branch-<?= (int) $b['id'] ?>" title="Editar" aria-label="Editar <?= e($b['name']) ?>"><?= icon('edit', 'icon-sm') ?></button>
              <a class="btn btn-ghost btn-sm btn-icon" href="<?= e(url('/users/create', ['branch' => $b['id']])) ?>" title="Crear acceso para esta sucursal" aria-label="Crear acceso"><?= icon('user-plus', 'icon-sm') ?></a>
              <?php if (can('audit.view')): ?><a class="btn btn-ghost btn-sm btn-icon" href="<?= e(url('/audit', ['branch' => $b['id']])) ?>" title="Auditoría de la sucursal" aria-label="Auditoría"><?= icon('shield', 'icon-sm') ?></a><?php endif; ?>
              <form method="post" action="<?= e(url('/branches/' . $b['id'] . '/toggle')) ?>" style="display:inline" data-confirm="<?= (int) $b['is_active'] ? '¿Desactivar ' . e($b['name']) . '?' : '¿Activar ' . e($b['name']) . '?' ?>" data-confirm-text="<?= (int) $b['is_active'] ? 'No podrá vender ni recibir transferencias mientras esté inactiva. Su historial se conserva.' : 'Volverá a operar normalmente.' ?>" <?= (int) $b['is_active'] ? 'data-danger' : '' ?>>
                <?= csrf_field() ?><button type="submit" class="btn btn-ghost btn-sm btn-icon <?= (int) $b['is_active'] ? 'btn-danger-ghost' : '' ?>" title="<?= (int) $b['is_active'] ? 'Desactivar' : 'Activar' ?>" aria-label="<?= (int) $b['is_active'] ? 'Desactivar' : 'Activar' ?>"><?= icon('power', 'icon-sm') ?></button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>

<?php foreach (array_merge([null], $branches) as $b): $id = $b ? 'branch-' . $b['id'] : 'branch-new'; ?>
<dialog class="modal" id="<?= e($id) ?>" aria-labelledby="<?= e($id) ?>-t">
  <form class="modal-card" method="post" action="<?= e(url($b ? '/branches/' . $b['id'] : '/branches')) ?>" data-ajax>
    <?= csrf_field() ?>
    <div class="modal-head"><div><h2 id="<?= e($id) ?>-t"><?= $b ? 'Editar sucursal' : 'Nueva sucursal' ?></h2><p><?= $b ? e($b['name']) : 'Los puntos de venta incluyen una caja inicial.' ?></p></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body form-grid">
      <div class="field col-8"><label>Nombre<span class="req">*</span></label><input class="input" name="name" required maxlength="120" value="<?= e($b['name'] ?? '') ?>"></div>
      <div class="field col-4"><label>Código<span class="req">*</span></label><input class="input" name="code" required maxlength="10" pattern="[A-Z0-9]{2,10}" value="<?= e($b['code'] ?? '') ?>" placeholder="S04" style="text-transform:uppercase"></div>
      <div class="field col-12"><span class="label">Tipo</span><div class="segmented">
        <label><input type="radio" name="type" value="store" <?= ($b['type'] ?? 'store') === 'store' ? 'checked' : '' ?>><span>Punto de venta</span></label>
        <label><input type="radio" name="type" value="warehouse" <?= ($b['type'] ?? '') === 'warehouse' ? 'checked' : '' ?>><span>Almacén</span></label></div></div>
      <div class="field col-8"><label>Dirección</label><input class="input" name="address" maxlength="255" value="<?= e($b['address'] ?? '') ?>"></div>
      <div class="field col-4"><label>Ciudad</label><input class="input" name="city" maxlength="80" value="<?= e($b['city'] ?? '') ?>"></div>
      <div class="field col-6"><label>Teléfono</label><input class="input" name="phone" maxlength="40" value="<?= e($b['phone'] ?? '') ?>"></div>
      <div class="field col-6"><label>Correo</label><input class="input" type="email" name="email" maxlength="160" value="<?= e($b['email'] ?? '') ?>"></div>
      <div class="field col-12"><label>Pie del comprobante</label><input class="input" name="receipt_footer" maxlength="255" value="<?= e($b['receipt_footer'] ?? '') ?>" placeholder="Políticas de cambio, horarios…"></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
  </form>
</dialog>
<?php if ($b && $b['type'] === 'store'): ?>
<dialog class="modal modal-sm" id="register-<?= (int) $b['id'] ?>">
  <form class="modal-card" method="post" action="<?= e(url('/branches/' . $b['id'] . '/registers')) ?>" data-ajax>
    <?= csrf_field() ?>
    <div class="modal-head"><div><h2>Agregar caja</h2><p><?= e($b['name']) ?></p></div></div>
    <div class="modal-body"><div class="field"><label>Nombre de la caja</label><input class="input" name="name" required maxlength="60" placeholder="Caja 2"></div></div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Agregar</button></div>
  </form>
</dialog>
<?php endif; ?>
<?php endforeach; ?>

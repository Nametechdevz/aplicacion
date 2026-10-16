<?php use App\Core\View;
$modules = ['auth' => 'Sesiones', 'sale' => 'Ventas', 'discount' => 'Descuentos', 'return' => 'Devoluciones', 'cash' => 'Caja', 'inventory' => 'Inventario', 'transfer' => 'Transferencias', 'purchase' => 'Compras', 'product' => 'Productos', 'user' => 'Usuarios', 'branch' => 'Sucursales', 'settings' => 'Configuración', 'customer' => 'Clientes'];
$tone = static function (string $a): string {
    return match (true) {
        str_contains($a, 'void') || str_contains($a, 'reject') || str_contains($a, 'failed') || str_contains($a, 'deactivate') || str_contains($a, 'waste') => 'danger',
        str_contains($a, 'price') || str_contains($a, 'permissions') || str_contains($a, 'discount') || str_contains($a, 'adjust') || str_contains($a, 'settings') => 'warning',
        default => 'neutral',
    };
}; ?>
<div class="page-head">
  <div><div class="eyebrow">Administración</div><h1>Auditoría</h1><p>Registro inalterable de operaciones sensibles con valores anteriores y posteriores. Solo lectura.</p></div>
</div>
<section class="panel">
  <form class="toolbar" method="get" data-autosubmit>
    <div class="input-group grow"><?= icon('search') ?><input class="input" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Buscar en la descripción" aria-label="Buscar"></div>
    <select class="select" name="module" aria-label="Módulo"><option value="">Todos los módulos</option><?php foreach ($modules as $k => $l): ?><option value="<?= $k ?>" <?= $filters['module'] === $k ? 'selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select>
    <select class="select" name="user" aria-label="Usuario"><option value="">Todos los usuarios</option><?php foreach ($users as $u): ?><option value="<?= (int) $u['id'] ?>" <?= (int) $filters['user'] === (int) $u['id'] ? 'selected' : '' ?>><?= e($u['name']) ?></option><?php endforeach; ?></select>
    <input class="input" type="date" name="from" value="<?= e($filters['from']) ?>" aria-label="Desde" style="width:150px"><input class="input" type="date" name="to" value="<?= e($filters['to']) ?>" aria-label="Hasta" style="width:150px">
    <button class="btn" type="submit">Aplicar</button>
  </form>
  <?php if (!$rows): ?><?= View::partial('partials/empty', ['title' => 'Sin eventos', 'text' => 'No hay eventos de auditoría con esos filtros.']) ?><?php else: ?>
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>Cambios</th><th>Origen</th></tr></thead>
    <tbody><?php foreach ($rows as $a): $old = $a['old_values'] ? json_decode($a['old_values'], true) : null; $new = $a['new_values'] ? json_decode($a['new_values'], true) : null; ?>
      <tr>
        <td data-label="Fecha" class="nowrap"><?= e(fmt_dt($a['created_at'], 'd/m/Y H:i:s')) ?></td>
        <td data-label="Usuario"><?= e($a['user_name'] ?? 'Sistema') ?><div class="muted" style="font-size:12px"><?= e($a['branch_name'] ?? '') ?></div></td>
        <td data-label="Acción"><span class="badge badge-<?= $tone($a['action']) ?> no-dot"><?= e($a['action']) ?></span></td>
        <td class="cell-main" style="max-width:360px"><?= e($a['description'] ?? '') ?><?= $a['entity_type'] ? '<div class="muted" style="font-size:11.5px">' . e($a['entity_type']) . ' #' . (int) $a['entity_id'] . '</div>' : '' ?></td>
        <td data-label="Cambios" style="font-size:12px;max-width:280px">
          <?php if (is_array($new)): foreach (array_slice($new, 0, 4, true) as $k => $v): ?>
            <div><span class="muted"><?= e($k) ?>:</span> <?php if (is_array($old) && array_key_exists($k, $old)): ?><s class="faint"><?= e(is_scalar($old[$k]) ? $old[$k] : json_encode($old[$k], JSON_UNESCAPED_UNICODE)) ?></s> → <?php endif; ?><?= e(is_scalar($v) || $v === null ? (string) $v : json_encode($v, JSON_UNESCAPED_UNICODE)) ?></div>
          <?php endforeach; else: ?><span class="faint">—</span><?php endif; ?>
        </td>
        <td data-label="Origen" class="muted" style="font-size:12px"><?= e($a['ip_address'] ?? '—') ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

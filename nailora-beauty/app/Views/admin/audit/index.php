<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Auditoría', 'subtitle' => 'Acciones administrativas relevantes. Registro de solo lectura.']) ?>
<form method="get" action="<?= e(url('admin/auditoria')) ?>" class="filter-bar">
  <div class="filter-bar__search"><label for="q" class="visually-hidden">Buscar</label><input id="q" type="search" name="q" value="<?= e($q) ?>" placeholder="Acción (order.status, product…), entidad o usuario"></div>
  <button class="btn btn--ghost" type="submit">Buscar</button>
</form>
<?php if ($rows): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>IP</th></tr></thead>
      <tbody>
      <?php foreach ($rows as $a): ?>
        <tr>
          <td data-label="Fecha"><?= e(date_es($a['created_at'], true)) ?></td>
          <td data-label="Usuario"><?= e($a['user_name'] ?? 'Sistema') ?></td>
          <td data-label="Acción"><code><?= e($a['action']) ?></code></td>
          <td data-label="Entidad"><?= e($a['entity_type'] ?? '—') ?><?= $a['entity_id'] ? ' #' . (int) $a['entity_id'] : '' ?></td>
          <td data-label="Detalle" class="cell-wrap small"><?= e(str_limit($a['details'] ?? '', 160)) ?></td>
          <td data-label="IP" class="small"><?= e($a['ip_address']) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?= View::partial('components/pagination', ['pager' => $pager, 'path' => 'admin/auditoria', 'query' => $query]) ?>
<?php else: ?>
  <div class="admin-empty"><?= icon('history', '', 32) ?><p>Sin registros.</p></div>
<?php endif; ?>

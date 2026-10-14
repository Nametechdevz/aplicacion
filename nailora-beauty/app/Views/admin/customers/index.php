<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Clientes', 'subtitle' => 'Se crean automáticamente con cada pedido. Un mismo número de celular se agrupa en un solo cliente.']) ?>
<form method="get" action="<?= e(url('admin/clientes')) ?>" class="filter-bar">
  <div class="filter-bar__search"><label for="q" class="visually-hidden">Buscar</label><input id="q" type="search" name="q" value="<?= e($q) ?>" placeholder="Nombre, teléfono o correo"></div>
  <button class="btn btn--ghost" type="submit"><?= icon('search', '', 16) ?> Buscar</button>
</form>
<?php if ($customers): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Cliente</th><th>Contacto</th><th>Ciudad</th><th class="num">Pedidos</th><th>Último pedido</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>
      <?php foreach ($customers as $c): ?>
        <tr>
          <td data-label="Cliente"><a class="strong" href="<?= e(url('admin/clientes/' . $c['id'])) ?>"><?= e($c['full_name']) ?></a></td>
          <td data-label="Contacto"><?= e(format_phone($c['phone'])) ?><?= $c['email'] ? '<br><span class="muted small">' . e($c['email']) . '</span>' : '' ?></td>
          <td data-label="Ciudad"><?= e($c['city'] ?? '—') ?></td>
          <td data-label="Pedidos" class="num"><?= (int) $c['orders_count'] ?></td>
          <td data-label="Último pedido"><?= e(date_es($c['last_order_at'])) ?></td>
          <td class="actions"><a class="btn btn--ghost btn--xs" href="<?= e(url('admin/clientes/' . $c['id'])) ?>">Ver</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?= View::partial('components/pagination', ['pager' => $pager, 'path' => 'admin/clientes', 'query' => $query]) ?>
<?php else: ?>
  <div class="admin-empty"><?= icon('users', '', 32) ?><p><?= $q ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes registrados.' ?></p></div>
<?php endif; ?>

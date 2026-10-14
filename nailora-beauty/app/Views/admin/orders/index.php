<?php
use App\Core\View;
use App\Models\Order;
?>
<?= View::partial('admin/_header', ['title' => 'Pedidos', 'subtitle' => 'Un pedido registrado queda “Pendiente de confirmación” hasta que lo confirme manualmente tras hablar con el cliente.', 'actions' => '<a class="btn btn--ghost btn--sm" href="' . e(url('admin/informes/exportar?' . http_build_query($query))) . '">' . icon('download', '', 16) . ' Exportar CSV</a>']) ?>

<nav class="status-tabs" aria-label="Filtrar por estado">
  <a href="<?= e(url('admin/pedidos?' . http_build_query(array_diff_key($query, ['estado' => 1, 'pagina' => 1])))) ?>" class="status-tabs__link<?= $filters['status'] === '' ? ' is-active' : '' ?>">Todos <span><?= array_sum($counts) ?></span></a>
  <?php foreach (Order::STATUSES as $key => $label): ?>
    <a href="<?= e(url('admin/pedidos?' . http_build_query(['estado' => $key] + array_diff_key($query, ['estado' => 1])))) ?>" class="status-tabs__link<?= $filters['status'] === $key ? ' is-active' : '' ?>"><?= e($label) ?> <span><?= (int) $counts[$key] ?></span></a>
  <?php endforeach; ?>
</nav>

<form method="get" action="<?= e(url('admin/pedidos')) ?>" class="filter-bar">
  <?php if ($filters['status']): ?><input type="hidden" name="estado" value="<?= e($filters['status']) ?>"><?php endif; ?>
  <div class="filter-bar__search"><label for="q" class="visually-hidden">Buscar</label><input id="q" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Código NB-…, nombre o teléfono"></div>
  <label class="filter-bar__date">Desde <input type="date" name="desde" value="<?= e($filters['from']) ?>"></label>
  <label class="filter-bar__date">Hasta <input type="date" name="hasta" value="<?= e($filters['to']) ?>"></label>
  <button type="submit" class="btn btn--ghost"><?= icon('search', '', 16) ?> Buscar</button>
  <?php if ($query): ?><a href="<?= e(url('admin/pedidos')) ?>" class="btn btn--ghost">Limpiar</a><?php endif; ?>
</form>

<?php if ($orders): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Destino</th><th>Fecha</th><th>Estado</th><th class="num">Total</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>
      <?php foreach ($orders as $o): ?>
        <tr>
          <td data-label="Pedido"><a class="strong" href="<?= e(url('admin/pedidos/' . $o['id'])) ?>"><?= e($o['code']) ?></a><br><span class="muted small"><?= (int) $o['units'] ?> und.<?= $o['whatsapp_opened_at'] ? ' · WhatsApp abierto' : '' ?></span></td>
          <td data-label="Cliente"><?= e($o['customer_name']) ?><br><span class="muted small"><?= e(format_phone($o['customer_phone'])) ?></span></td>
          <td data-label="Destino"><?= e($o['city']) ?><br><span class="muted small"><?= e($o['department']) ?></span></td>
          <td data-label="Fecha"><?= e(date_es($o['created_at'], true)) ?></td>
          <td data-label="Estado"><span class="status-pill status-pill--<?= e($o['status']) ?>"><?= e(order_status_label($o['status'])) ?></span><?php if ($o['payment_status'] === 'paid'): ?><br><span class="badge badge--success">Pagado</span><?php endif; ?></td>
          <td data-label="Total" class="num"><?= money($o['total']) ?><?php if ($o['shipping_cost'] === null): ?><br><span class="muted small">+ envío</span><?php endif; ?></td>
          <td class="actions"><a class="btn btn--ghost btn--xs" href="<?= e(url('admin/pedidos/' . $o['id'])) ?>"><?= icon('eye', '', 14) ?> Ver</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?= View::partial('components/pagination', ['pager' => $pager, 'path' => 'admin/pedidos', 'query' => $query]) ?>
<?php else: ?>
  <div class="admin-empty"><?= icon('clipboard', '', 32) ?><h2>No hay pedidos</h2><p><?= $query ? 'Ningún pedido coincide con los filtros.' : 'Los pedidos registrados desde la tienda aparecerán aquí.' ?></p></div>
<?php endif; ?>

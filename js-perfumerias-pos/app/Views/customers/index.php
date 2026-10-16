<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Comercial</div><h1>Clientes</h1><p>Historial de compras y preferencias. Los datos personales solo son visibles para usuarios autorizados.</p></div>
  <div class="page-actions">
    <?php if (can('customers.manage')): ?><button class="btn btn-primary" type="button" data-open="customer-new"><?= icon('user-plus') ?> Nuevo cliente</button><?php endif; ?>
  </div>
</div>
<section class="panel">
  <form class="toolbar" method="get">
    <div class="input-group grow"><?= icon('search') ?><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="Nombre, documento, teléfono o correo" aria-label="Buscar clientes"></div>
    <button class="btn" type="submit">Buscar</button>
  </form>
  <?php if (!$rows): ?>
    <?= View::partial('partials/empty', ['title' => $q ? 'Sin coincidencias' : 'Aún no hay clientes', 'text' => $q ? 'Pruebe con otro dato de búsqueda.' : 'Los clientes se pueden registrar aquí o directamente desde el punto de venta.']) ?>
  <?php else: ?>
  <div class="table-wrap">
    <table class="table table-stack">
      <thead><tr><th>Cliente</th><th>Documento</th><th>Contacto</th><th class="num">Compras</th><th class="num">Total comprado</th><th>Última compra</th></tr></thead>
      <tbody>
        <?php foreach ($rows as $c): ?>
          <tr class="is-clickable" data-href="<?= e(url('/customers/' . $c['id'])) ?>">
            <td class="cell-main"><div class="row"><span class="avatar"><?= e(initials($c['full_name'])) ?></span><div><strong><?= e($c['full_name']) ?></strong><div class="muted" style="font-size:12px">Desde <?= e(fmt_date($c['created_at'])) ?><?= $c['branch_name'] ? ' · ' . e($c['branch_name']) : '' ?></div></div></div></td>
            <td data-label="Documento"><?= e(trim(($c['document_type'] ?? '') . ' ' . ($c['document_number'] ?? '')) ?: '—') ?></td>
            <td data-label="Contacto"><?= e($c['phone'] ?: '—') ?><div class="muted" style="font-size:12px"><?= e($c['email'] ?? '') ?></div></td>
            <td class="num" data-label="Compras"><?= (int) $c['purchases'] ?></td>
            <td class="num" data-label="Total comprado"><strong><?= e(money($c['total'])) ?></strong></td>
            <td data-label="Última compra"><?= e($c['last_purchase'] ? time_ago($c['last_purchase']) : '—') ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>
<?= View::partial('customers/form-modal', ['id' => 'customer-new', 'c' => null]) ?>

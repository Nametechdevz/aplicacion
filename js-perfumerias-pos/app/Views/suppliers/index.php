<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Compras</div><h1>Proveedores</h1><p>Datos de contacto e historial de compras recibidas.</p></div>
  <div class="page-actions"><button class="btn btn-primary" type="button" data-open="sup-new"><?= icon('plus') ?> Nuevo proveedor</button></div>
</div>
<section class="panel">
  <form class="toolbar" method="get"><div class="input-group grow"><?= icon('search') ?><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="Nombre, NIT o contacto" aria-label="Buscar proveedores"></div><button class="btn" type="submit">Buscar</button></form>
  <?php if (!$rows): ?><?= View::partial('partials/empty', ['title' => 'Sin proveedores', 'text' => 'Registre los proveedores para crear órdenes de compra.']) ?><?php else: ?>
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Proveedor</th><th>Contacto</th><th class="num">Órdenes</th><th class="num">Total recibido</th><th>Última orden</th><th>Estado</th><th></th></tr></thead>
    <tbody><?php foreach ($rows as $s): ?>
      <tr>
        <td class="cell-main"><div class="row" style="gap:12px"><span class="avatar"><?= icon('building', 'icon-sm') ?></span><div><strong><?= e($s['name']) ?></strong><div class="muted" style="font-size:12px"><?= $s['tax_id'] ? 'NIT ' . e($s['tax_id']) : 'Sin NIT' ?></div></div></div></td>
        <td data-label="Contacto"><?= e($s['contact_name'] ?: '—') ?><div class="muted" style="font-size:12px"><?= e(trim(($s['phone'] ?? '') . ' ' . ($s['email'] ?? ''))) ?></div></td>
        <td class="num" data-label="Órdenes"><?= (int) $s['orders'] ?></td>
        <td class="num" data-label="Recibido"><?= e(money($s['received'])) ?></td>
        <td data-label="Última orden"><?= $s['last_order'] ? e(date('d/m/Y', strtotime($s['last_order']))) : '—' ?></td>
        <td data-label="Estado"><?= status_badge((int) $s['is_active'] ? 'active' : 'inactive') ?></td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm btn-icon" type="button" data-open="sup-<?= (int) $s['id'] ?>" aria-label="Editar"><?= icon('edit', 'icon-sm') ?></button>
          <form method="post" action="<?= e(url('/suppliers/' . $s['id'] . '/toggle')) ?>" style="display:inline"><?= csrf_field() ?><button class="btn btn-ghost btn-sm btn-icon" type="submit" title="<?= (int) $s['is_active'] ? 'Desactivar' : 'Activar' ?>" aria-label="Cambiar estado"><?= icon('power', 'icon-sm') ?></button></form>
        </td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
</section>
<?php foreach (array_merge([null], $rows) as $s): $id = $s ? 'sup-' . $s['id'] : 'sup-new'; ?>
<dialog class="modal" id="<?= e($id) ?>">
  <form class="modal-card" method="post" action="<?= e(url($s ? '/suppliers/' . $s['id'] : '/suppliers')) ?>" data-ajax>
    <?= csrf_field() ?>
    <div class="modal-head"><div><h2><?= $s ? 'Editar proveedor' : 'Nuevo proveedor' ?></h2></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body form-grid">
      <div class="field col-8"><label>Nombre o razón social<span class="req">*</span></label><input class="input" name="name" required maxlength="160" value="<?= e($s['name'] ?? '') ?>"></div>
      <div class="field col-4"><label>NIT</label><input class="input" name="tax_id" maxlength="40" value="<?= e($s['tax_id'] ?? '') ?>"></div>
      <div class="field col-6"><label>Contacto</label><input class="input" name="contact_name" maxlength="120" value="<?= e($s['contact_name'] ?? '') ?>"></div>
      <div class="field col-6"><label>Teléfono</label><input class="input" name="phone" maxlength="40" value="<?= e($s['phone'] ?? '') ?>"></div>
      <div class="field col-6"><label>Correo</label><input class="input" type="email" name="email" maxlength="160" value="<?= e($s['email'] ?? '') ?>"></div>
      <div class="field col-6"><label>Dirección</label><input class="input" name="address" maxlength="255" value="<?= e($s['address'] ?? '') ?>"></div>
      <div class="field col-12"><label>Observaciones</label><textarea class="textarea" name="notes" rows="2" maxlength="1000"><?= e($s['notes'] ?? '') ?></textarea></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
  </form>
</dialog>
<?php endforeach; ?>

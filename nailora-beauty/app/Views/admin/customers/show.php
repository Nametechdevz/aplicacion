<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => $customer['full_name'], 'subtitle' => 'Cliente desde ' . date_es($customer['created_at']), 'actions' => $whatsapp ? '<a class="btn btn--whatsapp btn--sm" href="' . e($whatsapp) . '" target="_blank" rel="noopener">' . icon('chat', '', 16) . ' WhatsApp</a>' : '']) ?>
<div class="stat-grid stat-grid--3">
  <article class="stat"><p class="stat__label">Pedidos</p><p class="stat__value"><?= (int) $customer['orders_count'] ?></p></article>
  <article class="stat"><p class="stat__label">Compras confirmadas</p><p class="stat__value"><?= money($customer['confirmed_total']) ?></p></article>
  <article class="stat"><p class="stat__label">Último pedido</p><p class="stat__value stat__value--sm"><?= e(date_es($customer['last_order_at'])) ?></p></article>
</div>
<div class="admin-grid admin-grid--form">
  <section class="panel panel--flush">
    <div class="panel__head panel__head--padded"><h2 class="panel__title">Historial de pedidos</h2></div>
    <div class="table-wrap">
      <table class="table table--responsive">
        <thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th class="num">Total</th></tr></thead>
        <tbody>
        <?php foreach ($orders as $o): ?>
          <tr>
            <td data-label="Pedido"><a class="strong" href="<?= e(url('admin/pedidos/' . $o['id'])) ?>"><?= e($o['code']) ?></a></td>
            <td data-label="Fecha"><?= e(date_es($o['created_at'], true)) ?></td>
            <td data-label="Estado"><span class="status-pill status-pill--<?= e($o['status']) ?>"><?= e(order_status_label($o['status'])) ?></span></td>
            <td data-label="Total" class="num"><?= money($o['total']) ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </section>
  <section class="panel">
    <h2 class="panel__title">Contacto</h2>
    <dl class="data-list">
      <div><dt>Teléfono</dt><dd><a href="tel:+<?= e($customer['phone']) ?>"><?= e(format_phone($customer['phone'])) ?></a></dd></div>
      <div><dt>Correo</dt><dd><?= $customer['email'] ? '<a href="mailto:' . e($customer['email']) . '">' . e($customer['email']) . '</a>' : '—' ?></dd></div>
      <div><dt>Última dirección</dt><dd><?= e($customer['address'] ?? '—') ?><?= $customer['neighborhood'] ? ', ' . e($customer['neighborhood']) : '' ?><br><?= e($customer['city'] ?? '') ?>, <?= e($customer['department'] ?? '') ?></dd></div>
    </dl>
    <p class="hint">Datos personales: úselos solo para gestionar pedidos, según la política de tratamiento de datos.</p>
  </section>
</div>

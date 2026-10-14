<?php
use App\Core\View;
use App\Models\Order;

$actionLabels = ['confirmed' => 'Confirmar pedido', 'preparing' => 'Pasar a preparación', 'shipped' => 'Marcar como enviado', 'delivered' => 'Marcar como entregado', 'cancelled' => 'Cancelar pedido'];
?>
<?= View::partial('admin/_header', [
    'title' => 'Pedido ' . $order['code'],
    'subtitle' => 'Registrado el ' . date_es($order['created_at'], true),
    'actions' => '<a class="btn btn--ghost btn--sm" href="' . e(url('admin/pedidos/' . $order['id'] . '/imprimir')) . '" target="_blank" rel="noopener">' . icon('printer', '', 16) . ' Imprimir</a>'
        . ($customerWhatsApp ? ' <a class="btn btn--whatsapp btn--sm" href="' . e($customerWhatsApp) . '" target="_blank" rel="noopener">' . icon('chat', '', 16) . ' WhatsApp al cliente</a>' : ''),
]) ?>

<div class="order-status-bar panel">
  <div>
    <p class="muted small">Estado del pedido</p>
    <span class="status-pill status-pill--<?= e($order['status']) ?> status-pill--lg"><?= e(order_status_label($order['status'])) ?></span>
  </div>
  <div>
    <p class="muted small">WhatsApp del cliente</p>
    <p class="strong"><?= $order['whatsapp_opened_at'] ? 'Abrió WhatsApp el ' . e(date_es($order['whatsapp_opened_at'], true)) : 'No ha abierto WhatsApp desde la tienda' ?></p>
    <p class="muted small">Abrir el enlace no garantiza que el mensaje se haya enviado.</p>
  </div>
  <div>
    <p class="muted small">Pago</p>
    <p class="strong"><?= e(payment_status_label($order['payment_status'])) ?></p>
    <p class="muted small"><?= e($order['payment_method'] ?: 'Método no indicado') ?></p>
  </div>
</div>

<div class="admin-grid admin-grid--form">
  <div class="stack-lg">
    <section class="panel panel--flush">
      <div class="panel__head panel__head--padded"><h2 class="panel__title">Productos</h2></div>
      <div class="table-wrap">
        <table class="table table--responsive">
          <thead><tr><th>Producto</th><th>SKU</th><th class="num">Precio</th><th class="num">Cant.</th><th class="num">Subtotal</th></tr></thead>
          <tbody>
          <?php foreach ($items as $it): ?>
            <tr>
              <td data-label="Producto"><?= e($it['product_name']) ?><?php if ($it['variant_name']): ?> <span class="muted">· <?= e($it['variant_name']) ?></span><?php endif; ?><?php if ($it['promotion_name']): ?><br><span class="badge badge--sale badge--inline"><?= e($it['promotion_name']) ?></span><?php endif; ?></td>
              <td data-label="SKU"><code><?= e($it['sku']) ?></code></td>
              <td data-label="Precio" class="num"><?= money($it['final_price']) ?><?php if ((float) $it['discount_amount'] > 0): ?><br><s class="muted small"><?= money($it['unit_price']) ?></s><?php endif; ?></td>
              <td data-label="Cant." class="num"><?= (int) $it['quantity'] ?></td>
              <td data-label="Subtotal" class="num"><?= money($it['line_total']) ?></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <dl class="totals totals--panel">
        <div><dt>Subtotal</dt><dd><?= money($order['subtotal']) ?></dd></div>
        <?php if ((float) $order['discount_total'] > 0): ?><div class="totals__discount"><dt>Descuentos</dt><dd>-<?= money($order['discount_total']) ?></dd></div><?php endif; ?>
        <div><dt>Envío</dt><dd><?= $order['shipping_cost'] === null ? 'Por confirmar' : money($order['shipping_cost']) ?></dd></div>
        <div class="totals__total"><dt><?= $order['shipping_cost'] === null ? 'Total provisional' : 'Total' ?></dt><dd><?= money($order['total']) ?></dd></div>
      </dl>
      <p class="muted small panel__foot">Inventario: <?= $order['stock_status'] === 'reserved' ? 'unidades descontadas al registrar el pedido' : 'unidades devueltas al inventario por cancelación' ?>.</p>
    </section>

    <section class="panel" id="notas">
      <h2 class="panel__title">Observaciones internas</h2>
      <form method="post" action="<?= e(url('admin/pedidos/' . $order['id'] . '/notas')) ?>" class="note-form">
        <?= csrf_field() ?>
        <label for="note" class="visually-hidden">Nueva observación</label>
        <textarea id="note" name="note" rows="2" maxlength="1000" required placeholder="Ej.: Cliente confirmó por WhatsApp, enviar en la mañana…"></textarea>
        <button type="submit" class="btn btn--ghost">Agregar</button>
      </form>
      <?php if ($notes): ?>
        <ul class="timeline">
          <?php foreach ($notes as $n): ?>
            <li><p><?= nl2br(e($n['note'])) ?></p><span class="muted small"><?= e($n['user_name'] ?? 'Sistema') ?> · <?= e(date_es($n['created_at'], true)) ?></span></li>
          <?php endforeach; ?>
        </ul>
      <?php else: ?>
        <p class="muted">Sin observaciones. Solo el equipo las ve.</p>
      <?php endif; ?>
    </section>

    <section class="panel">
      <h2 class="panel__title">Historial de estados</h2>
      <ul class="timeline">
        <?php foreach ($history as $h): ?>
          <li>
            <p><?= $h['from_status'] ? e(order_status_label($h['from_status'])) . ' → ' : '' ?><strong><?= e(order_status_label($h['to_status'])) ?></strong></p>
            <?php if ($h['note']): ?><p class="muted"><?= e($h['note']) ?></p><?php endif; ?>
            <span class="muted small"><?= e($h['user_name'] ?? 'Cliente / tienda') ?> · <?= e(date_es($h['created_at'], true)) ?></span>
          </li>
        <?php endforeach; ?>
      </ul>
    </section>
  </div>

  <aside class="stack-lg">
    <section class="panel">
      <h2 class="panel__title">Actualizar estado</h2>
      <?php if ($transitions): ?>
        <?php foreach ($transitions as $to): ?>
          <form method="post" action="<?= e(url('admin/pedidos/' . $order['id'] . '/estado')) ?>" class="status-form"
            <?= $to === 'cancelled' ? 'data-confirm="¿Cancelar el pedido ' . e($order['code']) . '? Las unidades se devolverán al inventario. Esta acción no se puede deshacer." data-confirm-label="Cancelar pedido"' : '' ?>>
            <?= csrf_field() ?>
            <input type="hidden" name="status" value="<?= e($to) ?>">
            <?php if ($to === 'cancelled'): ?>
              <label for="cancel-note" class="visually-hidden">Motivo de cancelación</label>
              <input id="cancel-note" name="note" maxlength="500" placeholder="Motivo de la cancelación (opcional)">
            <?php endif; ?>
            <button type="submit" class="btn btn--block <?= $to === 'cancelled' ? 'btn--danger-ghost' : 'btn--primary' ?>"><?= e($actionLabels[$to]) ?></button>
          </form>
        <?php endforeach; ?>
        <?php if ($order['status'] === 'pending'): ?><p class="hint">Confirme solo después de validar disponibilidad, envío y pago con el cliente.</p><?php endif; ?>
      <?php else: ?>
        <p class="muted">Este pedido está en un estado final (<?= e(order_status_label($order['status'])) ?>).</p>
      <?php endif; ?>
    </section>

    <section class="panel">
      <h2 class="panel__title">Cliente y entrega</h2>
      <dl class="data-list">
        <div><dt>Nombre</dt><dd><a href="<?= e(url('admin/clientes/' . $order['customer_id'])) ?>"><?= e($order['customer_name']) ?></a></dd></div>
        <div><dt>Teléfono / WhatsApp</dt><dd><a href="tel:+<?= e($order['customer_phone']) ?>"><?= e(format_phone($order['customer_phone'])) ?></a></dd></div>
        <?php if ($order['customer_email']): ?><div><dt>Correo</dt><dd><a href="mailto:<?= e($order['customer_email']) ?>"><?= e($order['customer_email']) ?></a></dd></div><?php endif; ?>
        <div><dt>Destino</dt><dd><?= e($order['city']) ?>, <?= e($order['department']) ?></dd></div>
        <div><dt>Dirección</dt><dd><?= e($order['address']) ?><?= $order['neighborhood'] ? '<br>Barrio ' . e($order['neighborhood']) : '' ?></dd></div>
        <?php if ($order['delivery_notes']): ?><div><dt>Indicaciones</dt><dd><?= e($order['delivery_notes']) ?></dd></div><?php endif; ?>
      </dl>
    </section>

    <?php if (!in_array($order['status'], ['delivered', 'cancelled'], true)): ?>
    <section class="panel">
      <h2 class="panel__title">Costo de envío</h2>
      <form method="post" action="<?= e(url('admin/pedidos/' . $order['id'] . '/envio')) ?>" class="inline-form">
        <?= csrf_field() ?>
        <label for="shipping_cost" class="visually-hidden">Costo de envío</label>
        <input id="shipping_cost" name="shipping_cost" inputmode="numeric" value="<?= $order['shipping_cost'] !== null ? (int) $order['shipping_cost'] : '' ?>" placeholder="Vacío = por confirmar">
        <button type="submit" class="btn btn--ghost">Guardar</button>
      </form>
      <p class="hint">El total se recalcula automáticamente.</p>
    </section>
    <?php endif; ?>

    <section class="panel">
      <h2 class="panel__title">Pago</h2>
      <form method="post" action="<?= e(url('admin/pedidos/' . $order['id'] . '/pago')) ?>" class="inline-form">
        <?= csrf_field() ?>
        <label for="payment_status" class="visually-hidden">Estado de pago</label>
        <select id="payment_status" name="payment_status">
          <?php foreach (Order::PAYMENT_STATUSES as $k => $label): ?><option value="<?= e($k) ?>"<?= selected($k, $order['payment_status']) ?>><?= e($label) ?></option><?php endforeach; ?>
        </select>
        <button type="submit" class="btn btn--ghost">Guardar</button>
      </form>
      <p class="hint">Marque “Pagado” solo después de verificar el pago (por ejemplo, el comprobante de transferencia). La tienda no procesa pagos en línea.</p>
    </section>
  </aside>
</div>

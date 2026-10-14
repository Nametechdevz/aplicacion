<div class="container confirmation">
  <div class="confirmation__hero card">
    <span class="confirmation__icon"><?= icon('check', '', 30) ?></span>
    <p class="eyebrow">Pedido registrado en la tienda</p>
    <h1 class="page-title">¡Gracias, <?= e(strtok($order['customer_name'], ' ')) ?>!</h1>
    <p class="confirmation__code">Código de pedido: <strong><?= e($order['code']) ?></strong></p>

    <ol class="status-steps" aria-label="Estado del pedido">
      <li class="is-done"><span><?= icon('check', '', 14) ?></span> Pedido registrado</li>
      <li class="<?= $order['whatsapp_opened_at'] ? 'is-done' : 'is-current' ?>"><span><?= $order['whatsapp_opened_at'] ? icon('check', '', 14) : '2' ?></span> Enviar resumen por WhatsApp</li>
      <li class="<?= in_array($order['status'], ['confirmed', 'preparing', 'shipped', 'delivered'], true) ? 'is-done' : '' ?>"><span><?= in_array($order['status'], ['confirmed', 'preparing', 'shipped', 'delivered'], true) ? icon('check', '', 14) : '3' ?></span> Confirmación de la tienda</li>
    </ol>

    <p class="confirmation__status">Estado actual: <span class="status-pill status-pill--<?= e($order['status']) ?>"><?= e(order_status_label($order['status'])) ?></span></p>
    <p class="muted">Tu pedido quedó guardado y las unidades están apartadas. <strong>Aún no está confirmado:</strong> lo confirmaremos contigo por WhatsApp junto con el costo del envío y el método de pago.</p>

    <?php if ($whatsappConfigured): ?>
      <form method="post" action="<?= e(url('pedido/' . $order['code'] . '/whatsapp')) ?>" target="_blank" class="confirmation__wa">
        <?= csrf_field() ?>
        <input type="hidden" name="t" value="<?= e($order['public_token']) ?>">
        <button type="submit" class="btn btn--whatsapp btn--lg btn--block"><?= icon('chat', '', 20) ?> Enviar pedido por WhatsApp</button>
      </form>
      <p class="hint hint--center">Se abrirá WhatsApp con el resumen listo. Debes pulsar “Enviar” en WhatsApp para que lo recibamos.</p>
    <?php else: ?>
      <p class="notice notice--warning"><?= icon('info', '', 16) ?> La tienda aún no ha configurado su WhatsApp. Guarda tu código de pedido; te contactaremos al número que registraste.</p>
    <?php endif; ?>
  </div>

  <div class="confirmation__grid">
    <section class="card">
      <h2 class="card__title">Productos</h2>
      <ul class="mini-lines">
        <?php foreach ($items as $item): ?>
          <li>
            <div>
              <p class="mini-lines__name"><?= e($item['product_name']) ?><?php if ($item['variant_name']): ?> <span class="muted">· <?= e($item['variant_name']) ?></span><?php endif; ?></p>
              <p class="muted"><?= (int) $item['quantity'] ?> × <?= money($item['final_price']) ?> · Ref. <?= e($item['sku']) ?></p>
            </div>
            <strong><?= money($item['line_total']) ?></strong>
          </li>
        <?php endforeach; ?>
      </ul>
      <dl class="totals">
        <div><dt>Subtotal</dt><dd><?= money($order['subtotal']) ?></dd></div>
        <?php if ((float) $order['discount_total'] > 0): ?><div class="totals__discount"><dt>Descuentos</dt><dd>-<?= money($order['discount_total']) ?></dd></div><?php endif; ?>
        <div><dt>Envío</dt><dd><?= $order['shipping_cost'] === null ? 'Por confirmar' : ((float) $order['shipping_cost'] > 0 ? money($order['shipping_cost']) : 'Gratis') ?></dd></div>
        <div class="totals__total"><dt><?= $order['shipping_cost'] === null ? 'Total provisional' : 'Total' ?></dt><dd><?= money($order['total']) ?></dd></div>
      </dl>
    </section>
    <section class="card">
      <h2 class="card__title">Entrega</h2>
      <dl class="data-list">
        <div><dt>Nombre</dt><dd><?= e($order['customer_name']) ?></dd></div>
        <div><dt>Contacto</dt><dd><?= e(format_phone($order['customer_phone'])) ?></dd></div>
        <div><dt>Ciudad</dt><dd><?= e($order['city']) ?>, <?= e($order['department']) ?></dd></div>
        <div><dt>Dirección</dt><dd><?= e($order['address']) ?><?= $order['neighborhood'] ? ' — ' . e($order['neighborhood']) : '' ?></dd></div>
        <?php if ($order['payment_method']): ?><div><dt>Pago</dt><dd><?= e($order['payment_method']) ?></dd></div><?php endif; ?>
        <div><dt>Fecha</dt><dd><?= e(date_es($order['created_at'], true)) ?></dd></div>
      </dl>
      <a href="<?= e(url('catalogo')) ?>" class="btn btn--ghost btn--block">Seguir comprando</a>
    </section>
  </div>
</div>

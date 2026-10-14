<div class="print-sheet">
  <div class="print-actions no-print">
    <button type="button" class="btn btn--primary" data-print><?= icon('printer', '', 16) ?> Imprimir</button>
    <a href="<?= e(url('admin/pedidos/' . $order['id'])) ?>" class="btn btn--ghost">Volver al pedido</a>
  </div>
  <header class="print-header">
    <div><?= App\Core\View::partial('components/logo', ['size' => 34]) ?></div>
    <div class="print-header__meta">
      <h1>Orden de pedido</h1>
      <p><strong><?= e($order['code']) ?></strong><br><?= e(date_es($order['created_at'], true)) ?><br>Estado: <?= e(order_status_label($order['status'])) ?></p>
    </div>
  </header>
  <section class="print-grid">
    <div>
      <h2>Cliente</h2>
      <p><?= e($order['customer_name']) ?><br><?= e(format_phone($order['customer_phone'])) ?><?= $order['customer_email'] ? '<br>' . e($order['customer_email']) : '' ?></p>
    </div>
    <div>
      <h2>Entrega</h2>
      <p><?= e($order['address']) ?><?= $order['neighborhood'] ? ', ' . e($order['neighborhood']) : '' ?><br><?= e($order['city']) ?>, <?= e($order['department']) ?><?= $order['delivery_notes'] ? '<br><em>' . e($order['delivery_notes']) . '</em>' : '' ?></p>
    </div>
  </section>
  <table class="print-table">
    <thead><tr><th>Producto</th><th>SKU</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
    <tbody>
      <?php foreach ($items as $it): ?>
        <tr><td><?= e($it['product_name']) ?><?= $it['variant_name'] ? ' · ' . e($it['variant_name']) : '' ?></td><td><?= e($it['sku']) ?></td><td class="num"><?= (int) $it['quantity'] ?></td><td class="num"><?= money($it['final_price']) ?></td><td class="num"><?= money($it['line_total']) ?></td></tr>
      <?php endforeach; ?>
    </tbody>
    <tfoot>
      <tr><td colspan="4" class="num">Subtotal</td><td class="num"><?= money($order['subtotal']) ?></td></tr>
      <?php if ((float) $order['discount_total'] > 0): ?><tr><td colspan="4" class="num">Descuentos</td><td class="num">-<?= money($order['discount_total']) ?></td></tr><?php endif; ?>
      <tr><td colspan="4" class="num">Envío</td><td class="num"><?= $order['shipping_cost'] === null ? 'Por confirmar' : money($order['shipping_cost']) ?></td></tr>
      <tr class="print-total"><td colspan="4" class="num"><?= $order['shipping_cost'] === null ? 'Total provisional' : 'Total' ?></td><td class="num"><?= money($order['total']) ?></td></tr>
    </tfoot>
  </table>
  <p class="print-foot">Pago: <?= e($order['payment_method'] ?: 'No indicado') ?> — <?= e(payment_status_label($order['payment_status'])) ?>. Documento interno sin validez como factura.</p>
</div>

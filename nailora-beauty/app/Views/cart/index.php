<?php $lines = $summary['lines']; ?>
<div class="container page-head">
  <h1 class="page-title">Tu carrito</h1>
  <?php if ($lines): ?><p class="page-lead"><?= (int) $summary['count'] ?> unidad<?= $summary['count'] === 1 ? '' : 'es' ?> en tu carrito</p><?php endif; ?>
</div>

<div class="container">
<?php if (!$lines): ?>
  <div class="empty-state">
    <?= icon('bag', 'empty-state__icon', 44) ?>
    <h2>Tu carrito está vacío</h2>
    <p>Descubre esmaltes, geles y herramientas para tu próxima manicura.</p>
    <div class="empty-state__actions"><a href="<?= e(url('catalogo')) ?>" class="btn btn--primary">Ir al catálogo</a></div>
  </div>
<?php else: ?>
  <div class="cart" data-cart>
    <section class="cart__lines" aria-label="Productos en el carrito">
      <ul class="cart-list">
        <?php foreach ($lines as $line): ?>
          <li class="cart-item" data-cart-line>
            <a href="<?= e(url('producto/' . $line['slug'])) ?>" class="cart-item__media">
              <img src="<?= e(image_url($line['image_path'])) ?>" alt="" width="96" height="96" loading="lazy">
            </a>
            <div class="cart-item__info">
              <h2 class="cart-item__name"><a href="<?= e(url('producto/' . $line['slug'])) ?>"><?= e($line['name']) ?></a></h2>
              <?php if ($line['variant_name']): ?><p class="cart-item__variant"><?= e($line['variant_name']) ?></p><?php endif; ?>
              <p class="cart-item__sku">Ref. <?= e($line['sku']) ?></p>
              <p class="cart-item__unit">
                <?= money($line['unit_final']) ?> c/u
                <?php if ($line['pricing']['discount'] > 0): ?><s class="muted"><?= money($line['unit_price']) ?></s> <span class="badge badge--sale badge--inline">-<?= (int) $line['pricing']['percent'] ?>%</span><?php endif; ?>
              </p>
            </div>
            <div class="cart-item__controls">
              <form method="post" action="<?= e(url('carrito/actualizar')) ?>" class="qty-form" data-cart-update>
                <?= csrf_field() ?>
                <input type="hidden" name="key" value="<?= e($line['key']) ?>">
                <div class="qty qty--sm" data-qty>
                  <button type="button" class="qty__btn" data-qty-step="-1" aria-label="Disminuir cantidad"><?= icon('minus', '', 14) ?></button>
                  <label class="visually-hidden" for="qty-<?= e($line['key']) ?>">Cantidad de <?= e($line['name']) ?></label>
                  <input id="qty-<?= e($line['key']) ?>" type="number" name="quantity" value="<?= (int) $line['quantity'] ?>" min="0" max="<?= min($line['available'], (int) config('app.catalog.max_cart_quantity', 50)) ?>" inputmode="numeric" data-qty-input>
                  <button type="button" class="qty__btn" data-qty-step="1" aria-label="Aumentar cantidad"><?= icon('plus', '', 14) ?></button>
                </div>
                <noscript><button type="submit" class="btn btn--ghost btn--sm">Actualizar</button></noscript>
              </form>
              <p class="cart-item__total"><?= money($line['line_total']) ?></p>
              <form method="post" action="<?= e(url('carrito/eliminar')) ?>">
                <?= csrf_field() ?>
                <input type="hidden" name="key" value="<?= e($line['key']) ?>">
                <button type="submit" class="link-btn link-btn--danger"><?= icon('trash', '', 14) ?> Eliminar</button>
              </form>
            </div>
          </li>
        <?php endforeach; ?>
      </ul>
      <div class="cart__footer">
        <a href="<?= e(url('catalogo')) ?>" class="link-arrow"><?= icon('arrow-left', '', 16) ?> Seguir comprando</a>
        <form method="post" action="<?= e(url('carrito/vaciar')) ?>" data-confirm="¿Seguro que quieres vaciar el carrito? Se eliminarán todos los productos.">
          <?= csrf_field() ?>
          <button type="submit" class="link-btn link-btn--danger"><?= icon('trash', '', 14) ?> Vaciar carrito</button>
        </form>
      </div>
    </section>

    <aside class="cart__summary summary-card" aria-label="Resumen del pedido">
      <h2 class="summary-card__title">Resumen</h2>
      <dl class="totals">
        <div><dt>Subtotal</dt><dd><?= money($summary['subtotal']) ?></dd></div>
        <?php if ($summary['discount'] > 0): ?><div class="totals__discount"><dt>Descuentos</dt><dd>-<?= money($summary['discount']) ?></dd></div><?php endif; ?>
        <div><dt>Envío</dt><dd><?= e($summary['shipping']['label']) ?></dd></div>
        <div class="totals__total"><dt><?= $summary['shipping']['pending'] ? 'Total provisional' : 'Total' ?></dt><dd><?= money($summary['total']) ?></dd></div>
      </dl>
      <?php if ($summary['shipping']['pending']): ?>
        <p class="hint"><?= icon('info', '', 14) ?> El costo del envío se confirmará por WhatsApp según tu ciudad, antes de finalizar la compra.</p>
      <?php elseif ($freeShippingThreshold && $summary['items_total'] < $freeShippingThreshold): ?>
        <p class="hint"><?= icon('truck', '', 14) ?> Te faltan <?= money($freeShippingThreshold - $summary['items_total']) ?> para el envío gratis.</p>
      <?php endif; ?>
      <a href="<?= e(url('checkout')) ?>" class="btn btn--primary btn--block btn--lg">Continuar con la compra</a>
      <?php if ($cartWhatsApp): ?>
        <a href="<?= e(url('carrito/whatsapp')) ?>" class="btn btn--whatsapp-outline btn--block" target="_blank" rel="noopener"><?= icon('chat', '', 18) ?> Consultar este carrito por WhatsApp</a>
        <p class="hint hint--center">La consulta por WhatsApp no registra un pedido.</p>
      <?php endif; ?>
    </aside>
  </div>
<?php endif; ?>
</div>

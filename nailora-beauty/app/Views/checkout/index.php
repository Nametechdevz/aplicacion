<?php
$fieldClass = static fn (string $f): string => has_error($f) ? ' has-error' : '';
$describedBy = static fn (string $f): string => has_error($f) ? ' aria-invalid="true" aria-describedby="err-' . $f . '"' : '';
?>
<div class="container page-head">
  <nav class="breadcrumbs" aria-label="Ruta de navegación">
    <ol><li><a href="<?= e(url('carrito')) ?>">Carrito</a></li><li aria-current="page">Datos de entrega</li></ol>
  </nav>
  <h1 class="page-title">Finalizar compra</h1>
  <p class="page-lead">Compra como invitada: no necesitas crear una cuenta.</p>
</div>

<div class="container checkout">
  <form method="post" action="<?= e(url('checkout')) ?>" class="checkout__form card" novalidate data-once-submit>
    <?= csrf_field() ?>
    <input type="hidden" name="checkout_token" value="<?= e($checkoutToken) ?>">

    <h2 class="form-section-title"><span class="step-dot">1</span> Tus datos</h2>
    <div class="form-grid">
      <div class="field field--full<?= $fieldClass('full_name') ?>">
        <label for="full_name">Nombre completo</label>
        <input id="full_name" name="full_name" type="text" required maxlength="150" autocomplete="name" value="<?= e(old('full_name')) ?>"<?= $describedBy('full_name') ?>>
        <?= error_for('full_name') ?>
      </div>
      <div class="field<?= $fieldClass('phone') ?>">
        <label for="phone">Celular / WhatsApp</label>
        <input id="phone" name="phone" type="tel" required inputmode="tel" autocomplete="tel-national" placeholder="300 123 4567" maxlength="20" value="<?= e(old('phone')) ?>"<?= $describedBy('phone') ?>>
        <?= error_for('phone') ?>
      </div>
      <div class="field<?= $fieldClass('email') ?>">
        <label for="email">Correo electrónico <span class="optional">(opcional)</span></label>
        <input id="email" name="email" type="email" autocomplete="email" maxlength="190" value="<?= e(old('email')) ?>"<?= $describedBy('email') ?>>
        <?= error_for('email') ?>
      </div>
    </div>

    <h2 class="form-section-title"><span class="step-dot">2</span> Dirección de entrega</h2>
    <div class="form-grid">
      <div class="field<?= $fieldClass('department') ?>">
        <label for="department">Departamento</label>
        <select id="department" name="department" required autocomplete="address-level1"<?= $describedBy('department') ?>>
          <option value="">Selecciona…</option>
          <?php foreach ($departments as $d): ?><option value="<?= e($d) ?>"<?= selected($d, old('department')) ?>><?= e($d) ?></option><?php endforeach; ?>
        </select>
        <?= error_for('department') ?>
      </div>
      <div class="field<?= $fieldClass('city') ?>">
        <label for="city">Ciudad o municipio</label>
        <input id="city" name="city" type="text" required maxlength="100" autocomplete="address-level2" value="<?= e(old('city')) ?>"<?= $describedBy('city') ?>>
        <?= error_for('city') ?>
      </div>
      <div class="field field--full<?= $fieldClass('address') ?>">
        <label for="address">Dirección</label>
        <input id="address" name="address" type="text" required maxlength="255" autocomplete="street-address" placeholder="Calle 00 # 00-00, apto/casa" value="<?= e(old('address')) ?>"<?= $describedBy('address') ?>>
        <?= error_for('address') ?>
      </div>
      <div class="field<?= $fieldClass('neighborhood') ?>">
        <label for="neighborhood">Barrio <span class="optional">(si aplica)</span></label>
        <input id="neighborhood" name="neighborhood" type="text" maxlength="120" value="<?= e(old('neighborhood')) ?>">
        <?= error_for('neighborhood') ?>
      </div>
      <div class="field field--full<?= $fieldClass('delivery_notes') ?>">
        <label for="delivery_notes">Indicaciones de entrega <span class="optional">(opcional)</span></label>
        <textarea id="delivery_notes" name="delivery_notes" rows="2" maxlength="500" placeholder="Punto de referencia, horario preferido…"><?= e(old('delivery_notes')) ?></textarea>
        <?= error_for('delivery_notes') ?>
      </div>
    </div>

    <?php if ($paymentMethods): ?>
    <h2 class="form-section-title"><span class="step-dot">3</span> Método de pago</h2>
    <fieldset class="radio-cards<?= $fieldClass('payment_method') ?>"<?= $describedBy('payment_method') ?>>
      <legend class="visually-hidden">Método de pago</legend>
      <?php foreach ($paymentMethods as $i => $method): ?>
        <label class="radio-card">
          <input type="radio" name="payment_method" value="<?= e($method) ?>" required<?= (old('payment_method') === $method || (old('payment_method') === '' && $i === 0)) ? ' checked' : '' ?>>
          <span><?= icon('card', '', 18) ?> <?= e($method) ?></span>
        </label>
      <?php endforeach; ?>
      <?= error_for('payment_method') ?>
    </fieldset>
    <p class="hint">No cobramos en línea. Te enviaremos los datos de pago por WhatsApp cuando confirmemos tu pedido.</p>
    <?php endif; ?>

    <div class="field field--check<?= $fieldClass('accept_terms') ?>">
      <label class="check">
        <input type="checkbox" name="accept_terms" value="1" required<?= old('accept_terms') ? ' checked' : '' ?><?= $describedBy('accept_terms') ?>>
        <span>Acepto la <a href="<?= e(url('pagina/tratamiento-de-datos')) ?>" target="_blank">política de tratamiento de datos</a> y las <a href="<?= e(url('pagina/condiciones-de-compra')) ?>" target="_blank">condiciones de compra</a>.</span>
      </label>
      <?= error_for('accept_terms') ?>
    </div>

    <button type="submit" class="btn btn--primary btn--lg btn--block" data-loading-text="Registrando pedido…"><?= icon('lock', '', 18) ?> Registrar pedido</button>
    <p class="hint hint--center">Tu pedido quedará pendiente de confirmación. Después podrás enviarlo por WhatsApp.</p>
  </form>

  <aside class="checkout__summary summary-card" aria-label="Resumen del pedido">
    <h2 class="summary-card__title">Tu pedido</h2>
    <ul class="mini-lines">
      <?php foreach ($summary['lines'] as $line): ?>
        <li>
          <img src="<?= e(image_url($line['image_path'])) ?>" alt="" width="56" height="56" loading="lazy">
          <div>
            <p class="mini-lines__name"><?= e($line['name']) ?><?php if ($line['variant_name']): ?> <span class="muted">· <?= e($line['variant_name']) ?></span><?php endif; ?></p>
            <p class="muted"><?= (int) $line['quantity'] ?> × <?= money($line['unit_final']) ?></p>
          </div>
          <strong><?= money($line['line_total']) ?></strong>
        </li>
      <?php endforeach; ?>
    </ul>
    <dl class="totals">
      <div><dt>Subtotal</dt><dd><?= money($summary['subtotal']) ?></dd></div>
      <?php if ($summary['discount'] > 0): ?><div class="totals__discount"><dt>Descuentos</dt><dd>-<?= money($summary['discount']) ?></dd></div><?php endif; ?>
      <div><dt>Envío</dt><dd><?= e($summary['shipping']['label']) ?></dd></div>
      <div class="totals__total"><dt><?= $summary['shipping']['pending'] ? 'Total provisional' : 'Total' ?></dt><dd><?= money($summary['total']) ?></dd></div>
    </dl>
    <a href="<?= e(url('carrito')) ?>" class="link-arrow"><?= icon('edit', '', 14) ?> Editar carrito</a>
  </aside>
</div>

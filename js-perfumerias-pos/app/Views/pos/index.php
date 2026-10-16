<?php
/** Punto de venta: catálogo visual (izquierda) y carrito (derecha). La lógica vive en pos.js. */
?>
<div class="pos" data-pos>
  <section class="pos-catalog" aria-label="Catálogo">
    <div class="pos-search">
      <div class="search-box">
        <?= icon('search') ?>
        <input class="input" type="search" data-search placeholder="Buscar por nombre, código o escanear código de barras" aria-label="Buscar producto o escanear" autocomplete="off" autofocus>
        <span class="scan-hint"><?= icon('barcode', 'icon-sm') ?> Lector listo <span class="kbd">F2</span></span>
      </div>
      <div class="chips" role="tablist" aria-label="Categorías" data-chips>
        <button class="chip is-active" type="button" data-cat="">Todos</button>
        <?php foreach ($config['categories'] as $c): ?>
          <button class="chip" type="button" data-cat="<?= (int) $c['id'] ?>"><?= e($c['name']) ?></button>
        <?php endforeach; ?>
      </div>
    </div>
    <div class="pos-grid" data-grid aria-live="polite">
      <?php for ($i = 0; $i < 12; $i++): ?><div class="skeleton sk-card"></div><?php endfor; ?>
    </div>
  </section>

  <aside class="pos-cart" aria-label="Carrito de venta" data-cart>
    <div class="cart-head">
      <div class="row-between">
        <button type="button" class="btn btn-ghost btn-sm hidden cart-sheet-handle" data-cart-close aria-label="Cerrar carrito"><?= icon('chevron-down') ?> Seguir vendiendo</button>
        <div class="cart-session">
          <?php if ($session): ?>
            <span class="badge badge-success"><?= e($session['register_name']) ?> · abierta <?= e(fmt_dt($session['opened_at'], 'H:i')) ?></span>
          <?php else: ?>
            <span class="badge badge-warning">Caja cerrada</span>
          <?php endif; ?>
          <span class="muted truncate"><?= e($branch['name']) ?></span>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-clear title="Vaciar carrito"><?= icon('trash', 'icon-sm') ?> Vaciar</button>
      </div>
      <button type="button" class="customer-pick" data-customer-open>
        <span class="avatar" style="background:var(--surface-3);color:var(--muted);border-color:var(--line)" data-customer-avatar><?= icon('user-plus', 'icon-sm') ?></span>
        <span class="meta"><strong data-customer-name>Cliente general</strong><small data-customer-sub>Asociar cliente (F4)</small></span>
        <?= icon('chevron-right', 'icon-sm muted') ?>
      </button>
    </div>

    <div class="cart-lines" data-lines></div>

    <div class="cart-foot">
      <div class="callout callout-warning hidden" data-margin-warning><?= icon('alert', 'icon-sm') ?><span>Uno o más descuentos dejan el margen por debajo del mínimo configurado.</span></div>
      <div class="totals">
        <div class="line"><span class="muted">Subtotal</span><span data-subtotal>$ 0</span></div>
        <div class="line"><span class="muted">Descuentos</span><span data-discounts>$ 0</span></div>
        <div class="line grand"><span>Total</span><span data-total>$ 0</span></div>
      </div>
      <button type="button" class="btn btn-gold btn-xl btn-block" data-checkout disabled>
        <?= icon('banknote') ?> Cobrar <span class="kbd" style="background:rgba(0,0,0,.08);border-color:transparent;color:inherit">F9</span>
      </button>
      <div class="shortcut-bar">
        <span><span class="kbd">F2</span> Buscar</span><span><span class="kbd">F4</span> Cliente</span>
        <span><span class="kbd">F8</span> Descuento</span><span><span class="kbd">+ −</span> Cantidad</span><span><span class="kbd">Supr</span> Quitar</span>
      </div>
    </div>

    <?php if (!$session): ?>
    <div class="cart-lock" data-cash-lock style="position:absolute;inset:0;background:color-mix(in srgb, var(--surface) 94%, transparent);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px;z-index:3">
      <div class="panel" style="width:100%;max-width:360px;box-shadow:var(--shadow-md)">
        <div class="panel-body stack" style="gap:14px">
          <div><div class="eyebrow" style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-strong)">Inicio de turno</div>
            <h2 style="font-size:18px;margin-top:6px">Abra su caja para vender</h2>
            <p class="muted" style="font-size:13px;margin-top:4px">Registre el fondo inicial en efectivo.</p></div>
          <?= \App\Core\View::partial('cash/open-form', ['registers' => $registers, 'elsewhere' => $elsewhere, 'ajax' => true]) ?>
        </div>
      </div>
    </div>
    <?php endif; ?>
  </aside>

  <button type="button" class="cart-toggle" data-cart-toggle>
    <span><span class="ct-count" data-count>0</span>Ver carrito</span><span data-total-mobile>$ 0</span>
  </button>
</div>

<!-- Opciones del producto: presentación o cantidad fraccionada -->
<dialog class="modal" id="options-modal" aria-labelledby="options-title">
  <div class="modal-card">
    <div class="modal-head"><div><h2 id="options-title" data-opt-title>Producto</h2><p data-opt-sub></p></div>
      <button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body stack" style="gap:16px">
      <div data-opt-variants class="stack" style="gap:8px"></div>
      <div data-opt-fraction>
        <div class="label mb-2" data-opt-fraction-label>Cantidad</div>
        <div class="row" style="gap:10px">
          <div class="input-group has-addon" style="flex:1"><input class="input" style="height:52px;font-size:20px;font-weight:700" data-opt-qty inputmode="decimal" aria-label="Cantidad"><span class="addon" data-opt-unit>ml</span></div>
          <button class="btn btn-primary btn-lg" type="button" data-opt-add>Agregar</button>
        </div>
        <div class="quick-cash mt-2" data-opt-quick></div>
        <div class="muted mt-2" style="font-size:12.5px" data-opt-calc></div>
      </div>
    </div>
  </div>
</dialog>

<!-- Descuento de línea -->
<dialog class="modal" id="discount-modal" aria-labelledby="discount-title">
  <form class="modal-card" data-discount-form novalidate>
    <div class="modal-head"><div><h2 id="discount-title">Descuento</h2><p data-disc-product></p></div>
      <button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body stack" style="gap:16px">
      <div class="segmented" style="align-self:flex-start" data-disc-type>
        <label><input type="radio" name="dtype" value="percent" checked><span>Porcentaje</span></label>
        <label><input type="radio" name="dtype" value="amount"><span>Valor fijo</span></label>
        <label><input type="radio" name="dtype" value="final_price"><span>Precio final</span></label>
      </div>
      <div class="field"><label for="disc-value" data-disc-label>Porcentaje de descuento</label>
        <div class="input-group has-addon"><input class="input" id="disc-value" data-disc-value inputmode="decimal" style="height:50px;font-size:18px;font-weight:700"><span class="addon" data-disc-addon>%</span></div></div>
      <div class="field"><label for="disc-reason">Motivo</label>
        <input class="input" id="disc-reason" data-disc-reason maxlength="200" placeholder="Ej.: cliente frecuente, promoción vigente"></div>
      <div class="panel" style="background:var(--surface-2)"><div class="panel-body" style="padding:14px 16px">
        <dl class="dl" style="font-size:13px">
          <dt>Importe antes del descuento</dt><dd data-disc-gross>—</dd>
          <dt>Descuento</dt><dd data-disc-amount>—</dd>
          <dt>Importe final</dt><dd data-disc-final>—</dd>
          <dt>Su límite autorizado</dt><dd data-disc-limit>—</dd>
        </dl>
      </div></div>
      <div class="callout callout-warning hidden" data-disc-warning><?= icon('lock', 'icon-sm') ?><span>Este descuento supera su límite. Requiere autorización de un supervisor.</span></div>
      <div class="callout callout-success hidden" data-disc-approved><?= icon('check-circle', 'icon-sm') ?><span></span></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger-ghost" type="button" data-disc-remove style="margin-right:auto">Quitar descuento</button>
      <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
      <button class="btn btn-primary" type="submit" data-disc-apply>Aplicar</button>
    </div>
  </form>
</dialog>

<!-- Autorización de descuento -->
<dialog class="modal modal-sm" id="approval-modal" aria-labelledby="approval-title" data-static>
  <div class="modal-card">
    <div class="modal-head"><div><h2 id="approval-title">Autorización requerida</h2><p data-appr-text></p></div></div>
    <div class="modal-body stack" style="gap:14px">
      <div class="callout callout-gold" data-appr-wait><span class="spinner" style="color:var(--gold-strong)"></span><span>Solicitud enviada. Un supervisor puede aprobarla desde <strong>Autorizaciones</strong>; esta ventana se actualiza sola.</span></div>
      <div class="label">O autorización presencial del supervisor</div>
      <form class="stack" style="gap:10px" data-appr-form autocomplete="off">
        <input class="input" name="username" placeholder="Usuario del supervisor" autocomplete="off" required aria-label="Usuario del supervisor">
        <input class="input" name="password" type="password" placeholder="Contraseña" autocomplete="new-password" required aria-label="Contraseña del supervisor">
        <button class="btn btn-primary" type="submit"><?= icon('key') ?> Autorizar aquí</button>
      </form>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-appr-cancel>Cancelar solicitud</button></div>
  </div>
</dialog>

<!-- Cliente -->
<dialog class="modal" id="customer-modal" aria-labelledby="customer-title">
  <div class="modal-card">
    <div class="modal-head"><div><h2 id="customer-title">Cliente de la venta</h2><p>Busque por nombre, documento o teléfono.</p></div>
      <button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body stack" style="gap:14px">
      <div class="input-group"><?= icon('search') ?><input class="input" data-cust-search placeholder="Buscar cliente…" aria-label="Buscar cliente" autocomplete="off"></div>
      <div class="stack" style="gap:6px" data-cust-results></div>
      <?php if ($config['can_customers']): ?>
      <details class="panel" style="background:var(--surface-2)">
        <summary style="padding:12px 16px;cursor:pointer;font-weight:600;list-style:none" class="row"><?= icon('user-plus', 'icon-sm') ?> Registrar cliente nuevo</summary>
        <form class="panel-body form-grid" data-cust-form style="padding-top:4px">
          <div class="field col-12"><label for="c-name">Nombre completo<span class="req">*</span></label><input class="input" id="c-name" name="full_name" required maxlength="160"></div>
          <div class="field col-6"><label for="c-phone">Teléfono</label><input class="input" id="c-phone" name="phone" inputmode="tel" maxlength="40"></div>
          <div class="field col-6"><label for="c-doc">Documento</label><input class="input" id="c-doc" name="document_number" maxlength="30"></div>
          <div class="field col-12"><label for="c-email">Correo (opcional)</label><input class="input" id="c-email" name="email" type="email" maxlength="160"></div>
          <div class="col-12 row" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Guardar y asociar</button></div>
        </form>
      </details>
      <?php endif; ?>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-cust-clear>Venta sin cliente</button></div>
  </div>
</dialog>

<!-- Cobro -->
<dialog class="modal modal-xl" id="checkout-modal" aria-labelledby="checkout-title">
  <div class="modal-card">
    <div class="checkout">
      <div class="checkout-summary">
        <div class="eyebrow">Total a pagar</div>
        <div class="big" data-co-total>$ 0</div>
        <div class="totals">
          <div class="line"><span>Artículos</span><span data-co-items>0</span></div>
          <div class="line"><span>Subtotal</span><span data-co-subtotal>$ 0</span></div>
          <div class="line"><span>Descuentos</span><span data-co-discounts>$ 0</span></div>
          <div class="line"><span>Cliente</span><span data-co-customer class="truncate" style="max-width:150px">General</span></div>
        </div>
        <div class="change-box" data-co-change-box>
          <small data-co-change-label>Cambio</small>
          <strong data-co-change>$ 0</strong>
        </div>
      </div>
      <div class="checkout-main">
        <div class="row-between">
          <h2 id="checkout-title" style="font-size:18px">Medio de pago</h2>
          <button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button>
        </div>
        <div class="methods" data-co-methods></div>
        <div class="pay-rows" data-co-rows></div>
        <div class="quick-cash" data-co-quick></div>
        <div class="pay-note"><?= icon('info', 'icon-sm') ?><span>Los pagos electrónicos quedan <strong>pendientes de verificación manual</strong>: el sistema no confirma transferencias, Nequi ni tarjetas sin integración.</span></div>
        <div class="callout callout-danger hidden" data-co-error><?= icon('alert', 'icon-sm') ?><span></span></div>
        <div class="row co-actions" style="margin-top:auto;justify-content:flex-end;gap:10px">
          <button class="btn btn-ghost btn-lg" type="button" data-close>Volver</button>
          <button class="btn btn-gold btn-lg" type="button" data-co-confirm disabled><span class="spinner"></span><?= icon('check') ?> Confirmar venta <span class="kbd" style="background:rgba(0,0,0,.08);border-color:transparent;color:inherit">Enter</span></button>
        </div>
      </div>
    </div>
  </div>
</dialog>

<!-- Venta registrada -->
<dialog class="modal modal-sm" id="success-modal" aria-labelledby="success-title">
  <div class="modal-card">
    <div class="modal-body" style="text-align:center;padding:30px 24px 10px">
      <div style="width:64px;height:64px;border-radius:50%;margin:0 auto 14px;display:grid;place-items:center;background:var(--success-bg);color:var(--success)"><?= icon('check', 'icon-lg') ?></div>
      <h2 id="success-title" style="font-size:20px">Venta registrada</h2>
      <p class="muted mt-1" data-ok-number></p>
      <div class="panel mt-3" style="background:var(--surface-2)"><div class="panel-body" style="padding:14px 18px">
        <dl class="dl"><dt>Total</dt><dd data-ok-total></dd><dt>Cambio a entregar</dt><dd data-ok-change style="font-size:20px"></dd></dl>
      </div></div>
    </div>
    <div class="modal-foot" style="justify-content:center">
      <button class="btn btn-lg" type="button" data-ok-print><?= icon('printer') ?> Imprimir</button>
      <button class="btn btn-primary btn-lg" type="button" data-ok-new autofocus><?= icon('plus') ?> Nueva venta</button>
    </div>
  </div>
</dialog>
<iframe title="Impresión de comprobante" data-print-frame style="position:absolute;width:0;height:0;border:0;left:-9999px"></iframe>
<script type="application/json" id="pos-config"><?= json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?></script>

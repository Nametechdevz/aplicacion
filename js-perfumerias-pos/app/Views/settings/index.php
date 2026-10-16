<?php $chk = static fn ($k) => ($s[$k] ?? '0') === '1' ? 'checked' : ''; ?>
<div class="page-head">
  <div><div class="eyebrow">Administración</div><h1>Configuración</h1><p>Datos de la empresa, políticas comerciales, límites de descuento y medios de pago. Cada cambio queda auditado.</p></div>
</div>
<div class="grid grid-12" style="align-items:start">
  <?php if (can('settings.manage')): ?>
  <form class="panel span-7" method="post" action="<?= e(url('/settings')) ?>">
    <?= csrf_field() ?>
    <section class="form-section"><h3>Empresa</h3><p class="muted">Aparece en comprobantes y reportes.</p>
      <div class="form-grid">
        <div class="field col-8"><label>Nombre comercial</label><input class="input" name="company_name" required maxlength="120" value="<?= e($s['company_name'] ?? '') ?>"></div>
        <div class="field col-4"><label>NIT</label><input class="input" name="company_tax_id" maxlength="40" value="<?= e($s['company_tax_id'] ?? '') ?>"></div>
        <div class="field col-12"><label>Dirección</label><input class="input" name="company_address" maxlength="255" value="<?= e($s['company_address'] ?? '') ?>"></div>
        <div class="field col-6"><label>Teléfono</label><input class="input" name="company_phone" maxlength="40" value="<?= e($s['company_phone'] ?? '') ?>"></div>
        <div class="field col-6"><label>Correo</label><input class="input" type="email" name="company_email" maxlength="160" value="<?= e($s['company_email'] ?? '') ?>"></div>
        <div class="field col-12"><label>Pie de comprobante</label><input class="input" name="receipt_footer" maxlength="255" value="<?= e($s['receipt_footer'] ?? '') ?>"></div>
      </div>
    </section>
    <section class="form-section"><h3>Políticas comerciales</h3><p class="muted">Moneda COP · zona horaria America/Bogota · fechas dd/mm/aaaa.</p>
      <div class="form-grid">
        <div class="field col-4"><label>Margen mínimo de alerta</label><div class="input-group has-addon"><input class="input" name="min_margin_pct" inputmode="decimal" value="<?= e($s['min_margin_pct'] ?? '15') ?>"><span class="addon">%</span></div></div>
        <div class="field col-4"><label>Vigencia de autorizaciones</label><div class="input-group has-addon"><input class="input" name="approval_expiry_min" inputmode="numeric" value="<?= e($s['approval_expiry_min'] ?? '30') ?>"><span class="addon">min</span></div></div>
        <div class="field col-4"><label>Tolerancia de diferencia en caja</label><input class="input" name="cash_difference_tolerance" inputmode="decimal" value="<?= e($s['cash_difference_tolerance'] ?? '0') ?>"></div>
        <div class="field col-12"><label>Política de costo de inventario</label><select class="select" name="cost_policy"><option value="weighted_average" <?= ($s['cost_policy'] ?? '') === 'weighted_average' ? 'selected' : '' ?>>Costo promedio ponderado</option><option value="last" <?= ($s['cost_policy'] ?? '') === 'last' ? 'selected' : '' ?>>Último costo de compra</option></select><span class="hint">Nunca modifica el costo histórico de ventas ya registradas.</span></div>
        <div class="col-12 stack" style="gap:12px">
          <label class="switch"><input type="hidden" name="allow_mixed_payments" value="0"><input type="checkbox" name="allow_mixed_payments" value="1" <?= $chk('allow_mixed_payments') ?>><span class="track"></span><span>Permitir pagos mixtos (varios medios en una venta)</span></label>
          <label class="switch"><input type="hidden" name="cash_close_requires_approval" value="0"><input type="checkbox" name="cash_close_requires_approval" value="1" <?= $chk('cash_close_requires_approval') ?>><span class="track"></span><span>Todo cierre de caja requiere aprobación del supervisor</span></label>
          <label class="switch"><input type="hidden" name="returns_require_approval" value="0"><input type="checkbox" name="returns_require_approval" value="1" <?= $chk('returns_require_approval') ?>><span class="track"></span><span>Las devoluciones de cajeros requieren aprobación</span></label>
          <label class="switch"><input type="hidden" name="allow_negative_stock" value="0"><input type="checkbox" name="allow_negative_stock" value="1" <?= $chk('allow_negative_stock') ?>><span class="track"></span><span>Permitir existencias negativas (solo en productos que lo autoricen)</span></label>
        </div>
      </div>
    </section>
    <div class="form-actions"><button class="btn btn-primary" type="submit"><?= icon('check') ?> Guardar configuración</button></div>
  </form>
  <?php endif; ?>
  <div class="span-5 stack">
    <?php if (can('discounts.configure')): ?>
    <form class="panel" method="post" action="<?= e(url('/settings/discount-limit')) ?>" id="descuentos">
      <?= csrf_field() ?><input type="hidden" name="scope" value="role">
      <div class="panel-head"><div><h2>Descuento máximo por rol</h2><div class="sub">Por usuario se ajusta en Usuarios; por producto, en su ficha.</div></div></div>
      <div class="panel-body stack" style="gap:10px">
        <?php foreach ($roles as $r): ?><div class="row-between"><span><?= e($r['name']) ?></span><div class="input-group has-addon" style="width:130px"><input class="input input-sm" name="limits[<?= (int) $r['id'] ?>]" inputmode="decimal" value="<?= e($r['max_percent'] !== null ? rtrim(rtrim($r['max_percent'], '0'), '.') : '') ?>"><span class="addon">%</span></div></div><?php endforeach; ?>
      </div>
      <div class="panel-foot"><span></span><button class="btn btn-sm btn-primary" type="submit">Guardar</button></div>
    </form>
    <form class="panel" method="post" action="<?= e(url('/settings/discount-limit')) ?>">
      <?= csrf_field() ?><input type="hidden" name="scope" value="branch">
      <div class="panel-head"><div><h2>Tope por sucursal</h2><div class="sub">Vacío = sin tope adicional</div></div></div>
      <div class="panel-body stack" style="gap:10px">
        <?php foreach ($branches as $b): ?><div class="row-between"><span><?= e($b['name']) ?></span><div class="input-group has-addon" style="width:130px"><input class="input input-sm" name="limits[<?= (int) $b['id'] ?>]" inputmode="decimal" value="<?= e($b['max_percent'] !== null ? rtrim(rtrim($b['max_percent'], '0'), '.') : '') ?>" placeholder="—"><span class="addon">%</span></div></div><?php endforeach; ?>
        <?php if (!$branches): ?><p class="muted">Sin puntos de venta.</p><?php endif; ?>
      </div>
      <div class="panel-foot"><span></span><button class="btn btn-sm btn-primary" type="submit">Guardar</button></div>
    </form>
    <?php endif; ?>
    <?php if (can('settings.manage')): ?>
    <form class="panel" method="post" action="<?= e(url('/settings/payment-methods')) ?>" id="pagos">
      <?= csrf_field() ?>
      <div class="panel-head"><div><h2>Medios de pago</h2><div class="sub">Los electrónicos quedan pendientes de verificación manual: no hay integración bancaria configurada.</div></div></div>
      <div class="panel-body stack" style="gap:10px">
        <?php foreach ($methods as $m): ?>
          <div class="row" style="gap:10px;flex-wrap:wrap">
            <input class="input input-sm" name="methods[<?= (int) $m['id'] ?>][name]" value="<?= e($m['name']) ?>" style="flex:1;min-width:140px" aria-label="Nombre">
            <label class="check" style="font-size:12.5px"><input type="checkbox" name="methods[<?= (int) $m['id'] ?>][requires_reference]" value="1" <?= (int) $m['requires_reference'] ? 'checked' : '' ?>> Referencia</label>
            <label class="check" style="font-size:12.5px"><input type="checkbox" name="methods[<?= (int) $m['id'] ?>][is_active]" value="1" <?= (int) $m['is_active'] ? 'checked' : '' ?>> Activo</label>
          </div>
        <?php endforeach; ?>
        <div class="row mt-2" style="gap:10px;flex-wrap:wrap"><input class="input input-sm" name="new_name" placeholder="Nuevo medio (ej.: Daviplata)" style="flex:1;min-width:140px"><select class="select select-sm" name="new_type" style="width:150px"><option value="wallet">Billetera digital</option><option value="bank_transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></div>
      </div>
      <div class="panel-foot"><span></span><button class="btn btn-sm btn-primary" type="submit">Guardar</button></div>
    </form>
    <?php endif; ?>
  </div>
</div>

<?php
$typeLabels = ['opening' => 'Fondo inicial', 'sale' => 'Venta', 'refund' => 'Reembolso', 'cash_in' => 'Entrada', 'cash_out' => 'Salida', 'expense' => 'Gasto', 'void' => 'Anulación'];
$diff = (float) ($s['difference'] ?? 0);
?>
<div class="page-head">
  <div><div class="eyebrow"><?= e($s['branch_name']) ?> · <?= e($s['register_name']) ?></div><h1>Turno #<?= (int) $s['id'] ?> · <?= e($s['user_name']) ?></h1>
    <p><?= e(fmt_dt($s['opened_at'])) ?> — <?= e($s['closed_at'] ? fmt_dt($s['closed_at']) : 'en curso') ?></p></div>
  <div class="page-actions">
    <button class="btn" type="button" data-print><?= icon('printer') ?> Imprimir</button>
    <?php $canClose = $s['status'] === 'open' && can('cash.operate') && ((int) $s['user_id'] === (int) \App\Core\Auth::id() || can('cash.approve')); ?>
    <?php if ($canClose): ?><button class="btn btn-primary" type="button" data-open="close-session"><?= icon('lock') ?> Cerrar turno</button><?php endif; ?>
    <?php if ($s['status'] === 'closed' && can('cash.approve')): ?>
      <form method="post" action="<?= e(url('/cash/sessions/' . $s['id'] . '/approve')) ?>" data-confirm="¿Aprobar este cierre?" data-confirm-text="Confirme que revisó el conteo y la diferencia." data-confirm-reason="Observaciones de la revisión" data-confirm-min="0">
        <?= csrf_field() ?><input type="hidden" name="notes" value=""><button class="btn btn-primary" type="submit"><?= icon('check') ?> Aprobar cierre</button></form>
    <?php endif; ?>
  </div>
</div>
<section class="panel mb-3">
  <div class="kpi-strip">
    <div class="kpi is-hero"><div class="kpi-label"><?= icon('banknote') ?>Efectivo esperado</div><div class="kpi-value"><?= e(money($s['expected_cash'] ?? $summary['expected_cash'])) ?></div><div class="kpi-foot">Estado: <?= $s['status'] === 'closed' ? 'por aprobar' : e(strip_tags(status_badge($s['status']))) ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('wallet') ?>Efectivo contado</div><div class="kpi-value"><?= $s['counted_cash'] !== null ? e(money($s['counted_cash'])) : '—' ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('alert') ?>Diferencia</div><div class="kpi-value <?= $diff < 0 ? 'text-danger' : ($diff > 0 ? 'text-warning' : 'text-success') ?>"><?= $s['difference'] !== null ? e(money($s['difference'])) : '—' ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('receipt') ?>Ventas del turno</div><div class="kpi-value"><?= e(money($summary['sales_total'])) ?></div><div class="kpi-foot"><?= (int) $summary['sales_count'] ?> transacciones</div></div>
  </div>
</section>
<div class="grid grid-12" style="align-items:start">
  <div class="span-5 stack">
    <section class="panel"><div class="panel-head"><h2>Resumen de efectivo</h2></div><div class="panel-body">
      <dl class="dl">
        <dt>Fondo inicial</dt><dd><?= e(money($summary['opening'])) ?></dd>
        <dt>Ventas en efectivo (neto de cambio)</dt><dd><?= e(money($summary['cash_sales'])) ?></dd>
        <dt>Entradas</dt><dd><?= e(money($summary['cash_in'])) ?></dd>
        <dt>Salidas</dt><dd>− <?= e(money($summary['cash_out'])) ?></dd>
        <dt>Gastos</dt><dd>− <?= e(money($summary['expenses'])) ?></dd>
        <dt>Reembolsos en efectivo</dt><dd>− <?= e(money($summary['refunds'])) ?></dd>
        <dt>Anulaciones</dt><dd>− <?= e(money($summary['voids'])) ?></dd>
        <dt class="total">Esperado</dt><dd class="total"><?= e(money($summary['expected_cash'])) ?></dd>
      </dl>
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Por medio de pago</h2></div><div class="panel-body" style="padding:12px 0 0">
      <table class="table table-sm"><thead><tr><th>Medio</th><th class="num">Ventas</th><th class="num">Neto</th></tr></thead><tbody>
      <?php foreach ($summary['by_method'] as $m): ?><tr><td><?= e($m['name']) ?></td><td class="num"><?= e(money($m['sales'])) ?></td><td class="num"><strong><?= e(money($m['net'])) ?></strong></td></tr><?php endforeach; ?>
      </tbody></table></div></section>
    <?php if ($count): ?>
    <section class="panel"><div class="panel-head"><h2>Conteo por denominación</h2></div><div class="panel-body">
      <dl class="dl"><?php foreach ($count as $d => $q): ?><dt><?= (int) $q ?> × <?= e(money((string) $d)) ?></dt><dd><?= e(money((string) ((int) $d * (int) $q))) ?></dd><?php endforeach; ?></dl>
    </div></section>
    <?php endif; ?>
    <?php if ($s['closing_notes'] || $s['approval_notes']): ?>
    <section class="panel"><div class="panel-body stack" style="gap:10px">
      <?php if ($s['closing_notes']): ?><div><div class="label">Observaciones del cierre</div><p class="mt-1"><?= e($s['closing_notes']) ?></p></div><?php endif; ?>
      <?php if ($s['approver']): ?><div><div class="label">Aprobado por <?= e($s['approver']) ?> · <?= e(fmt_dt($s['approved_at'])) ?></div><p class="mt-1 muted"><?= e($s['approval_notes'] ?? '') ?></p></div><?php endif; ?>
    </div></section>
    <?php endif; ?>
  </div>
  <section class="panel span-7">
    <div class="panel-head"><div><h2>Movimientos</h2><div class="sub">Registro completo del turno</div></div></div>
    <div class="panel-body" style="padding:12px 0 0">
      <table class="table table-stack table-sm"><thead><tr><th>Hora</th><th>Tipo</th><th>Medio</th><th>Detalle</th><th>Usuario</th><th class="num">Valor</th></tr></thead><tbody>
      <?php foreach ($movements as $m): ?>
        <tr><td data-label="Hora" class="nowrap"><?= e(fmt_dt($m['created_at'], 'd/m H:i')) ?></td><td data-label="Tipo"><?= e($typeLabels[$m['type']] ?? $m['type']) ?></td>
          <td data-label="Medio"><?= e($m['method'] ?? '—') ?></td><td data-label="Detalle"><?= e($m['reason'] ?? '') ?></td><td data-label="Usuario"><?= e($m['user_name']) ?></td>
          <td class="num <?= (float) $m['amount'] < 0 ? 'text-danger' : '' ?>" data-label="Valor"><?= e(money($m['amount'])) ?></td></tr>
      <?php endforeach; ?></tbody></table>
    </div>
  </section>
</div>

<?php if ($canClose): ?>
<dialog class="modal" id="close-session" aria-labelledby="close-session-t">
  <form class="modal-card" method="post" action="<?= e(url('/cash/close')) ?>" data-ajax data-confirm="¿Cerrar el turno de <?= e($s['user_name']) ?>?" data-confirm-text="Un turno cerrado no admite modificaciones; el cierre queda auditado a su nombre.">
    <?= csrf_field() ?><input type="hidden" name="session_id" value="<?= (int) $s['id'] ?>">
    <div class="modal-head"><div><h2 id="close-session-t">Cerrar turno #<?= (int) $s['id'] ?></h2><p><?= e($s['register_name']) ?> · <?= e($s['user_name']) ?>. Efectivo esperado: <strong><?= e(money($summary['expected_cash'])) ?></strong></p></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body stack" style="gap:14px">
      <?php if ((int) $s['user_id'] !== (int) \App\Core\Auth::id()): ?><div class="callout callout-info"><?= icon('info', 'icon-sm') ?><span>Está cerrando el turno de otro cajero como supervisor. Cuente el efectivo físico de la caja.</span></div><?php endif; ?>
      <div class="field"><label for="cs-counted">Efectivo contado<span class="req">*</span></label><input class="input" id="cs-counted" name="counted_cash" inputmode="decimal" required placeholder="Ej. <?= e(\App\Support\Dec::norm($summary['expected_cash'], 0)) ?>"></div>
      <div class="field"><label for="cs-notes">Observaciones</label><textarea class="textarea" id="cs-notes" name="notes" rows="2" maxlength="500" placeholder="Obligatorio si hay diferencia"></textarea></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit"><?= icon('lock') ?> Cerrar turno</button></div>
  </form>
</dialog>
<?php endif; ?>

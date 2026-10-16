<?php
use App\Core\View;
$typeLabels = ['opening' => 'Fondo inicial', 'sale' => 'Venta', 'refund' => 'Reembolso', 'cash_in' => 'Entrada', 'cash_out' => 'Salida', 'expense' => 'Gasto', 'void' => 'Anulación'];
$denoms = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];
?>
<div class="page-head">
  <div><div class="eyebrow">Caja · <?= e($branch['name'] ?? 'Sin sucursal') ?></div><h1><?= $session ? 'Turno abierto' : 'Caja' ?></h1>
    <p><?= $session ? 'Turno #' . (int) $session['id'] . ' en ' . e($session['register_name']) . ' desde las ' . e(fmt_dt($session['opened_at'], 'H:i')) . '.' : 'Abra un turno para registrar ventas y movimientos de efectivo.' ?></p></div>
  <div class="page-actions">
    <a class="btn" href="<?= e(url('/cash/sessions')) ?>"><?= icon('history') ?> Historial de cierres</a>
    <?php if ($session): ?>
      <?php if (can('cash.movements')): ?><button class="btn" type="button" data-open="movement-modal"><?= icon('banknote') ?> Entrada / salida / gasto</button><?php endif; ?>
      <button class="btn btn-primary" type="button" data-open="close-modal"><?= icon('lock') ?> Cerrar turno</button>
    <?php endif; ?>
  </div>
</div>

<?php if (!$session): ?>
  <div class="grid grid-12" style="align-items:start">
    <section class="panel span-5">
      <div class="panel-head"><div><h2>Abrir turno</h2><div class="sub">Cuente el efectivo de base antes de iniciar.</div></div></div>
      <?php if (!$branch || $branch['type'] !== 'store'): ?>
        <div class="panel-body"><div class="callout callout-info"><?= icon('info', 'icon-sm') ?><span>La sucursal activa no es un punto de venta. Cámbiela en el selector de la barra lateral.</span></div></div>
      <?php elseif (!$registers): ?>
        <div class="panel-body"><div class="callout callout-warning"><?= icon('alert', 'icon-sm') ?><span>No hay cajas registradas en esta sucursal.</span></div></div>
      <?php else: ?>
      <form method="post" action="<?= e(url('/cash/open')) ?>" class="panel-body stack" style="gap:14px">
        <?= csrf_field() ?>
        <div class="field"><label for="register_id">Caja</label>
          <select class="select" id="register_id" name="register_id" required>
            <?php foreach ($registers as $r): ?><option value="<?= (int) $r['id'] ?>" <?= $r['busy_by'] ? 'disabled' : '' ?>><?= e($r['name']) ?><?= $r['busy_by'] ? ' — en uso por ' . e($r['busy_by']) : '' ?></option><?php endforeach; ?>
          </select></div>
        <div class="field"><label for="opening_amount">Fondo inicial en efectivo</label>
          <div class="input-group"><span class="icon" style="left:13px;width:auto;font-weight:700;color:var(--muted)">$</span><input class="input" id="opening_amount" name="opening_amount" inputmode="decimal" required value="0"></div></div>
        <button class="btn btn-primary btn-lg" type="submit" <?= can('cash.operate') ? '' : 'disabled' ?>><?= icon('wallet') ?> Abrir turno</button>
      </form>
      <?php endif; ?>
    </section>
    <?php if ($openSessions): ?>
    <section class="panel span-7">
      <div class="panel-head"><div><h2>Turnos en curso y pendientes</h2><div class="sub">Sucursales a su cargo</div></div></div>
      <div class="panel-body" style="padding:12px 0 0">
        <table class="table table-stack"><thead><tr><th>Cajero</th><th>Caja</th><th>Apertura</th><th class="num">Ventas</th><th>Estado</th></tr></thead><tbody>
        <?php foreach ($openSessions as $o): ?>
          <tr class="is-clickable" data-href="<?= e(url('/cash/sessions/' . $o['id'])) ?>">
            <td class="cell-main"><strong><?= e($o['user_name']) ?></strong><div class="muted" style="font-size:12px"><?= e($o['branch_name']) ?></div></td>
            <td data-label="Caja"><?= e($o['register_name']) ?></td>
            <td data-label="Apertura"><?= e(fmt_dt($o['opened_at'])) ?></td>
            <td class="num" data-label="Ventas"><?= e(money($o['sales_total'])) ?></td>
            <td data-label="Estado"><?= $o['status'] === 'closed' ? '<span class="badge badge-warning">Por aprobar</span>' : status_badge('open') ?></td>
          </tr>
        <?php endforeach; ?></tbody></table>
      </div>
    </section>
    <?php endif; ?>
  </div>
<?php else: ?>
  <section class="panel mb-3">
    <div class="kpi-strip">
      <div class="kpi is-hero"><div class="kpi-label"><?= icon('banknote') ?>Efectivo esperado en caja</div><div class="kpi-value"><?= e(money($summary['expected_cash'])) ?></div><div class="kpi-foot">Fondo + ventas en efectivo + entradas − salidas</div></div>
      <div class="kpi"><div class="kpi-label"><?= icon('receipt') ?>Ventas del turno</div><div class="kpi-value"><?= e(money($summary['sales_total'])) ?></div><div class="kpi-foot"><?= (int) $summary['sales_count'] ?> transacciones</div></div>
      <div class="kpi"><div class="kpi-label"><?= icon('wallet') ?>Fondo inicial</div><div class="kpi-value"><?= e(money($summary['opening'])) ?></div></div>
      <div class="kpi"><div class="kpi-label"><?= icon('trend-down') ?>Salidas y gastos</div><div class="kpi-value"><?= e(money(\App\Support\Dec::add($summary['cash_out'], $summary['expenses']))) ?></div><div class="kpi-foot">Reembolsos <?= e(money($summary['refunds'])) ?></div></div>
    </div>
  </section>
  <div class="grid grid-12" style="align-items:start">
    <section class="panel span-5">
      <div class="panel-head"><div><h2>Por medio de pago</h2><div class="sub">Electrónicos pendientes de verificación manual</div></div></div>
      <div class="panel-body" style="padding:12px 0 0">
        <table class="table table-sm"><thead><tr><th>Medio</th><th class="num">Ventas</th><th class="num">Neto</th></tr></thead><tbody>
          <?php foreach ($summary['by_method'] as $m): ?><tr><td><?= e($m['name']) ?></td><td class="num"><?= e(money($m['sales'])) ?></td><td class="num"><strong><?= e(money($m['net'])) ?></strong></td></tr><?php endforeach; ?>
        </tbody></table>
      </div>
    </section>
    <section class="panel span-7">
      <div class="panel-head"><div><h2>Movimientos del turno</h2><div class="sub">Cada movimiento identifica usuario, fecha y motivo</div></div></div>
      <div class="panel-body" style="padding:12px 0 0">
        <table class="table table-stack table-sm"><thead><tr><th>Hora</th><th>Tipo</th><th>Medio</th><th>Detalle</th><th class="num">Valor</th></tr></thead><tbody>
          <?php foreach ($movements as $m): $pos = (float) $m['amount'] >= 0; ?>
            <tr><td data-label="Hora" class="nowrap"><?= e(fmt_dt($m['created_at'], 'H:i')) ?></td>
              <td data-label="Tipo"><?= e($typeLabels[$m['type']] ?? $m['type']) ?></td>
              <td data-label="Medio"><?= e($m['method'] ?? '—') ?></td>
              <td data-label="Detalle"><span class="truncate" style="display:inline-block;max-width:240px"><?= e($m['reason'] ?? '') ?></span></td>
              <td class="num <?= $pos ? '' : 'text-danger' ?>" data-label="Valor"><strong><?= e(money($m['amount'])) ?></strong></td></tr>
          <?php endforeach; ?>
        </tbody></table>
      </div>
    </section>
  </div>

  <?php if (can('cash.movements')): ?>
  <dialog class="modal" id="movement-modal" aria-labelledby="mv-title">
    <form class="modal-card" method="post" action="<?= e(url('/cash/movement')) ?>">
      <?= csrf_field() ?><input type="hidden" name="session_id" value="<?= (int) $session['id'] ?>">
      <div class="modal-head"><div><h2 id="mv-title">Movimiento de efectivo</h2><p>Queda registrado con su usuario, hora y motivo.</p></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
      <div class="modal-body form-grid">
        <div class="field col-12"><span class="label">Tipo</span>
          <div class="segmented"><label><input type="radio" name="type" value="cash_in" checked><span>Entrada</span></label><label><input type="radio" name="type" value="cash_out"><span>Salida</span></label><label><input type="radio" name="type" value="expense"><span>Gasto</span></label></div></div>
        <div class="field col-6"><label for="mv-amount">Valor</label><input class="input" id="mv-amount" name="amount" inputmode="decimal" required></div>
        <div class="field col-6"><label for="mv-cat">Categoría (gastos)</label><input class="input" id="mv-cat" name="category" maxlength="60" placeholder="Aseo, papelería, domicilios…"></div>
        <div class="field col-12"><label for="mv-reason">Motivo</label><input class="input" id="mv-reason" name="reason" required minlength="4" maxlength="255"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Registrar</button></div>
    </form>
  </dialog>
  <?php endif; ?>

  <dialog class="modal modal-lg" id="close-modal" aria-labelledby="close-title">
    <form class="modal-card" method="post" action="<?= e(url('/cash/close')) ?>" data-cash-close data-confirm="¿Cerrar el turno?" data-confirm-text="Un turno cerrado no admite modificaciones; cualquier corrección queda auditada.">
      <?= csrf_field() ?><input type="hidden" name="session_id" value="<?= (int) $session['id'] ?>">
      <div class="modal-head"><div><h2 id="close-title">Cierre de turno</h2><p>Cuente el efectivo físico por denominación. Efectivo esperado: <strong data-expected="<?= e($summary['expected_cash']) ?>"><?= e(money($summary['expected_cash'])) ?></strong></p></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
      <div class="modal-body">
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
          <?php foreach ($denoms as $d): ?>
            <div class="field"><label for="d<?= $d ?>"><?= e(money((string) $d)) ?></label><input class="input input-sm" id="d<?= $d ?>" name="count[<?= $d ?>]" inputmode="numeric" min="0" data-denom="<?= $d ?>" placeholder="0"></div>
          <?php endforeach; ?>
        </div>
        <div class="grid grid-3 mt-3">
          <div class="field"><label for="counted_cash">Total contado</label><input class="input" id="counted_cash" name="counted_cash" inputmode="decimal" required data-counted style="font-weight:700"></div>
          <div class="field"><span class="label">Esperado</span><div class="kpi-value" style="font-size:20px;margin-top:6px"><?= e(money($summary['expected_cash'])) ?></div></div>
          <div class="field"><span class="label">Diferencia</span><div class="kpi-value" style="font-size:20px;margin-top:6px" data-diff>—</div></div>
        </div>
        <div class="field mt-3"><label for="close-notes">Observaciones</label><textarea class="textarea" id="close-notes" name="notes" rows="2" maxlength="500" placeholder="Obligatorio si hay diferencia"></textarea></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit"><?= icon('lock') ?> Cerrar turno</button></div>
    </form>
  </dialog>
  <script src="<?= e(asset('js/cash.js')) ?>" defer></script>
<?php endif; ?>

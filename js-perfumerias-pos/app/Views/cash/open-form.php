<?php
/**
 * Formulario de apertura de turno compartido por el POS y la pantalla de Caja.
 * Explica por qué no se puede abrir (turno en otra sucursal, cajas ocupadas)
 * y ofrece la salida correspondiente según los permisos del usuario.
 *
 * @var array $registers  cajas activas de la sucursal con busy_* del turno que las ocupa
 * @var ?array $elsewhere turno abierto del usuario en otra sucursal
 * @var bool $ajax
 */
$ajax ??= false;
$free = array_values(array_filter($registers, fn ($r) => !$r['busy_session_id']));
$busy = array_values(array_filter($registers, fn ($r) => (bool) $r['busy_session_id']));
$myId = (int) \App\Core\Auth::id();
?>
<?php if (!can('cash.operate')): ?>
  <div class="callout callout-warning"><?= icon('alert', 'icon-sm') ?><span>Su usuario no tiene permiso para abrir caja. Pida al administrador que le asigne el permiso «Operar caja».</span></div>
<?php elseif ($elsewhere): ?>
  <div class="callout callout-warning"><?= icon('alert', 'icon-sm') ?><span>Usted ya tiene un turno abierto en <strong><?= e($elsewhere['branch_name']) ?></strong> · <?= e($elsewhere['register_name']) ?> desde <?= e(fmt_dt($elsewhere['opened_at'], 'd/m H:i')) ?>. Ciérrelo o cambie a esa sucursal para seguir vendiendo.</span></div>
  <form method="post" action="<?= e(url('/branch/switch')) ?>">
    <?= csrf_field() ?><button class="btn btn-primary btn-block" type="submit" name="branch_id" value="<?= (int) $elsewhere['branch_id'] ?>"><?= icon('store') ?> Ir a <?= e($elsewhere['branch_name']) ?></button>
  </form>
<?php elseif (!$registers): ?>
  <div class="callout callout-warning"><?= icon('alert', 'icon-sm') ?><span>Esta sucursal no tiene cajas registradas.</span></div>
  <?php if (can('branches.manage')): ?><a class="btn btn-block" href="<?= e(url('/branches')) ?>"><?= icon('plus') ?> Agregar caja en Sucursales</a><?php endif; ?>
<?php else: ?>
  <?php if ($busy): ?>
    <div class="stack" style="gap:8px">
      <?php foreach ($busy as $r): $mine = (int) $r['busy_user_id'] === $myId; ?>
        <div class="callout <?= $free ? 'callout-info' : 'callout-warning' ?>" style="align-items:center">
          <?= icon('lock', 'icon-sm') ?>
          <span style="flex:1"><strong><?= e($r['name']) ?></strong> está en uso por <?= e($mine ? 'usted' : $r['busy_by']) ?> desde <?= e(fmt_dt($r['busy_since'], 'd/m H:i')) ?>.</span>
          <?php if ($mine || can('cash.approve')): ?><a class="btn btn-sm" href="<?= e(url('/cash/sessions/' . $r['busy_session_id'])) ?>"><?= $mine ? 'Ver turno' : 'Ver / cerrar' ?></a><?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
  <?php if ($free): ?>
    <form method="post" action="<?= e(url('/cash/open')) ?>" class="stack" style="gap:14px" <?= $ajax ? 'data-ajax data-reload' : '' ?>>
      <?= csrf_field() ?>
      <div class="field"><label for="register_id">Caja</label>
        <select class="select" id="register_id" name="register_id" required>
          <?php foreach ($free as $i => $r): ?><option value="<?= (int) $r['id'] ?>" <?= $i === 0 ? 'selected' : '' ?>><?= e($r['name']) ?></option><?php endforeach; ?>
        </select></div>
      <div class="field"><label for="opening_amount">Fondo inicial en efectivo</label>
        <div class="input-group"><span class="icon" style="left:13px;width:auto;font-weight:700;color:var(--muted)">$</span><input class="input" id="opening_amount" name="opening_amount" inputmode="decimal" required value="0"></div></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit"><?= icon('wallet') ?> Abrir caja</button>
    </form>
  <?php else: ?>
    <p class="muted" style="font-size:13px">Todas las cajas de esta sucursal están ocupadas.
      <?= can('cash.approve') ? 'Cierre el turno pendiente' : 'Pida al cajero o al administrador que cierre el turno pendiente' ?><?= can('branches.manage') ? ' o agregue otra caja.' : '.' ?></p>
    <?php if (can('branches.manage')): ?><a class="btn btn-block" href="<?= e(url('/branches')) ?>"><?= icon('plus') ?> Agregar otra caja</a><?php endif; ?>
  <?php endif; ?>
<?php endif; ?>

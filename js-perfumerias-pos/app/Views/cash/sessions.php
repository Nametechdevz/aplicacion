<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Caja</div><h1>Cierres de caja</h1><p>Total esperado, contado y diferencia de cada turno.</p></div>
</div>
<section class="panel">
  <form class="toolbar" method="get" data-autosubmit>
    <?php if (count($branches) > 1): ?>
    <select class="select" name="branch" aria-label="Sucursal"><option value="">Todas las sucursales</option>
      <?php foreach ($branches as $b): ?><option value="<?= (int) $b['id'] ?>" <?= (int) $branch === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select>
    <?php endif; ?>
    <select class="select" name="status" aria-label="Estado"><option value="">Todos los estados</option>
      <?php foreach (['open' => 'Abiertos', 'closed' => 'Por aprobar', 'approved' => 'Aprobados'] as $k => $l): ?><option value="<?= $k ?>" <?= $status === $k ? 'selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select>
  </form>
  <?php if (!$rows): ?><?= View::partial('partials/empty', ['title' => 'Sin turnos', 'text' => 'No hay turnos de caja con esos filtros.']) ?><?php else: ?>
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Turno</th><th>Cajero</th><th>Apertura</th><th>Cierre</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Estado</th></tr></thead>
    <tbody><?php foreach ($rows as $r): $diff = (float) ($r['difference'] ?? 0); ?>
      <tr class="is-clickable" data-href="<?= e(url('/cash/sessions/' . $r['id'])) ?>">
        <td class="cell-main"><strong>#<?= (int) $r['id'] ?> · <?= e($r['register_name']) ?></strong><div class="muted" style="font-size:12px"><?= e($r['branch_name']) ?></div></td>
        <td data-label="Cajero"><?= e($r['user_name']) ?></td>
        <td data-label="Apertura" class="nowrap"><?= e(fmt_dt($r['opened_at'])) ?></td>
        <td data-label="Cierre" class="nowrap"><?= e(fmt_dt($r['closed_at'])) ?></td>
        <td class="num" data-label="Esperado"><?= $r['expected_cash'] !== null ? e(money($r['expected_cash'])) : '—' ?></td>
        <td class="num" data-label="Contado"><?= $r['counted_cash'] !== null ? e(money($r['counted_cash'])) : '—' ?></td>
        <td class="num <?= $diff < 0 ? 'text-danger' : ($diff > 0 ? 'text-warning' : '') ?>" data-label="Diferencia"><strong><?= $r['difference'] !== null ? e(money($r['difference'])) : '—' ?></strong></td>
        <td data-label="Estado"><?= $r['status'] === 'closed' ? '<span class="badge badge-warning">Por aprobar</span>' : status_badge($r['status']) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

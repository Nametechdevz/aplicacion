<div class="page-head">
  <div><div class="eyebrow">Inventario · <?= e($branch['name']) ?></div><h1>Conteo físico</h1><p>Registre solo lo que contó. El sistema calcula la diferencia contra la existencia y genera los ajustes con un documento de conteo.</p></div>
</div>
<?php if (count($branches) > 1): ?>
<nav class="tabs panel mb-3" style="border-radius:var(--radius-lg)"><?php foreach ($branches as $b): ?><a href="<?= e(url('/inventory/count', ['branch' => $b['id']])) ?>" class="<?= (int) $b['id'] === (int) $branch['id'] ? 'is-active' : '' ?>"><?= e($b['name']) ?></a><?php endforeach; ?></nav>
<?php endif; ?>
<form method="post" action="<?= e(url('/inventory/count')) ?>" class="panel" data-confirm="¿Aplicar el conteo?" data-confirm-text="Las diferencias se registrarán como movimientos de conteo con su usuario.">
  <?= csrf_field() ?><input type="hidden" name="branch_id" value="<?= (int) $branch['id'] ?>">
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Producto</th><th class="num">Según sistema</th><th>Contado</th></tr></thead>
    <tbody><?php foreach ($rows as $r): ?>
      <tr><td class="cell-main"><strong><?= e($r['name']) ?></strong><div class="muted" style="font-size:12px"><?= e($r['code']) ?></div></td>
        <td class="num" data-label="Sistema"><?= e(qty($r['quantity'], $r['unit'])) ?></td>
        <td data-label="Contado"><div class="input-group has-addon"><input class="input input-sm" name="counted[<?= (int) $r['id'] ?>]" inputmode="decimal" style="width:140px" aria-label="Contado de <?= e($r['name']) ?>"><span class="addon"><?= e($r['unit']) ?></span></div></td></tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <div class="form-actions"><input class="input" name="notes" maxlength="255" placeholder="Observaciones del conteo" style="max-width:360px;margin-right:auto"><a class="btn btn-ghost" href="<?= e(url('/inventory', ['branch' => $branch['id']])) ?>">Cancelar</a><button class="btn btn-primary" type="submit">Aplicar conteo</button></div>
</form>

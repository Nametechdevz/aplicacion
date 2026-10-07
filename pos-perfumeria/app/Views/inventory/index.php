<div class="row g-3 mb-3">
    <div class="col-6 col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">Referencias</div><div class="fs-5 fw-bold"><?= num($totals['n']) ?></div></div></div></div>
    <div class="col-6 col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">Unidades</div><div class="fs-5 fw-bold"><?= num($totals['units']) ?></div></div></div></div>
    <?php if (is_admin()): ?>
    <div class="col-6 col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">Valor al costo</div><div class="fs-5 fw-bold"><?= money($totals['cost_value']) ?></div></div></div></div>
    <?php endif; ?>
    <div class="col-6 col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">Valor a precio de venta</div><div class="fs-5 fw-bold"><?= money($totals['price_value']) ?></div></div></div></div>
</div>
<div class="d-flex flex-wrap gap-2 mb-3">
    <?php foreach (['' => 'Todos', 'low' => 'Stock bajo', 'out' => 'Agotados'] as $k => $l): ?>
        <a href="<?= url('/inventory', $k ? ['filter' => $k] : []) ?>" class="btn btn-sm <?= (string) input('filter', '') === $k ? 'btn-primary' : 'btn-outline-primary' ?>"><?= $l ?></a>
    <?php endforeach; ?>
    <form class="d-flex gap-2" method="get"><input type="hidden" name="filter" value="<?= e(input('filter', '')) ?>"><input name="q" class="form-control form-control-sm" placeholder="Buscar" value="<?= e(input('q', '')) ?>"></form>
    <div class="ms-auto d-flex gap-2">
        <a href="<?= url('/inventory/kardex') ?>" class="btn btn-sm btn-outline-secondary"><i class="bi bi-clock-history"></i> Kárdex</a>
        <?php if (is_admin()): ?>
            <a href="<?= url('/inventory/adjust') ?>" class="btn btn-sm btn-outline-primary"><i class="bi bi-sliders"></i> Ajuste</a>
            <a href="<?= url('/purchases/create') ?>" class="btn btn-sm btn-primary"><i class="bi bi-truck"></i> Registrar compra</a>
        <?php endif; ?>
    </div>
</div>
<div class="card">
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Producto</th><th>Código</th><th class="text-center">Stock</th><th class="text-center">Mínimo</th><th class="text-center">Vendidos 30d</th><th class="text-center">Días de inventario</th><?php if (is_admin()): ?><th class="text-end">Valor costo</th><?php endif; ?><th></th></tr></thead>
            <tbody>
            <?php foreach ($rows as $r):
                $days = $r['sold30'] > 0 ? round($r['stock'] / ($r['sold30'] / 30)) : null; ?>
                <tr>
                    <td><span class="fw-semibold"><?= e($r['name']) ?></span> <small class="text-muted"><?= e($r['brand']) ?> <?= e($r['concentration']) ?> <?= $r['size_ml'] ? (int) $r['size_ml'] . 'ml' : '' ?></small></td>
                    <td class="small"><?= e($r['code']) ?></td>
                    <td class="text-center"><span class="badge <?= $r['stock'] <= 0 ? 'text-bg-danger' : ($r['stock'] <= $r['min_stock'] ? 'text-bg-warning' : 'text-bg-success') ?> fs-6"><?= (int) $r['stock'] ?></span></td>
                    <td class="text-center"><?= (int) $r['min_stock'] ?></td>
                    <td class="text-center"><?= (int) $r['sold30'] ?></td>
                    <td class="text-center"><?= $days === null ? '—' : $days . ' d' ?></td>
                    <?php if (is_admin()): ?><td class="text-end"><?= money(max(0, $r['stock']) * $r['cost']) ?></td><?php endif; ?>
                    <td class="text-end text-nowrap">
                        <a href="<?= url('/inventory/kardex', ['product_id' => $r['id']]) ?>" class="btn btn-sm btn-light" title="Kárdex"><i class="bi bi-clock-history"></i></a>
                        <?php if (is_admin()): ?><a href="<?= url('/inventory/adjust', ['product_id' => $r['id']]) ?>" class="btn btn-sm btn-light" title="Ajustar"><i class="bi bi-sliders"></i></a><?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$rows): ?><tr><td colspan="8" class="text-center text-muted py-4">Sin resultados.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

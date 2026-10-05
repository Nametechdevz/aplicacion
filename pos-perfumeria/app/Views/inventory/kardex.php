<?php $types = ['compra' => ['Compra', 'success'], 'venta' => ['Venta', 'primary'], 'devolucion' => ['Devolución', 'info'], 'ajuste_entrada' => ['Ajuste +', 'success'], 'ajuste_salida' => ['Ajuste −', 'danger'], 'inicial' => ['Inicial', 'secondary']]; ?>
<form class="card mb-3" method="get"><div class="card-body row g-2 align-items-end">
    <div class="col-md-4"><label class="form-label small">Producto</label>
        <select name="product_id" class="form-select"><option value="">Todos</option>
            <?php foreach ($products as $p): ?><option value="<?= $p['id'] ?>" <?= $product && $product['id'] == $p['id'] ? 'selected' : '' ?>><?= e($p['name']) ?> <?= $p['size_ml'] ? (int) $p['size_ml'] . 'ml' : '' ?> (<?= e($p['code']) ?>)</option><?php endforeach; ?>
        </select></div>
    <div class="col-6 col-md-2"><label class="form-label small">Tipo</label><select name="type" class="form-select"><option value="">Todos</option><?php foreach ($types as $k => $t): ?><option value="<?= $k ?>" <?= input('type') === $k ? 'selected' : '' ?>><?= $t[0] ?></option><?php endforeach; ?></select></div>
    <div class="col-6 col-md-2"><label class="form-label small">Desde</label><input type="date" name="from" class="form-control" value="<?= e($from) ?>"></div>
    <div class="col-6 col-md-2"><label class="form-label small">Hasta</label><input type="date" name="to" class="form-control" value="<?= e($to) ?>"></div>
    <div class="col-6 col-md-2 d-grid"><button class="btn btn-primary">Filtrar</button></div>
</div></form>
<?php if ($product): ?><div class="alert alert-light"><b><?= e($product['name']) ?></b> · Stock actual: <b><?= (int) $product['stock'] ?></b> · Costo promedio: <?= money($product['cost']) ?></div><?php endif; ?>
<div class="card">
    <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
            <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Referencia</th><th class="text-end">Cantidad</th><th class="text-end">Saldo</th><th class="text-end">Costo unit.</th><th>Usuario</th><th>Nota</th></tr></thead>
            <tbody>
            <?php foreach ($rows as $r): $t = $types[$r['type']] ?? [$r['type'], 'secondary']; ?>
                <tr>
                    <td class="small"><?= fdate($r['created_at'], 'd/m/Y H:i') ?></td>
                    <td><?= e($r['product']) ?></td>
                    <td><span class="badge text-bg-<?= $t[1] ?>"><?= $t[0] ?></span></td>
                    <td class="small"><?= e($r['reference']) ?></td>
                    <td class="text-end fw-semibold <?= $r['qty'] > 0 ? 'text-success' : 'text-danger' ?>"><?= $r['qty'] > 0 ? '+' : '' ?><?= (int) $r['qty'] ?></td>
                    <td class="text-end"><?= (int) $r['stock_after'] ?></td>
                    <td class="text-end small"><?= is_admin() ? money($r['unit_cost']) : '—' ?></td>
                    <td class="small"><?= e($r['user_name']) ?></td>
                    <td class="small text-muted"><?= e($r['note']) ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$rows): ?><tr><td colspan="9" class="text-center text-muted py-4">Sin movimientos en el periodo.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

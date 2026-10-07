<div class="d-flex flex-wrap gap-2 mb-3">
    <a href="<?= url('/sales/' . $sale['id'] . '/ticket') ?>" target="_blank" class="btn btn-outline-primary"><i class="bi bi-receipt"></i> Ticket 80mm</a>
    <a href="<?= url('/sales/' . $sale['id'] . '/invoice') ?>" target="_blank" class="btn btn-outline-primary"><i class="bi bi-file-earmark-text"></i> Formato carta / PDF</a>
    <?php if ($edoc): ?><a href="<?= url('/edocs/' . $edoc['id'] . '/xml') ?>" class="btn btn-outline-secondary"><i class="bi bi-filetype-xml"></i> XML</a><?php endif; ?>
    <?php if (is_admin() && $sale['status'] !== 'anulada'): ?>
        <a href="<?= url('/sales/' . $sale['id'] . '/return') ?>" class="btn btn-outline-danger ms-auto"><i class="bi bi-arrow-counterclockwise"></i> Devolución / Anular</a>
    <?php endif; ?>
</div>

<div class="row g-3">
    <div class="col-lg-8">
        <div class="card">
            <div class="card-header d-flex justify-content-between">
                <span>Detalle</span>
                <?php $map = ['completada' => 'success', 'devolucion_parcial' => 'warning', 'anulada' => 'danger']; ?>
                <span class="badge text-bg-<?= $map[$sale['status']] ?>"><?= e(str_replace('_', ' ', $sale['status'])) ?></span>
            </div>
            <div class="table-responsive">
                <table class="table mb-0 align-middle">
                    <thead><tr><th>Producto</th><th class="text-center">Cant.</th><th class="text-end">Precio</th><th class="text-end">Desc.</th><th class="text-end">IVA</th><th class="text-end">Total</th></tr></thead>
                    <tbody>
                    <?php foreach ($items as $it): ?>
                        <tr>
                            <td><?= e($it['description']) ?><br><small class="text-muted"><?= e($it['code']) ?></small>
                                <?php if ($it['returned_qty'] > 0): ?><span class="badge text-bg-warning">Devuelto: <?= (int) $it['returned_qty'] ?></span><?php endif; ?></td>
                            <td class="text-center"><?= (int) $it['qty'] ?></td>
                            <td class="text-end"><?= money($it['unit_price']) ?></td>
                            <td class="text-end"><?= (float) $it['discount_pct'] > 0 ? num($it['discount_pct'], 1) . '%' : '—' ?></td>
                            <td class="text-end"><?= num($it['tax_rate']) ?>%</td>
                            <td class="text-end fw-semibold"><?= money($it['total']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                    <tfoot>
                        <tr><td colspan="5" class="text-end">Subtotal (base)</td><td class="text-end"><?= money($sale['subtotal']) ?></td></tr>
                        <tr><td colspan="5" class="text-end">IVA</td><td class="text-end"><?= money($sale['tax_total']) ?></td></tr>
                        <?php if ($sale['discount_total'] > 0): ?><tr><td colspan="5" class="text-end text-success">Descuentos aplicados</td><td class="text-end text-success"><?= money($sale['discount_total']) ?></td></tr><?php endif; ?>
                        <tr><td colspan="5" class="text-end fw-bold fs-5">Total</td><td class="text-end fw-bold fs-5"><?= money($sale['total']) ?></td></tr>
                    </tfoot>
                </table>
            </div>
        </div>
        <?php if ($creditNotes): ?>
        <div class="card mt-3">
            <div class="card-header">Notas crédito asociadas</div>
            <ul class="list-group list-group-flush">
                <?php foreach ($creditNotes as $cn): ?>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        <span><a href="<?= url('/credit-notes/' . $cn['id']) ?>" target="_blank"><?= e($cn['full_number']) ?></a> · <?= fdate($cn['issued_at'], 'd/m/Y H:i') ?> · <?= e($cn['reason_text']) ?></span>
                        <span><?= money($cn['total']) ?> <?= edoc_badge($cn['edoc_status']) ?></span>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php endif; ?>
    </div>
    <div class="col-lg-4">
        <div class="card mb-3"><div class="card-body small">
            <dl class="row mb-0">
                <dt class="col-5">Documento</dt><dd class="col-7"><?= e($sale['full_number']) ?> (<?= $sale['doc_type'] === 'FEV' ? 'Factura electrónica' : 'Doc. equivalente POS' ?>)</dd>
                <dt class="col-5">Fecha</dt><dd class="col-7"><?= fdate($sale['issued_at'], 'd/m/Y h:i a') ?></dd>
                <dt class="col-5">Cajero</dt><dd class="col-7"><?= e($sale['cashier']) ?></dd>
                <dt class="col-5">Cliente</dt><dd class="col-7"><a href="<?= url('/customers/' . $customer['id']) ?>"><?= e($customer['name']) ?></a><br><?= e(doc_type_short($customer['doc_type'])) ?> <?= e($customer['doc_number']) ?></dd>
                <?php if ($sale['notes']): ?><dt class="col-5">Notas</dt><dd class="col-7"><?= e($sale['notes']) ?></dd><?php endif; ?>
            </dl>
        </div></div>
        <div class="card mb-3"><div class="card-header">Pagos</div>
            <ul class="list-group list-group-flush">
                <?php foreach ($payments as $p): ?>
                    <li class="list-group-item d-flex justify-content-between"><span><?= e(payment_label($p['method'])) ?> <small class="text-muted"><?= e($p['reference']) ?></small></span><span><?= money($p['amount']) ?></span></li>
                <?php endforeach; ?>
                <?php if ($sale['change_amount'] > 0): ?><li class="list-group-item d-flex justify-content-between text-muted"><span>Cambio</span><span><?= money($sale['change_amount']) ?></span></li><?php endif; ?>
            </ul>
        </div>
        <div class="card"><div class="card-header d-flex justify-content-between">Facturación electrónica <?= edoc_badge($edoc['status'] ?? null) ?></div>
            <div class="card-body small">
                <?php if ($edoc): ?>
                    <div class="mb-1"><strong><?= $sale['doc_type'] === 'FEV' ? 'CUFE' : 'CUDE' ?>:</strong> <span class="mono"><?= e($edoc['uuid']) ?></span></div>
                    <div class="mb-1"><strong>Ambiente:</strong> <?= $edoc['environment'] === '1' ? 'Producción' : 'Pruebas' ?> · <strong>Conector:</strong> <?= e($edoc['driver']) ?> · <strong>Intentos:</strong> <?= (int) $edoc['attempts'] ?></div>
                    <?php if ($edoc['track_id']): ?><div class="mb-1"><strong>Track ID:</strong> <?= e($edoc['track_id']) ?></div><?php endif; ?>
                    <div class="text-muted"><?= nl2br(e($edoc['response'])) ?></div>
                    <?php if ($edoc['status'] !== 'aceptado'): ?>
                        <form method="post" action="<?= url('/edocs/' . $edoc['id'] . '/retry') ?>" class="mt-2"><?= csrf_field() ?><button class="btn btn-sm btn-warning"><i class="bi bi-arrow-repeat"></i> Reintentar envío</button></form>
                    <?php endif; ?>
                <?php else: ?>
                    <span class="text-muted">No se generó documento electrónico.</span>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

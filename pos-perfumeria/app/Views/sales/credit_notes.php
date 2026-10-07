<div class="card">
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Nota crédito</th><th>Fecha</th><th>Venta</th><th>Cliente</th><th>Motivo</th><th>Reembolso</th><th class="text-end">Total</th><th>DIAN</th></tr></thead>
            <tbody>
            <?php foreach ($notes as $n): ?>
                <tr>
                    <td><a href="<?= url('/credit-notes/' . $n['id']) ?>" target="_blank" class="fw-semibold"><?= e($n['full_number']) ?></a></td>
                    <td><?= fdate($n['issued_at'], 'd/m/Y H:i') ?></td>
                    <td><a href="<?= url('/sales/' . $n['sale_id']) ?>"><?= e($n['sale_number']) ?></a></td>
                    <td><?= e($n['customer']) ?></td>
                    <td class="small"><?= e($n['reason_text']) ?></td>
                    <td class="small"><?= e(payment_label($n['refund_method'])) ?></td>
                    <td class="text-end"><?= money($n['total']) ?></td>
                    <td><?= edoc_badge($n['edoc_status']) ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$notes): ?><tr><td colspan="8" class="text-center text-muted py-4">No hay devoluciones registradas. Se crean desde el detalle de una venta.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

<form class="card mb-3" method="get"><div class="card-body row g-2 align-items-end">
    <div class="col-6 col-md-2"><label class="form-label small">Desde</label><input type="date" name="from" class="form-control" value="<?= e($from) ?>"></div>
    <div class="col-6 col-md-2"><label class="form-label small">Hasta</label><input type="date" name="to" class="form-control" value="<?= e($to) ?>"></div>
    <div class="col-md-3"><label class="form-label small">Buscar</label><input name="q" class="form-control" placeholder="Número, cliente o documento" value="<?= e(input('q', '')) ?>"></div>
    <div class="col-6 col-md-1"><label class="form-label small">Tipo</label>
        <select name="doc_type" class="form-select"><option value="">Todos</option><option value="POS" <?= input('doc_type') === 'POS' ? 'selected' : '' ?>>POS</option><option value="FEV" <?= input('doc_type') === 'FEV' ? 'selected' : '' ?>>Factura</option></select></div>
    <div class="col-6 col-md-2"><label class="form-label small">Estado</label>
        <select name="status" class="form-select"><option value="">Todos</option>
            <?php foreach (['completada' => 'Completada', 'devolucion_parcial' => 'Devolución parcial', 'anulada' => 'Anulada'] as $k => $l): ?><option value="<?= $k ?>" <?= input('status') === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach; ?></select></div>
    <?php if ($users): ?>
    <div class="col-6 col-md-1"><label class="form-label small">Cajero</label>
        <select name="user_id" class="form-select"><option value="">Todos</option><?php foreach ($users as $u): ?><option value="<?= $u['id'] ?>" <?= (int) input('user_id') === (int) $u['id'] ? 'selected' : '' ?>><?= e($u['name']) ?></option><?php endforeach; ?></select></div>
    <?php endif; ?>
    <div class="col-6 col-md-1 d-grid"><button class="btn btn-primary"><i class="bi bi-funnel"></i></button></div>
</div></form>

<div class="row g-3 mb-3">
    <div class="col-4"><div class="card"><div class="card-body py-2"><div class="small text-muted">Ventas</div><div class="fs-5 fw-bold"><?= num($sum['n']) ?></div></div></div></div>
    <div class="col-4"><div class="card"><div class="card-body py-2"><div class="small text-muted">Total</div><div class="fs-5 fw-bold"><?= money($sum['total']) ?></div></div></div></div>
    <div class="col-4"><div class="card"><div class="card-body py-2"><div class="small text-muted">IVA</div><div class="fs-5 fw-bold"><?= money($sum['tax']) ?></div></div></div></div>
</div>

<div class="card">
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Documento</th><th>Fecha</th><th>Cliente</th><th>Cajero</th><th>Estado</th><th class="text-end">Total</th><th>DIAN</th><th></th></tr></thead>
            <tbody>
            <?php foreach ($sales as $s): ?>
                <tr>
                    <td><a href="<?= url('/sales/' . $s['id']) ?>" class="fw-semibold text-decoration-none"><?= e($s['full_number']) ?></a> <span class="badge text-bg-light"><?= e($s['doc_type']) ?></span></td>
                    <td><?= fdate($s['issued_at'], 'd/m/Y H:i') ?></td>
                    <td><?= e($s['customer']) ?></td>
                    <td class="small"><?= e($s['cashier']) ?></td>
                    <td><?php $map = ['completada' => 'success', 'devolucion_parcial' => 'warning', 'anulada' => 'danger']; ?><span class="badge text-bg-<?= $map[$s['status']] ?>"><?= e(str_replace('_', ' ', $s['status'])) ?></span></td>
                    <td class="text-end fw-semibold"><?= money($s['total']) ?></td>
                    <td><?= edoc_badge($s['edoc_status']) ?></td>
                    <td class="text-end text-nowrap">
                        <a class="btn btn-sm btn-light" target="_blank" href="<?= url('/sales/' . $s['id'] . '/' . ($s['doc_type'] === 'FEV' ? 'invoice' : 'ticket')) ?>" title="Imprimir"><i class="bi bi-printer"></i></a>
                    </td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$sales): ?><tr><td colspan="8" class="text-center text-muted py-4">No hay ventas en el rango seleccionado.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

<div class="row g-3">
    <div class="col-lg-4">
        <div class="card"><div class="card-body">
            <h5 class="mb-1"><?= e($c['name']) ?></h5>
            <div class="text-muted mb-3"><?= e(doc_types()[$c['doc_type']] ?? $c['doc_type']) ?> <?= e($c['doc_number']) ?><?= $c['dv'] !== null && $c['dv'] !== '' ? '-' . e($c['dv']) : '' ?></div>
            <dl class="small mb-0">
                <dt>Correo</dt><dd><?= e($c['email'] ?: '—') ?></dd>
                <dt>Teléfono</dt><dd><?= e($c['phone'] ?: '—') ?>
                    <?php if ($c['phone']): ?><a class="ms-1" target="_blank" href="https://wa.me/57<?= e(preg_replace('/\D/', '', $c['phone'])) ?>"><i class="bi bi-whatsapp text-success"></i></a><?php endif; ?></dd>
                <dt>Dirección</dt><dd><?= e(trim(($c['address'] ?? '') . ' · ' . ($c['city_name'] ?? ''), ' ·')) ?: '—' ?></dd>
                <dt>Régimen</dt><dd><?= $c['tax_regime'] === '48' ? 'Responsable de IVA' : 'No responsable de IVA' ?> · <?= e($c['tax_responsibilities']) ?></dd>
                <?php if ($c['birthday']): ?><dt>Cumpleaños</dt><dd><?= fdate($c['birthday'], 'd/m') ?></dd><?php endif; ?>
                <?php if ($c['notes']): ?><dt>Notas</dt><dd><?= e($c['notes']) ?></dd><?php endif; ?>
            </dl>
            <?php if ($c['id'] != 1): ?><a href="<?= url('/customers/' . $c['id'] . '/edit') ?>" class="btn btn-sm btn-outline-primary mt-3"><i class="bi bi-pencil"></i> Editar</a><?php endif; ?>
        </div></div>
        <?php if ($favorites): ?>
        <div class="card mt-3"><div class="card-header">Fragancias favoritas</div>
            <ul class="list-group list-group-flush">
            <?php foreach ($favorites as $f): ?><li class="list-group-item d-flex justify-content-between"><?= e($f['description']) ?><span class="badge text-bg-light"><?= (int) $f['qty'] ?></span></li><?php endforeach; ?>
            </ul>
        </div>
        <?php endif; ?>
    </div>
    <div class="col-lg-8">
        <div class="card"><div class="card-header">Historial de compras</div>
            <div class="table-responsive"><table class="table table-hover mb-0">
                <thead><tr><th>Documento</th><th>Fecha</th><th>Estado</th><th class="text-end">Total</th><th>DIAN</th></tr></thead>
                <tbody>
                <?php foreach ($sales as $s): ?>
                    <tr onclick="location='<?= url('/sales/' . $s['id']) ?>'" style="cursor:pointer">
                        <td><?= e($s['full_number']) ?></td><td><?= fdate($s['issued_at'], 'd/m/Y H:i') ?></td>
                        <td><?= e(str_replace('_', ' ', $s['status'])) ?></td><td class="text-end"><?= money($s['total']) ?></td><td><?= edoc_badge($s['edoc_status']) ?></td>
                    </tr>
                <?php endforeach; ?>
                <?php if (!$sales): ?><tr><td colspan="5" class="text-muted text-center py-3">Sin compras registradas.</td></tr><?php endif; ?>
                </tbody>
            </table></div>
        </div>
    </div>
</div>

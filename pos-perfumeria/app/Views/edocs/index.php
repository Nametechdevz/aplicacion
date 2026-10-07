<?php $drv = setting('dian_driver', 'simulacion'); ?>
<?php if ($drv === 'simulacion'): ?>
<div class="alert alert-warning">
    <i class="bi bi-info-circle"></i> El sistema está en <b>modo simulación</b>: los documentos se generan (XML UBL 2.1, CUFE/CUDE y QR) pero <b>no se envían a la DIAN</b>.
    <?php if (is_admin()): ?>Cuando tengas tu proveedor tecnológico, actívalo en <a href="<?= url('/settings#dian') ?>">Configuración → Facturación electrónica</a>.<?php endif; ?>
</div>
<?php endif; ?>
<div class="d-flex flex-wrap gap-2 mb-3 align-items-center">
    <?php
    $tabs = ['' => 'Todos', 'aceptado' => 'Aceptados', 'problemas' => 'Con problemas'];
    foreach ($tabs as $k => $l): ?>
        <a href="<?= url('/edocs', $k ? ['status' => $k] : []) ?>" class="btn btn-sm <?= $status === $k ? 'btn-primary' : 'btn-outline-primary' ?>"><?= $l ?>
            <?php if ($k === 'aceptado'): ?><span class="badge text-bg-light"><?= (int) ($counts['aceptado'] ?? 0) ?></span><?php endif; ?>
            <?php if ($k === 'problemas'): ?><span class="badge text-bg-light"><?= (int) (($counts['error'] ?? 0) + ($counts['rechazado'] ?? 0) + ($counts['pendiente'] ?? 0)) ?></span><?php endif; ?>
        </a>
    <?php endforeach; ?>
    <form class="d-flex gap-2 ms-auto" method="get">
        <input type="hidden" name="status" value="<?= e($status) ?>">
        <input name="q" class="form-control form-control-sm" placeholder="Número o CUFE" value="<?= e(input('q', '')) ?>">
    </form>
    <?php if (is_admin()): ?>
    <form method="post" action="<?= url('/edocs/retry-all') ?>" data-confirm="¿Reenviar todos los documentos con error o pendientes?"><?= csrf_field() ?><button class="btn btn-sm btn-warning"><i class="bi bi-arrow-repeat"></i> Reenviar pendientes</button></form>
    <?php endif; ?>
</div>
<div class="card">
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th class="text-end">Valor</th><th>CUFE / CUDE</th><th>Estado</th><th>Respuesta</th><th></th></tr></thead>
            <tbody>
            <?php foreach ($docs as $d): ?>
                <tr>
                    <td><a href="<?= url('/sales/' . $d['link_sale_id']) ?>" class="fw-semibold"><?= e($d['full_number']) ?></a></td>
                    <td><?= ['FEV' => 'Factura', 'POS' => 'Doc. POS', 'NC' => 'Nota crédito'][$d['doc_kind']] ?></td>
                    <td class="small"><?= fdate($d['issued_at'], 'd/m/Y H:i') ?></td>
                    <td class="text-end"><?= money($d['total']) ?></td>
                    <td><span class="mono small" title="<?= e($d['uuid']) ?>"><?= e(substr($d['uuid'], 0, 16)) ?>…</span></td>
                    <td><?= edoc_badge($d['status']) ?><br><small class="text-muted"><?= $d['environment'] === '1' ? 'Producción' : 'Pruebas' ?> · <?= e($d['driver']) ?></small></td>
                    <td class="small text-muted" style="max-width:280px"><?= e(mb_substr((string) $d['response'], 0, 160)) ?></td>
                    <td class="text-end text-nowrap">
                        <a href="<?= url('/edocs/' . $d['id'] . '/xml') ?>" class="btn btn-sm btn-light" title="Descargar XML"><i class="bi bi-filetype-xml"></i></a>
                        <?php if ($d['status'] !== 'aceptado'): ?>
                            <form method="post" action="<?= url('/edocs/' . $d['id'] . '/retry') ?>" class="d-inline"><?= csrf_field() ?><button class="btn btn-sm btn-warning" title="Reintentar"><i class="bi bi-arrow-repeat"></i></button></form>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$docs): ?><tr><td colspan="8" class="text-center text-muted py-4">No hay documentos.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

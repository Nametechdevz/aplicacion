<?php $v = fn($k, $d = '') => e($s[$k] ?? $d); ?>
<ul class="nav nav-tabs mb-3" role="tablist">
    <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#company" type="button">Empresa</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#dian" type="button">Facturación electrónica</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#ranges" type="button">Resoluciones</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pos" type="button">POS</button></li>
</ul>
<div class="tab-content">
<div class="tab-pane fade show active" id="company">
    <form method="post" action="<?= url('/settings') ?>" class="card"><div class="card-body row g-3">
        <?= csrf_field() ?><input type="hidden" name="_tab" value="#company">
        <div class="col-md-6"><label class="form-label">Razón social</label><input name="company_name" class="form-control" value="<?= $v('company_name') ?>" required></div>
        <div class="col-md-6"><label class="form-label">Nombre comercial</label><input name="company_trade_name" class="form-control" value="<?= $v('company_trade_name') ?>"></div>
        <div class="col-md-3"><label class="form-label">NIT (sin DV)</label><input name="company_nit" id="cnit" class="form-control" value="<?= $v('company_nit') ?>" required></div>
        <div class="col-md-1"><label class="form-label">DV</label><input class="form-control" value="<?= $v('company_dv') ?>" readonly data-nit-source="#cnit"></div>
        <div class="col-md-2"><label class="form-label">Tipo persona</label><select name="company_person_type" class="form-select"><option value="1" <?= ($s['company_person_type'] ?? '') === '1' ? 'selected' : '' ?>>Jurídica</option><option value="2" <?= ($s['company_person_type'] ?? '') === '2' ? 'selected' : '' ?>>Natural</option></select></div>
        <div class="col-md-3"><label class="form-label">Régimen</label><select name="company_tax_regime" class="form-select"><option value="48" <?= ($s['company_tax_regime'] ?? '') === '48' ? 'selected' : '' ?>>Responsable de IVA</option><option value="49" <?= ($s['company_tax_regime'] ?? '') === '49' ? 'selected' : '' ?>>No responsable de IVA</option></select></div>
        <div class="col-md-3"><label class="form-label">Responsabilidades (RUT)</label><input name="company_tax_responsibilities" class="form-control" value="<?= $v('company_tax_responsibilities') ?>" placeholder="O-13;O-15"></div>
        <div class="col-md-6"><label class="form-label">Dirección</label><input name="company_address" class="form-control" value="<?= $v('company_address') ?>"></div>
        <div class="col-md-2"><label class="form-label">Cód. DANE municipio</label><input name="company_city_code" class="form-control" maxlength="5" value="<?= $v('company_city_code') ?>"></div>
        <div class="col-md-2"><label class="form-label">Ciudad</label><input name="company_city_name" class="form-control" value="<?= $v('company_city_name') ?>"></div>
        <div class="col-md-2"><label class="form-label">Departamento</label><input name="company_department" class="form-control" value="<?= $v('company_department') ?>"></div>
        <div class="col-md-3"><label class="form-label">Teléfono</label><input name="company_phone" class="form-control" value="<?= $v('company_phone') ?>"></div>
        <div class="col-md-3"><label class="form-label">Correo de facturación</label><input type="email" name="company_email" class="form-control" value="<?= $v('company_email') ?>"></div>
        <div class="col-md-6"><label class="form-label">Mensaje al pie del ticket</label><input name="ticket_footer" class="form-control" value="<?= $v('ticket_footer') ?>"></div>
        <div class="col-12"><button class="btn btn-primary">Guardar</button></div>
    </div></form>
</div>

<div class="tab-pane fade" id="dian">
    <form method="post" action="<?= url('/settings') ?>" class="card"><div class="card-body row g-3">
        <?= csrf_field() ?><input type="hidden" name="_tab" value="#dian">
        <div class="col-12"><div class="alert alert-info small mb-0">
            <b>¿Cómo se conecta con la DIAN?</b> El sistema genera el XML UBL 2.1, el CUFE/CUDE y el QR. Para que el documento tenga validez,
            hay que <b>firmarlo con el certificado digital</b> de la empresa y enviarlo a la DIAN. Eso lo hace un <b>proveedor tecnológico</b> autorizado
            (o la habilitación como software propio). Mientras tanto usa el modo <b>Simulación</b> para operar y capacitar al personal.
        </div></div>
        <div class="col-md-4"><label class="form-label">Conector</label>
            <select name="dian_driver" class="form-select">
                <option value="simulacion" <?= ($s['dian_driver'] ?? '') === 'simulacion' ? 'selected' : '' ?>>Simulación (no envía a la DIAN)</option>
                <option value="proveedor" <?= ($s['dian_driver'] ?? '') === 'proveedor' ? 'selected' : '' ?>>Proveedor tecnológico (API)</option>
            </select></div>
        <div class="col-md-4"><label class="form-label">Ambiente</label>
            <select name="dian_environment" class="form-select">
                <option value="2" <?= ($s['dian_environment'] ?? '2') === '2' ? 'selected' : '' ?>>2 · Pruebas / habilitación</option>
                <option value="1" <?= ($s['dian_environment'] ?? '') === '1' ? 'selected' : '' ?>>1 · Producción</option>
            </select></div>
        <div class="col-md-4"><label class="form-label">TestSetId (habilitación)</label><input name="dian_test_set_id" class="form-control" value="<?= $v('dian_test_set_id') ?>"></div>
        <div class="col-md-6"><label class="form-label">ID del software (DIAN)</label><input name="dian_software_id" class="form-control" value="<?= $v('dian_software_id') ?>"></div>
        <div class="col-md-6"><label class="form-label">PIN del software</label><input name="dian_software_pin" class="form-control" value="<?= !empty($s['dian_software_pin']) ? '********' : '' ?>" autocomplete="off"></div>
        <div class="col-md-8"><label class="form-label">URL API del proveedor tecnológico</label><input name="dian_provider_url" type="url" class="form-control" value="<?= $v('dian_provider_url') ?>" placeholder="https://api.proveedor.com/v1/documents"></div>
        <div class="col-md-4"><label class="form-label">Token / API key</label><input name="dian_provider_token" class="form-control" value="<?= !empty($s['dian_provider_token']) ? '********' : '' ?>" autocomplete="off"></div>
        <div class="col-12"><button class="btn btn-primary">Guardar</button></div>
    </div></form>
</div>

<div class="tab-pane fade" id="ranges">
    <div class="card mb-3"><div class="card-body small text-muted">Numeraciones autorizadas por la DIAN (Muisca → Numeración de facturación). <b>FEV</b>: factura electrónica (requiere clave técnica). <b>POS</b>: documento equivalente electrónico POS. <b>NC</b>: notas crédito (sin resolución).</div></div>
    <?php foreach (array_merge($ranges, [['id' => null, 'doc_type' => 'POS', 'prefix' => '', 'from_number' => 1, 'to_number' => 1000000, 'current_number' => 0, 'resolution_number' => '', 'resolution_date' => '', 'valid_from' => '', 'valid_to' => '', 'technical_key' => '', 'active' => 1]]) as $r): ?>
    <form method="post" action="<?= url($r['id'] ? '/settings/ranges/' . $r['id'] : '/settings/ranges') ?>" class="card mb-2"><div class="card-body row g-2 align-items-end">
        <?= csrf_field() ?>
        <div class="col-12 small fw-semibold"><?= $r['id'] ? 'Resolución #' . $r['id'] . ' · último número usado: ' . (int) $r['current_number'] : '➕ Nueva resolución' ?></div>
        <div class="col-6 col-md-1"><label class="form-label small">Tipo</label><select name="doc_type" class="form-select form-select-sm"><?php foreach (['FEV', 'POS', 'NC'] as $t): ?><option <?= $r['doc_type'] === $t ? 'selected' : '' ?>><?= $t ?></option><?php endforeach; ?></select></div>
        <div class="col-6 col-md-1"><label class="form-label small">Prefijo</label><input name="prefix" class="form-control form-control-sm" value="<?= e($r['prefix']) ?>"></div>
        <div class="col-6 col-md-1"><label class="form-label small">Desde</label><input type="number" name="from_number" class="form-control form-control-sm" value="<?= e($r['from_number']) ?>"></div>
        <div class="col-6 col-md-1"><label class="form-label small">Hasta</label><input type="number" name="to_number" class="form-control form-control-sm" value="<?= e($r['to_number']) ?>"></div>
        <div class="col-6 col-md-2"><label class="form-label small">No. resolución</label><input name="resolution_number" class="form-control form-control-sm" value="<?= e($r['resolution_number']) ?>"></div>
        <div class="col-6 col-md-1"><label class="form-label small">Fecha res.</label><input type="date" name="resolution_date" class="form-control form-control-sm" value="<?= e($r['resolution_date']) ?>"></div>
        <div class="col-6 col-md-1"><label class="form-label small">Vigente desde</label><input type="date" name="valid_from" class="form-control form-control-sm" value="<?= e($r['valid_from']) ?>"></div>
        <div class="col-6 col-md-1"><label class="form-label small">Hasta</label><input type="date" name="valid_to" class="form-control form-control-sm" value="<?= e($r['valid_to']) ?>"></div>
        <div class="col-md-2"><label class="form-label small">Clave técnica</label><input name="technical_key" class="form-control form-control-sm" value="<?= e($r['technical_key']) ?>"></div>
        <div class="col-6 col-md-1"><div class="form-check"><input class="form-check-input" type="checkbox" name="active" value="1" <?= $r['active'] ? 'checked' : '' ?>><label class="form-check-label small">Activa</label></div>
            <button class="btn btn-sm btn-primary mt-1"><?= $r['id'] ? 'Guardar' : 'Agregar' ?></button></div>
    </div></form>
    <?php endforeach; ?>
</div>

<div class="tab-pane fade" id="pos">
    <form method="post" action="<?= url('/settings') ?>" class="card"><div class="card-body row g-3">
        <?= csrf_field() ?><input type="hidden" name="_tab" value="#pos">
        <div class="col-md-3"><label class="form-label">Placa / identificación de la caja</label><input name="pos_box_plate" class="form-control" value="<?= $v('pos_box_plate') ?>"></div>
        <div class="col-md-3"><label class="form-label">Tipo de caja</label><input name="pos_box_type" class="form-control" value="<?= $v('pos_box_type') ?>"></div>
        <div class="col-md-3"><label class="form-label">Nombre del software</label><input name="software_name" class="form-control" value="<?= $v('software_name') ?>"></div>
        <div class="col-md-3"><label class="form-label">Fabricante del software</label><input name="software_manufacturer" class="form-control" value="<?= $v('software_manufacturer') ?>"></div>
        <div class="col-md-3"><label class="form-label">Descuento máximo para cajeros (%)</label><input type="number" min="0" max="100" name="cashier_max_discount" class="form-control" value="<?= $v('cashier_max_discount', '20') ?>"></div>
        <div class="col-md-6 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="allow_negative_stock" value="1" id="neg" <?= ($s['allow_negative_stock'] ?? '0') === '1' ? 'checked' : '' ?>><label class="form-check-label" for="neg">Permitir vender sin stock (inventario negativo)</label></div></div>
        <div class="col-12"><button class="btn btn-primary">Guardar</button></div>
    </div></form>
</div>
</div>
<?php App\Core\View::start(); ?>
<script>
const h = location.hash; if (h) { const b = document.querySelector(`[data-bs-target="${h}"]`); if (b) bootstrap.Tab.getOrCreateInstance(b).show(); }
document.querySelectorAll('[data-bs-toggle=tab]').forEach(b => b.addEventListener('shown.bs.tab', () => history.replaceState(null, '', b.dataset.bsTarget)));
</script>
<?php App\Core\View::end(); ?>

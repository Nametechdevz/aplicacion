<?php
$prefix = $prefix ?? '';
$v = fn($k, $d = '') => e(old($k, $c[$k] ?? $d));
?>
<div class="row g-3">
    <div class="col-md-4">
        <label class="form-label">Tipo de documento *</label>
        <select name="doc_type" id="<?= $prefix ?>doc_type" class="form-select" required>
            <?php foreach (doc_types() as $k => $label): ?>
                <option value="<?= $k ?>" <?= (string) old('doc_type', $c['doc_type'] ?? '13') === (string) $k ? 'selected' : '' ?>><?= e($label) ?></option>
            <?php endforeach; ?>
        </select>
    </div>
    <div class="col-md-5">
        <label class="form-label">Número *</label>
        <input name="doc_number" id="<?= $prefix ?>doc_number" class="form-control" value="<?= $v('doc_number') ?>" required>
    </div>
    <div class="col-md-3">
        <label class="form-label">DV</label>
        <input id="<?= $prefix ?>dv" class="form-control" value="<?= $v('dv') ?>" readonly data-nit-source="#<?= $prefix ?>doc_number" data-doc-type-source="#<?= $prefix ?>doc_type" tabindex="-1">
    </div>
    <div class="col-md-8">
        <label class="form-label">Nombre completo o razón social *</label>
        <input name="name" class="form-control" value="<?= $v('name') ?>" required>
    </div>
    <div class="col-md-4">
        <label class="form-label">Tipo de persona</label>
        <select name="person_type" class="form-select">
            <option value="2" <?= (string) ($c['person_type'] ?? '2') === '2' ? 'selected' : '' ?>>Natural</option>
            <option value="1" <?= (string) ($c['person_type'] ?? '') === '1' ? 'selected' : '' ?>>Jurídica</option>
        </select>
    </div>
    <div class="col-md-6">
        <label class="form-label">Correo electrónico <small class="text-muted">(obligatorio para factura electrónica)</small></label>
        <input type="email" name="email" class="form-control" value="<?= $v('email') ?>">
    </div>
    <div class="col-md-6">
        <label class="form-label">Teléfono / WhatsApp</label>
        <input name="phone" class="form-control" value="<?= $v('phone') ?>">
    </div>
    <div class="col-md-6">
        <label class="form-label">Dirección</label>
        <input name="address" class="form-control" value="<?= $v('address') ?>">
    </div>
    <div class="col-md-2">
        <label class="form-label">Cód. DANE</label>
        <input name="city_code" class="form-control" value="<?= $v('city_code', '11001') ?>" maxlength="5" placeholder="11001">
    </div>
    <div class="col-md-4">
        <label class="form-label">Ciudad</label>
        <input name="city_name" class="form-control" value="<?= $v('city_name', 'Bogotá, D.C.') ?>">
    </div>
    <div class="col-md-4">
        <label class="form-label">Departamento</label>
        <input name="department" class="form-control" value="<?= $v('department', 'Bogotá') ?>">
    </div>
    <div class="col-md-4">
        <label class="form-label">Régimen</label>
        <select name="tax_regime" class="form-select">
            <option value="49" <?= ($c['tax_regime'] ?? '49') === '49' ? 'selected' : '' ?>>No responsable de IVA</option>
            <option value="48" <?= ($c['tax_regime'] ?? '') === '48' ? 'selected' : '' ?>>Responsable de IVA</option>
        </select>
    </div>
    <div class="col-md-4">
        <label class="form-label">Responsabilidades fiscales</label>
        <input name="tax_responsibilities" class="form-control" value="<?= $v('tax_responsibilities', 'R-99-PN') ?>" placeholder="R-99-PN, O-13, O-15...">
    </div>
    <?php if (empty($prefix)): ?>
    <div class="col-md-4">
        <label class="form-label">Cumpleaños</label>
        <input type="date" name="birthday" class="form-control" value="<?= $v('birthday') ?>">
    </div>
    <div class="col-md-8">
        <label class="form-label">Notas (preferencias, fragancias favoritas…)</label>
        <input name="notes" class="form-control" value="<?= $v('notes') ?>">
    </div>
    <?php endif; ?>
</div>

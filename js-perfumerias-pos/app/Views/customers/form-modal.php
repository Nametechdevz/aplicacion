<dialog class="modal" id="<?= e($id) ?>" aria-labelledby="<?= e($id) ?>-title">
  <form class="modal-card" method="post" action="<?= e(url($c ? '/customers/' . $c['id'] : '/customers')) ?>" data-ajax>
    <?= csrf_field() ?>
    <div class="modal-head"><div><h2 id="<?= e($id) ?>-title"><?= $c ? 'Editar cliente' : 'Nuevo cliente' ?></h2><p>Solo el nombre es obligatorio.</p></div>
      <button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body form-grid">
      <div class="field col-12"><label>Nombre completo<span class="req">*</span></label><input class="input" name="full_name" required maxlength="160" value="<?= e($c['full_name'] ?? '') ?>"></div>
      <div class="field col-4"><label>Tipo</label><select class="select" name="document_type"><option value="">—</option>
        <?php foreach (['CC' => 'Cédula', 'CE' => 'Cédula extranjería', 'NIT' => 'NIT', 'PAS' => 'Pasaporte', 'TI' => 'Tarjeta identidad'] as $k => $l): ?><option value="<?= $k ?>" <?= ($c['document_type'] ?? '') === $k ? 'selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select></div>
      <div class="field col-8"><label>Documento</label><input class="input" name="document_number" maxlength="30" value="<?= e($c['document_number'] ?? '') ?>"></div>
      <div class="field col-6"><label>Teléfono</label><input class="input" name="phone" inputmode="tel" maxlength="40" value="<?= e($c['phone'] ?? '') ?>"></div>
      <div class="field col-6"><label>Correo</label><input class="input" name="email" type="email" maxlength="160" value="<?= e($c['email'] ?? '') ?>"></div>
      <div class="field col-12"><label>Preferencias comerciales</label><input class="input" name="preferences" maxlength="500" value="<?= e($c['preferences'] ?? '') ?>" placeholder="Familias olfativas, tamaños, ocasiones…"></div>
      <div class="field col-12"><label>Observaciones</label><textarea class="textarea" name="notes" maxlength="500" rows="2"><?= e($c['notes'] ?? '') ?></textarea></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
  </form>
</dialog>

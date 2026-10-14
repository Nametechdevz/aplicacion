<?php
use App\Core\View;
use App\Models\Promotion;

$editing = $promotion !== null;
$hasOld = !empty($GLOBALS['__old_input']);
$val = static fn (string $k, $d = '') => old($k, $promotion[$k] ?? $d);
$dt = static fn (?string $v) => $v ? str_replace(' ', 'T', substr($v, 0, 16)) : '';
$selectedProducts = array_map('intval', $hasOld ? (array) old('product_ids', []) : ($promotion['product_ids'] ?? []));
$selectedCategories = array_map('intval', $hasOld ? (array) old('category_ids', []) : ($promotion['category_ids'] ?? []));
$scope = $val('scope', 'products');
?>
<?= View::partial('admin/_header', ['title' => $editing ? $promotion['name'] : 'Nueva promoción']) ?>
<form method="post" action="<?= e(url($editing ? 'admin/promociones/' . $promotion['id'] : 'admin/promociones')) ?>" class="panel admin-form-narrow" data-once-submit>
  <?= csrf_field() ?>
  <div class="form-grid">
    <div class="field field--full<?= has_error('name') ? ' has-error' : '' ?>"><label for="name">Nombre (visible para el cliente)</label><input id="name" name="name" required maxlength="150" value="<?= e($val('name')) ?>" placeholder="Ej.: Semana del semipermanente"><?= error_for('name') ?></div>
    <div class="field<?= has_error('discount_type') ? ' has-error' : '' ?>">
      <label for="discount_type">Tipo de descuento</label>
      <select id="discount_type" name="discount_type"><?php foreach (Promotion::TYPES as $k => $l): ?><option value="<?= e($k) ?>"<?= selected($k, $val('discount_type', 'percent')) ?>><?= e($l) ?></option><?php endforeach; ?></select>
    </div>
    <div class="field<?= has_error('discount_value') ? ' has-error' : '' ?>"><label for="discount_value">Valor</label><input id="discount_value" name="discount_value" inputmode="decimal" required value="<?= e($hasOld ? old('discount_value') : ($promotion ? (float) $promotion['discount_value'] : '')) ?>" placeholder="10"><?= error_for('discount_value') ?></div>
    <div class="field<?= has_error('starts_at') ? ' has-error' : '' ?>"><label for="starts_at">Inicio</label><input id="starts_at" name="starts_at" type="datetime-local" required value="<?= e($hasOld ? old('starts_at') : $dt($promotion['starts_at'] ?? date('Y-m-d H:i'))) ?>"><?= error_for('starts_at') ?></div>
    <div class="field<?= has_error('ends_at') ? ' has-error' : '' ?>"><label for="ends_at">Fin</label><input id="ends_at" name="ends_at" type="datetime-local" required value="<?= e($hasOld ? old('ends_at') : $dt($promotion['ends_at'] ?? null)) ?>"><?= error_for('ends_at') ?></div>
    <fieldset class="field field--full">
      <legend class="label">Se aplica a</legend>
      <div class="radio-row">
        <?php foreach (Promotion::SCOPES as $k => $l): ?><label class="check"><input type="radio" name="scope" value="<?= e($k) ?>"<?= $scope === $k ? ' checked' : '' ?> data-scope> <span><?= e($l) ?></span></label><?php endforeach; ?>
      </div>
    </fieldset>
    <div class="field field--full<?= has_error('product_ids') ? ' has-error' : '' ?>" data-scope-panel="products"<?= $scope === 'products' ? '' : ' hidden' ?>>
      <label for="product_ids">Productos <span class="optional">(Ctrl/Cmd para seleccionar varios)</span></label>
      <select id="product_ids" name="product_ids[]" multiple size="8">
        <?php foreach ($products as $p): ?><option value="<?= (int) $p['id'] ?>"<?= in_array((int) $p['id'], $selectedProducts, true) ? ' selected' : '' ?>><?= e($p['name']) ?> (<?= e($p['sku']) ?>)</option><?php endforeach; ?>
      </select>
      <?= error_for('product_ids') ?>
    </div>
    <div class="field field--full<?= has_error('category_ids') ? ' has-error' : '' ?>" data-scope-panel="categories"<?= $scope === 'categories' ? '' : ' hidden' ?>>
      <span class="label">Categorías</span>
      <div class="check-grid">
        <?php foreach ($categories as $c): ?><label class="check"><input type="checkbox" name="category_ids[]" value="<?= (int) $c['id'] ?>"<?= in_array((int) $c['id'], $selectedCategories, true) ? ' checked' : '' ?>> <span><?= e($c['name']) ?></span></label><?php endforeach; ?>
      </div>
      <?= error_for('category_ids') ?>
    </div>
    <label class="check field--full"><input type="checkbox" name="is_active" value="1"<?= checked($hasOld ? (old('is_active') ? 1 : 0) : ($promotion['is_active'] ?? 1)) ?>> <span>Activa (se aplica solo entre las fechas indicadas)</span></label>
  </div>
  <p class="hint"><?= icon('info', '', 14) ?> El porcentaje máximo es 90%. Un descuento fijo mayor que el precio deja el producto en $0, nunca en negativo.</p>
  <div class="form-actions">
    <a href="<?= e(url('admin/promociones')) ?>" class="btn btn--ghost">Cancelar</a>
    <button type="submit" class="btn btn--primary"><?= $editing ? 'Guardar cambios' : 'Crear promoción' ?></button>
  </div>
</form>

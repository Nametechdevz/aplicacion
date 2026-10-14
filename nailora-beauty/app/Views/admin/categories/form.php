<?php
use App\Core\View;

$editing = $category !== null;
$hasOld = !empty($GLOBALS['__old_input']);
$val = static fn (string $k, $d = '') => old($k, $category[$k] ?? $d);
?>
<?= View::partial('admin/_header', ['title' => $editing ? $category['name'] : 'Nueva categoría']) ?>
<form method="post" action="<?= e(url($editing ? 'admin/categorias/' . $category['id'] : 'admin/categorias')) ?>" enctype="multipart/form-data" class="panel admin-form-narrow" data-once-submit>
  <?= csrf_field() ?>
  <div class="form-grid">
    <div class="field<?= has_error('name') ? ' has-error' : '' ?>"><label for="name">Nombre</label><input id="name" name="name" required maxlength="120" value="<?= e($val('name')) ?>"><?= error_for('name') ?></div>
    <div class="field<?= has_error('slug') ? ' has-error' : '' ?>"><label for="slug">URL <span class="optional">(se genera sola)</span></label><input id="slug" name="slug" maxlength="140" value="<?= e($val('slug')) ?>"><?= error_for('slug') ?></div>
    <div class="field field--full"><label for="description">Descripción</label><textarea id="description" name="description" rows="3" maxlength="2000"><?= e($val('description')) ?></textarea></div>
    <div class="field<?= has_error('sort_order') ? ' has-error' : '' ?>"><label for="sort_order">Orden de presentación</label><input id="sort_order" name="sort_order" type="number" min="0" value="<?= e($val('sort_order', 0)) ?>"><?= error_for('sort_order') ?></div>
    <div class="field"><span class="label">Estado</span><label class="check"><input type="checkbox" name="is_active" value="1"<?= checked($hasOld ? (old('is_active') ? 1 : 0) : ($category['is_active'] ?? 1)) ?>> <span>Activa (visible en la tienda)</span></label></div>
    <div class="field field--full<?= has_error('image') ? ' has-error' : '' ?>">
      <span class="label">Imagen</span>
      <div class="inline-media">
        <?php if ($editing): ?><img src="<?= e(image_url($category['image_path'])) ?>" alt="" width="72" height="72"><?php endif; ?>
        <label class="upload-box upload-box--inline"><?= icon('upload', '', 20) ?><span><?= $editing ? 'Reemplazar imagen' : 'Subir imagen' ?> (JPG, PNG o WebP)</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp"></label>
      </div>
      <?= error_for('image') ?>
    </div>
  </div>
  <div class="form-actions">
    <a href="<?= e(url('admin/categorias')) ?>" class="btn btn--ghost">Cancelar</a>
    <button type="submit" class="btn btn--primary"><?= $editing ? 'Guardar cambios' : 'Crear categoría' ?></button>
  </div>
</form>

<?php
use App\Core\View;

$editing = $product !== null;
$hasOld = !empty($GLOBALS['__old_input']);
$val = static fn (string $k, $default = '') => old($k, $product[$k] ?? $default);
$flag = static fn (string $k, int $default = 0) => $hasOld ? (old($k) ? 1 : 0) : (int) ($product[$k] ?? $default);
$cls = static fn (string $f) => has_error($f) ? ' has-error' : '';
$action = $editing ? url('admin/productos/' . $product['id']) : url('admin/productos');
$money = static fn ($v) => $v === null || $v === '' ? '' : (string) (int) round((float) $v);
?>
<?= View::partial('admin/_header', [
    'title' => $editing ? $product['name'] : 'Nuevo producto',
    'subtitle' => $editing ? 'SKU ' . $product['sku'] . ' · Actualizado ' . date_es($product['updated_at'], true) : 'Complete la información y guarde para publicar.',
    'actions' => $editing ? '<a href="' . e(url('producto/' . $product['slug'])) . '" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">' . icon('eye', '', 16) . ' Ver en tienda</a>' : '',
]) ?>

<form method="post" action="<?= e($action) ?>" enctype="multipart/form-data" class="admin-form" id="product-form" data-once-submit novalidate>
  <?= csrf_field() ?>
  <div class="admin-grid admin-grid--form">
    <div class="admin-form__main">
      <section class="panel">
        <h2 class="panel__title">Información general</h2>
        <div class="form-grid">
          <div class="field field--full<?= $cls('name') ?>">
            <label for="name">Nombre del producto</label>
            <input id="name" name="name" required maxlength="180" value="<?= e($val('name')) ?>">
            <?= error_for('name') ?>
          </div>
          <div class="field<?= $cls('sku') ?>">
            <label for="sku">SKU / referencia</label>
            <input id="sku" name="sku" required maxlength="60" value="<?= e($val('sku')) ?>" autocapitalize="characters">
            <?= error_for('sku') ?>
          </div>
          <div class="field<?= $cls('slug') ?>">
            <label for="slug">URL amigable <span class="optional">(se genera sola)</span></label>
            <input id="slug" name="slug" maxlength="200" value="<?= e($val('slug')) ?>" placeholder="esmalte-rosa-nude">
            <?= error_for('slug') ?>
          </div>
          <div class="field<?= $cls('category_id') ?>">
            <label for="category_id">Categoría</label>
            <select id="category_id" name="category_id" required>
              <option value="">Seleccione…</option>
              <?php foreach ($categories as $c): ?><option value="<?= (int) $c['id'] ?>"<?= selected($c['id'], $val('category_id')) ?>><?= e($c['name']) ?><?= (int) $c['is_active'] ? '' : ' (inactiva)' ?></option><?php endforeach; ?>
            </select>
            <?= error_for('category_id') ?>
          </div>
          <div class="field<?= $cls('brand_id') ?>">
            <label for="brand_id">Marca <span class="optional">(opcional)</span></label>
            <select id="brand_id" name="brand_id">
              <option value="">Sin marca</option>
              <?php foreach ($brands as $b): ?><option value="<?= (int) $b['id'] ?>"<?= selected($b['id'], $val('brand_id')) ?>><?= e($b['name']) ?></option><?php endforeach; ?>
            </select>
            <?= error_for('brand_id') ?>
          </div>
          <div class="field<?= $cls('product_type') ?>">
            <label for="product_type">Tipo de producto <span class="optional">(para el filtro del catálogo)</span></label>
            <input id="product_type" name="product_type" maxlength="60" list="types" value="<?= e($val('product_type')) ?>" placeholder="Esmalte, Herramienta…">
            <datalist id="types"><?php foreach ($types as $t): ?><option value="<?= e($t) ?>"><?php endforeach; ?></datalist>
            <?= error_for('product_type') ?>
          </div>
          <div class="field field--full<?= $cls('short_description') ?>">
            <label for="short_description">Descripción corta</label>
            <textarea id="short_description" name="short_description" rows="2" maxlength="500"><?= e($val('short_description')) ?></textarea>
            <?= error_for('short_description') ?>
          </div>
          <div class="field field--full<?= $cls('description') ?>">
            <label for="description">Descripción completa</label>
            <textarea id="description" name="description" rows="8"><?= e($val('description')) ?></textarea>
            <p class="hint">Separe párrafos con una línea en blanco. Use “## ” al inicio para un subtítulo y “- ” para listas.</p>
            <?= error_for('description') ?>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">Precios (COP)</h2>
        <div class="form-grid form-grid--3">
          <div class="field<?= $cls('price') ?>">
            <label for="price">Precio de venta</label>
            <input id="price" name="price" required inputmode="numeric" value="<?= e($hasOld ? old('price') : $money($product['price'] ?? '')) ?>" placeholder="24000">
            <?= error_for('price') ?>
          </div>
          <div class="field<?= $cls('compare_at_price') ?>">
            <label for="compare_at_price">Precio anterior <span class="optional">(tachado)</span></label>
            <input id="compare_at_price" name="compare_at_price" inputmode="numeric" value="<?= e($hasOld ? old('compare_at_price') : $money($product['compare_at_price'] ?? '')) ?>">
            <?= error_for('compare_at_price') ?>
          </div>
          <div class="field<?= $cls('cost_price') ?>">
            <label for="cost_price">Costo de adquisición <span class="optional">(privado)</span></label>
            <input id="cost_price" name="cost_price" inputmode="numeric" value="<?= e($hasOld ? old('cost_price') : $money($product['cost_price'] ?? '')) ?>">
            <?= error_for('cost_price') ?>
          </div>
        </div>
        <p class="hint"><?= icon('info', '', 14) ?> Use el precio anterior solo si refleja un precio real previo. Los descuentos por tiempo limitado se gestionan en Promociones.</p>
      </section>

      <section class="panel">
        <h2 class="panel__title">Inventario</h2>
        <div class="form-grid">
          <label class="check field--full<?= $cls('has_variants') ?>">
            <input type="checkbox" name="has_variants" value="1"<?= checked($flag('has_variants')) ?> data-toggle-target="#stock-field">
            <span><strong>Este producto tiene variantes</strong> (colores o presentaciones con SKU, precio y existencias propias)</span>
          </label>
          <?= error_for('has_variants') ?>
          <?php if (!$editing): ?>
            <div class="field<?= $cls('stock') ?>" id="stock-field"<?= $flag('has_variants') ? ' hidden' : '' ?>>
              <label for="stock">Existencias iniciales</label>
              <input id="stock" name="stock" type="number" min="0" step="1" value="<?= e(old('stock', '0')) ?>">
              <?= error_for('stock') ?>
            </div>
          <?php else: ?>
            <div class="field">
              <span class="label">Existencias actuales</span>
              <p class="stock-now"><strong><?= (int) $product['available_stock'] ?></strong> unidades <a href="<?= e(url('admin/inventario/ajustar?producto=' . $product['id'])) ?>" class="btn btn--ghost btn--xs"><?= icon('archive', '', 14) ?> Ajustar inventario</a></p>
              <p class="hint">Las existencias solo se modifican con movimientos de inventario para mantener el historial.</p>
            </div>
          <?php endif; ?>
          <div class="field<?= $cls('low_stock_threshold') ?>">
            <label for="low_stock_threshold">Alerta de stock bajo desde</label>
            <input id="low_stock_threshold" name="low_stock_threshold" type="number" min="0" value="<?= e($val('low_stock_threshold', $lowStockDefault)) ?>">
            <?= error_for('low_stock_threshold') ?>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">SEO <span class="optional">(opcional)</span></h2>
        <div class="form-grid">
          <div class="field field--full"><label for="meta_title">Título para buscadores</label><input id="meta_title" name="meta_title" maxlength="180" value="<?= e($val('meta_title')) ?>"></div>
          <div class="field field--full"><label for="meta_description">Meta descripción</label><textarea id="meta_description" name="meta_description" rows="2" maxlength="300"><?= e($val('meta_description')) ?></textarea></div>
        </div>
      </section>
    </div>

    <aside class="admin-form__side">
      <section class="panel">
        <h2 class="panel__title">Publicación</h2>
        <div class="stack">
          <label class="check"><input type="checkbox" name="is_active" value="1"<?= checked($flag('is_active', 1)) ?>> <span><strong>Activo</strong> — visible en la tienda</span></label>
          <label class="check"><input type="checkbox" name="is_featured" value="1"<?= checked($flag('is_featured')) ?>> <span>Mostrar como <strong>destacado</strong></span></label>
          <label class="check"><input type="checkbox" name="is_new" value="1"<?= checked($flag('is_new')) ?>> <span>Etiqueta <strong>Nuevo</strong></span></label>
        </div>
      </section>
      <?php if (!$editing): ?>
      <section class="panel">
        <h2 class="panel__title">Imágenes</h2>
        <label class="upload-box"><?= icon('upload', '', 22) ?><span>JPG, PNG o WebP · máx. <?= (int) config('app.uploads.max_mb') ?> MB c/u</span><input type="file" name="images[]" accept="image/jpeg,image/png,image/webp" multiple></label>
        <p class="hint">La primera imagen será la principal.</p>
      </section>
      <?php endif; ?>
      <div class="sticky-actions">
        <button type="submit" class="btn btn--primary btn--block btn--lg" data-loading-text="Guardando…"><?= icon('check', '', 18) ?> <?= $editing ? 'Guardar cambios' : 'Crear producto' ?></button>
        <a href="<?= e(url('admin/productos')) ?>" class="btn btn--ghost btn--block">Cancelar</a>
      </div>
    </aside>
  </div>
</form>

<?php if ($editing): ?>
<section class="panel" id="imagenes">
  <div class="panel__head"><h2 class="panel__title">Galería de imágenes</h2></div>
  <?php if ($images): ?>
    <ul class="image-grid">
      <?php foreach ($images as $img): ?>
        <li class="image-tile<?= (int) $img['is_primary'] ? ' is-primary' : '' ?>">
          <img src="<?= e(image_url($img['path'])) ?>" alt="<?= e($img['alt']) ?>" width="160" height="160" loading="lazy">
          <?php if ((int) $img['is_primary']): ?><span class="badge badge--new image-tile__badge">Principal</span><?php endif; ?>
          <div class="image-tile__actions">
            <?php if (!(int) $img['is_primary']): ?>
              <form method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/imagenes/' . $img['id'] . '/principal')) ?>"><?= csrf_field() ?><button class="btn btn--ghost btn--xs" type="submit">Principal</button></form>
            <?php endif; ?>
            <form method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/imagenes/' . $img['id'] . '/eliminar')) ?>" data-confirm="¿Eliminar esta imagen?" data-confirm-label="Eliminar"><?= csrf_field() ?><button class="btn btn--danger-ghost btn--xs" type="submit" aria-label="Eliminar imagen"><?= icon('trash', '', 14) ?></button></form>
          </div>
        </li>
      <?php endforeach; ?>
    </ul>
  <?php else: ?>
    <p class="muted">Este producto aún no tiene imágenes; en la tienda se mostrará una imagen genérica.</p>
  <?php endif; ?>
  <form method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/imagenes')) ?>" enctype="multipart/form-data" class="upload-row" data-once-submit>
    <?= csrf_field() ?>
    <label class="upload-box upload-box--inline"><?= icon('upload', '', 20) ?><span>Añadir imágenes (JPG, PNG o WebP, máx. <?= (int) config('app.uploads.max_mb') ?> MB)</span><input type="file" name="images[]" accept="image/jpeg,image/png,image/webp" multiple required></label>
    <button type="submit" class="btn btn--primary" data-loading-text="Subiendo…">Subir</button>
  </form>
</section>

<?php if ((int) $product['has_variants'] === 1): ?>
<section class="panel" id="variantes">
  <div class="panel__head">
    <h2 class="panel__title">Variantes</h2>
    <p class="panel__note">Cada variante tiene su SKU y existencias. Si deja el precio vacío usa el del producto (<?= money($product['price']) ?>).</p>
  </div>
  <?php if ($variants): ?>
  <div class="table-wrap">
    <table class="table table--responsive table--forms">
      <thead><tr><th>Nombre</th><th>SKU</th><th>Color</th><th>Precio</th><th>Precio ant.</th><th>Orden</th><th class="num">Stock</th><th>Activa</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($variants as $vr): $fid = 'variant-' . $vr['id']; ?>
          <tr>
            <td data-label="Nombre"><input form="<?= $fid ?>" name="name" value="<?= e($vr['name']) ?>" maxlength="120" required aria-label="Nombre"></td>
            <td data-label="SKU"><input form="<?= $fid ?>" name="sku" value="<?= e($vr['sku']) ?>" maxlength="60" required aria-label="SKU"></td>
            <td data-label="Color"><input form="<?= $fid ?>" name="color_hex" value="<?= e($vr['color_hex']) ?>" maxlength="7" placeholder="#C74375" class="input-color" aria-label="Color hexadecimal"></td>
            <td data-label="Precio"><input form="<?= $fid ?>" name="price" value="<?= e($money($vr['price'])) ?>" inputmode="numeric" placeholder="<?= (int) $product['price'] ?>" aria-label="Precio"></td>
            <td data-label="Precio ant."><input form="<?= $fid ?>" name="compare_at_price" value="<?= e($money($vr['compare_at_price'])) ?>" inputmode="numeric" aria-label="Precio anterior"></td>
            <td data-label="Orden"><input form="<?= $fid ?>" name="sort_order" type="number" min="0" value="<?= (int) $vr['sort_order'] ?>" class="input-narrow" aria-label="Orden"></td>
            <td data-label="Stock" class="num"><a href="<?= e(url('admin/inventario/ajustar?producto=' . $product['id'] . '&variante=' . $vr['id'])) ?>" title="Ajustar inventario"><?= (int) $vr['stock'] ?></a></td>
            <td data-label="Activa"><input form="<?= $fid ?>" type="checkbox" name="is_active" value="1"<?= checked($vr['is_active']) ?> aria-label="Activa"></td>
            <td class="actions"><form id="<?= $fid ?>" method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/variantes/' . $vr['id'])) ?>"><?= csrf_field() ?><button type="submit" class="btn btn--ghost btn--xs">Guardar</button></form></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php else: ?>
    <p class="notice notice--warning"><?= icon('alert', '', 16) ?> El producto no se puede comprar hasta que agregue al menos una variante activa con existencias.</p>
  <?php endif; ?>
  <form method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/variantes')) ?>" class="variant-new">
    <?= csrf_field() ?>
    <h3 class="panel__subtitle">Nueva variante</h3>
    <div class="form-grid form-grid--6">
      <div class="field"><label for="v-name">Nombre</label><input id="v-name" name="name" required maxlength="120" placeholder="Rosa nude"></div>
      <div class="field"><label for="v-sku">SKU</label><input id="v-sku" name="sku" required maxlength="60" value="<?= e($product['sku']) ?>-"></div>
      <div class="field"><label for="v-color">Color (opcional)</label><input id="v-color" name="color_hex" maxlength="7" placeholder="#E3B5A8"></div>
      <div class="field"><label for="v-price">Precio (opcional)</label><input id="v-price" name="price" inputmode="numeric" placeholder="<?= (int) $product['price'] ?>"></div>
      <div class="field"><label for="v-stock">Existencias iniciales</label><input id="v-stock" name="stock" type="number" min="0" value="0"></div>
      <div class="field field--end"><button type="submit" class="btn btn--primary btn--block"><?= icon('plus', '', 16) ?> Agregar</button></div>
    </div>
  </form>
</section>
<?php endif; ?>

<section class="panel panel--danger">
  <h2 class="panel__title">Acciones</h2>
  <div class="danger-actions">
    <form method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/duplicar')) ?>"><?= csrf_field() ?><button type="submit" class="btn btn--ghost"><?= icon('copy', '', 16) ?> Duplicar producto</button></form>
    <form method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/estado')) ?>"><?= csrf_field() ?><input type="hidden" name="back" value="edit"><button type="submit" class="btn btn--ghost"><?= icon('power', '', 16) ?> <?= (int) $product['is_active'] ? 'Desactivar' : 'Activar' ?></button></form>
    <form method="post" action="<?= e(url('admin/productos/' . $product['id'] . '/eliminar')) ?>" data-confirm="<?= $hasHistory ? 'Este producto tiene pedidos o movimientos de inventario: se desactivará en lugar de eliminarse. ¿Continuar?' : '¿Eliminar definitivamente este producto? Esta acción no se puede deshacer.' ?>" data-confirm-label="<?= $hasHistory ? 'Desactivar' : 'Eliminar' ?>">
      <?= csrf_field() ?>
      <button type="submit" class="btn btn--danger-ghost"><?= icon('trash', '', 16) ?> <?= $hasHistory ? 'Retirar de la tienda' : 'Eliminar producto' ?></button>
    </form>
  </div>
</section>
<?php endif; ?>

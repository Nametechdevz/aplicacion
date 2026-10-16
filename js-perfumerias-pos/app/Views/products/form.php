<?php
use App\Core\View;
$v = static fn (string $k, $default = '') => old($k, $p[$k] ?? $default);
$err = static fn (string $k) => field_error($k) ? '<span class="error">' . icon('alert', 'icon-sm') . e(field_error($k)) . '</span>' : '';
$inv = static fn (string $k) => field_error($k) ? 'is-invalid' : '';
$parents = array_filter($categories, fn ($c) => $c['parent_id'] === null);
$children = array_filter($categories, fn ($c) => $c['parent_id'] !== null);
$primary = $images[0] ?? null;
$action = $p ? '/products/' . $p['id'] : '/products';
$variantRows = old('variants', $variants) ?: [];
?>
<div class="page-head">
  <div>
    <div class="eyebrow"><?= $p ? 'Editar producto' : 'Nuevo producto' ?></div>
    <h1><?= e($p['name'] ?? 'Registrar producto') ?></h1>
    <p>Defina cómo se almacena el inventario (unidad base) y cómo se vende: por unidad, por mililitros o por gramos.</p>
  </div>
  <div class="page-actions">
    <a class="btn btn-ghost" href="<?= e(url($p ? '/products/' . $p['id'] : '/products')) ?>">Cancelar</a>
    <button class="btn btn-primary" type="submit" form="product-form"><?= icon('check') ?> Guardar producto</button>
  </div>
</div>

<div class="grid grid-12" style="align-items:start">
  <form id="product-form" class="panel span-8" method="post" action="<?= e(url($action)) ?>" enctype="multipart/form-data" data-product-form novalidate>
    <?= csrf_field() ?>
    <section class="form-section">
      <h3>Información general</h3>
      <p class="muted">Nombre comercial y códigos únicos para búsqueda y lectura con escáner.</p>
      <div class="form-grid">
        <div class="field col-12">
          <label for="name">Nombre comercial<span class="req">*</span></label>
          <input class="input <?= $inv('name') ?>" id="name" name="name" required maxlength="160" value="<?= e($v('name')) ?>" placeholder="Ej.: Eau de Parfum 100 ml">
          <?= $err('name') ?>
        </div>
        <div class="field col-4">
          <label for="code">Código interno<span class="req">*</span></label>
          <input class="input <?= $inv('code') ?>" id="code" name="code" required maxlength="40" value="<?= e($v('code')) ?>" placeholder="PF-001" style="text-transform:uppercase">
          <?= $err('code') ?>
        </div>
        <div class="field col-4">
          <label for="sku">SKU</label>
          <input class="input <?= $inv('sku') ?>" id="sku" name="sku" maxlength="60" value="<?= e($v('sku')) ?>">
          <?= $err('sku') ?>
        </div>
        <div class="field col-4">
          <label for="barcode">Código de barras</label>
          <div class="input-group"><?= icon('barcode') ?><input class="input <?= $inv('barcode') ?>" id="barcode" name="barcode" maxlength="60" value="<?= e($v('barcode')) ?>" inputmode="numeric"></div>
          <?= $err('barcode') ?>
        </div>
        <div class="field col-4">
          <label for="brand_id">Marca</label>
          <select class="select" id="brand_id" name="brand_id">
            <option value="">Sin marca</option>
            <?php foreach ($brands as $b): ?><option value="<?= (int) $b['id'] ?>" <?= (string) $v('brand_id') === (string) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?>
          </select>
        </div>
        <div class="field col-4">
          <label for="category_id">Categoría</label>
          <select class="select" id="category_id" name="category_id" data-category>
            <option value="">Sin categoría</option>
            <?php foreach ($parents as $c): ?><option value="<?= (int) $c['id'] ?>" <?= (string) $v('category_id') === (string) $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?>
          </select>
        </div>
        <div class="field col-4">
          <label for="subcategory_id">Subcategoría</label>
          <select class="select" id="subcategory_id" name="subcategory_id" data-subcategory>
            <option value="">Ninguna</option>
            <?php foreach ($children as $c): ?><option value="<?= (int) $c['id'] ?>" data-parent="<?= (int) $c['parent_id'] ?>" <?= (string) $v('subcategory_id') === (string) $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?>
          </select>
        </div>
        <div class="field col-12">
          <label for="description">Descripción</label>
          <textarea class="textarea" id="description" name="description" maxlength="2000" rows="3" placeholder="Notas olfativas, presentación, recomendaciones…"><?= e($v('description')) ?></textarea>
        </div>
      </div>
    </section>

    <section class="form-section">
      <h3>Unidad de inventario y forma de venta</h3>
      <p class="muted">El inventario siempre se descuenta en la unidad base. Las unidades discretas nunca se fraccionan.</p>
      <div class="form-grid">
        <div class="field col-4">
          <label for="base_unit_id">Unidad base<span class="req">*</span></label>
          <select class="select <?= $inv('base_unit_id') ?>" id="base_unit_id" name="base_unit_id" required data-unit>
            <?php foreach ($units as $u): ?>
              <option value="<?= (int) $u['id'] ?>" data-code="<?= e($u['code']) ?>" data-decimal="<?= (int) $u['allows_decimal'] ?>" data-max="<?= (int) $u['max_precision'] ?>" <?= (string) $v('base_unit_id', $units[0]['id']) === (string) $u['id'] ? 'selected' : '' ?>><?= e($u['name']) ?> (<?= e($u['code']) ?>)</option>
            <?php endforeach; ?>
          </select>
          <?= $err('base_unit_id') ?>
        </div>
        <div class="field col-4">
          <span class="label">Forma de venta</span>
          <div class="segmented" data-sale-mode>
            <label><input type="radio" name="sale_mode" value="unit" <?= $v('sale_mode', 'unit') === 'unit' ? 'checked' : '' ?>><span>Por unidad</span></label>
            <label><input type="radio" name="sale_mode" value="fractional" <?= $v('sale_mode') === 'fractional' ? 'checked' : '' ?>><span>Fraccionable</span></label>
          </div>
        </div>
        <div class="field col-4" data-precision-field>
          <label for="qty_precision">Decimales permitidos</label>
          <select class="select" id="qty_precision" name="qty_precision">
            <?php foreach ([0 => 'Sin decimales (35)', 1 => '1 decimal (35,5)', 2 => '2 decimales (35,25)', 3 => '3 decimales'] as $k => $lbl): ?>
              <option value="<?= $k ?>" <?= (string) $v('qty_precision', '0') === (string) $k ? 'selected' : '' ?>><?= e($lbl) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field col-4" data-container-field>
          <label for="container_content">Contenido neto del envase</label>
          <div class="input-group has-addon"><input class="input" id="container_content" name="container_content" inputmode="decimal" value="<?= e($v('container_content') !== '' ? rtrim(rtrim((string) $v('container_content'), '0'), '.') : '') ?>" placeholder="1000"><span class="addon" data-unit-label>ml</span></div>
          <span class="hint">Ej.: una garrafa de 1 L = 1.000 ml.</span>
        </div>
        <div class="field col-4" data-container-field>
          <label for="container_label">Envase</label>
          <input class="input" id="container_label" name="container_label" maxlength="60" value="<?= e($v('container_label')) ?>" placeholder="Garrafa 1 L">
        </div>
        <div class="field col-4">
          <span class="label">Existencias negativas</span>
          <label class="switch mt-1"><input type="checkbox" name="allow_negative_stock" value="1" <?= $v('allow_negative_stock') ? 'checked' : '' ?>><span class="track"></span><span>Permitir (si la política general lo admite)</span></label>
        </div>
      </div>
      <div class="callout callout-gold mt-3" data-unit-explainer><?= icon('info') ?><span></span></div>
    </section>

    <section class="form-section">
      <h3>Precios y márgenes</h3>
      <p class="muted">El servidor recalcula cada venta con estos valores; el navegador nunca define precios.</p>
      <?php if (!$canPrice): ?><div class="callout callout-warning mb-3"><?= icon('lock') ?><span>No tiene permiso para modificar precios ni costos base. Los valores se muestran solo como referencia.</span></div><?php endif; ?>
      <div class="form-grid">
        <div class="field col-4">
          <label for="price">Precio de venta<span class="req">*</span> <span class="muted" data-per-unit></span></label>
          <div class="input-group"><span class="icon" style="left:13px;width:auto;font-weight:700;color:var(--muted)">$</span><input class="input <?= $inv('price') ?>" id="price" name="price" required inputmode="decimal" value="<?= e($v('price') !== '' ? rtrim(rtrim((string) $v('price'), '0'), '.') : '') ?>" <?= $canPrice ? '' : 'readonly' ?> data-price></div>
          <?= $err('price') ?>
        </div>
        <div class="field col-4">
          <label for="cost">Costo de adquisición <span class="muted" data-per-unit></span></label>
          <div class="input-group"><span class="icon" style="left:13px;width:auto;font-weight:700;color:var(--muted)">$</span><input class="input <?= $inv('cost') ?>" id="cost" name="cost" inputmode="decimal" value="<?= e($v('cost') !== '' ? rtrim(rtrim((string) $v('cost'), '0'), '.') : '') ?>" <?= $canPrice ? '' : 'readonly' ?> data-cost></div>
          <span class="hint">Se actualiza con cada recepción de compra.</span>
          <?= $err('cost') ?>
        </div>
        <div class="field col-4">
          <span class="label">Margen bruto</span>
          <div class="kpi-value" style="font-size:22px;margin-top:6px" data-margin>—</div>
        </div>
        <div class="field col-4">
          <label for="min_price">Precio mínimo autorizado</label>
          <input class="input <?= $inv('min_price') ?>" id="min_price" name="min_price" inputmode="decimal" value="<?= e($v('min_price') !== null && $v('min_price') !== '' ? rtrim(rtrim((string) $v('min_price'), '0'), '.') : '') ?>" <?= $canPrice ? '' : 'readonly' ?>>
          <span class="hint">Por debajo de este valor se exige autorización.</span>
          <?= $err('min_price') ?>
        </div>
        <div class="field col-4">
          <label for="max_discount_pct">Descuento máximo del producto</label>
          <div class="input-group has-addon"><input class="input" id="max_discount_pct" name="max_discount_pct" inputmode="decimal" value="<?= e($v('max_discount_pct') ?? '') ?>" placeholder="Sin límite propio"><span class="addon">%</span></div>
          <?= $err('max_discount_pct') ?>
        </div>
        <div class="field col-4">
          <label for="min_margin_pct">Margen mínimo de alerta</label>
          <div class="input-group has-addon"><input class="input" id="min_margin_pct" name="min_margin_pct" inputmode="decimal" value="<?= e($v('min_margin_pct') ?? '') ?>" placeholder="General: <?= e(setting('min_margin_pct')) ?>"><span class="addon">%</span></div>
        </div>
      </div>
    </section>

    <section class="form-section">
      <div class="row-between">
        <div><h3>Presentaciones de venta</h3><p class="muted" style="margin:0">Opcional. Cada presentación descuenta una cantidad fija de la unidad base (ej.: decant de 10 ml).</p></div>
        <button class="btn btn-sm" type="button" data-add-variant><?= icon('plus', 'icon-sm') ?> Agregar</button>
      </div>
      <div class="table-wrap mt-2">
        <table class="table table-sm" data-variants>
          <thead><tr><th>Nombre</th><th>Consume</th><th>Precio</th><th>SKU</th><th>Código de barras</th><th></th></tr></thead>
          <tbody>
            <?php foreach ($variantRows as $i => $vr): ?>
              <tr>
                <td><input type="hidden" name="variants[<?= $i ?>][id]" value="<?= e($vr['id'] ?? '') ?>"><input type="hidden" name="variants[<?= $i ?>][is_active]" value="1">
                  <input class="input input-sm" name="variants[<?= $i ?>][name]" value="<?= e($vr['name'] ?? '') ?>" placeholder="Decant 10 ml" aria-label="Nombre de la presentación"></td>
                <td><div class="input-group has-addon"><input class="input input-sm" name="variants[<?= $i ?>][base_qty]" value="<?= e(isset($vr['base_qty']) ? rtrim(rtrim((string) $vr['base_qty'], '0'), '.') : '') ?>" inputmode="decimal" style="width:100px" aria-label="Cantidad que consume"><span class="addon" data-unit-label>ml</span></div></td>
                <td><input class="input input-sm" name="variants[<?= $i ?>][price]" value="<?= e(isset($vr['price']) ? rtrim(rtrim((string) $vr['price'], '0'), '.') : '') ?>" inputmode="decimal" style="width:120px" aria-label="Precio"></td>
                <td><input class="input input-sm" name="variants[<?= $i ?>][sku]" value="<?= e($vr['sku'] ?? '') ?>" style="width:120px" aria-label="SKU"></td>
                <td><input class="input input-sm" name="variants[<?= $i ?>][barcode]" value="<?= e($vr['barcode'] ?? '') ?>" style="width:140px" aria-label="Código de barras"></td>
                <td class="actions"><button class="btn btn-ghost btn-sm btn-icon" type="button" data-remove-variant aria-label="Quitar presentación"><?= icon('trash', 'icon-sm') ?></button></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
        <p class="muted mt-2 <?= $variantRows ? 'hidden' : '' ?>" data-variants-empty style="font-size:13px">Sin presentaciones: el producto se vende directamente en su unidad base.</p>
      </div>
    </section>

    <?php if (!$p): ?>
    <section class="form-section">
      <h3>Fotografía principal</h3>
      <p class="muted">JPG, PNG o WebP de hasta <?= (int) \App\Core\Config::get('app.upload_max_mb', 5) ?> MB. Se optimiza automáticamente.</p>
      <label class="dropzone" style="aspect-ratio:auto;padding:26px">
        <?= icon('upload', 'icon-lg') ?><strong>Seleccionar imagen</strong><span>o arrástrela aquí</span>
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" class="sr-only" data-preview="[data-side-preview]">
      </label>
    </section>
    <?php endif; ?>

    <div class="form-actions">
      <label class="switch" style="margin-right:auto"><input type="hidden" name="is_active" value="0"><input type="checkbox" name="is_active" value="1" <?= $v('is_active', 1) ? 'checked' : '' ?>><span class="track"></span><span>Producto activo</span></label>
      <a class="btn btn-ghost" href="<?= e(url($p ? '/products/' . $p['id'] : '/products')) ?>">Cancelar</a>
      <button class="btn btn-primary" type="submit"><?= icon('check') ?> Guardar producto</button>
    </div>
  </form>

  <aside class="span-4 stack" style="position:sticky;top:84px">
    <section class="panel" style="overflow:hidden">
      <div class="p-media" data-side-preview style="aspect-ratio:1">
        <?php if ($primary): ?><img src="<?= e(upload_url($primary['file_name'])) ?>" alt="Imagen principal"><?php else: ?><?= View::partial('partials/placeholder') ?><?php endif; ?>
      </div>
      <div class="panel-body">
        <div class="p-brand" data-preview-brand>—</div>
        <div class="p-name" style="min-height:0" data-preview-name><?= e($p['name'] ?? 'Nombre del producto') ?></div>
        <div class="row-between mt-2"><span class="p-price" data-preview-price>—</span><span class="badge badge-gold no-dot" data-preview-mode>Por unidad</span></div>
      </div>
    </section>
    <?php if ($p): ?>
    <section class="panel">
      <div class="panel-head"><div><h2>Galería</h2><div class="sub">Hasta 8 imágenes. La principal se muestra en el catálogo y el POS.</div></div></div>
      <div class="panel-body">
        <div class="gallery">
          <?php foreach ($images as $img): ?>
            <div class="g-item">
              <img src="<?= e(upload_url($img['thumb_name'])) ?>" alt="" loading="lazy">
              <?php if ((int) $img['is_primary']): ?><span class="badge badge-dark no-dot">Principal</span><?php endif; ?>
              <div class="g-actions">
                <?php if (!(int) $img['is_primary']): ?>
                <form method="post" action="<?= e(url('/products/' . $p['id'] . '/images/' . $img['id'] . '/primary')) ?>"><?= csrf_field() ?><button class="btn btn-sm btn-icon" type="submit" title="Marcar como principal" aria-label="Marcar como principal"><?= icon('check', 'icon-sm') ?></button></form>
                <?php endif; ?>
                <form method="post" action="<?= e(url('/products/' . $p['id'] . '/images/' . $img['id'] . '/delete')) ?>" data-confirm="¿Eliminar esta imagen?" data-confirm-text="La fotografía se eliminará del catálogo." data-danger data-confirm-ok="Eliminar"><?= csrf_field() ?><button class="btn btn-sm btn-icon" type="submit" aria-label="Eliminar imagen"><?= icon('trash', 'icon-sm') ?></button></form>
              </div>
            </div>
          <?php endforeach; ?>
          <?php if (count($images) < 8): ?>
          <form method="post" action="<?= e(url('/products/' . $p['id'] . '/images')) ?>" enctype="multipart/form-data" data-image-upload>
            <?= csrf_field() ?>
            <label class="dropzone"><?= icon('upload') ?><span>Agregar imagen</span>
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" class="sr-only">
            </label>
          </form>
          <?php endif; ?>
        </div>
      </div>
    </section>
    <?php endif; ?>
  </aside>
</div>
<template id="variant-row">
  <tr>
    <td><input type="hidden" data-n="id"><input type="hidden" data-n="is_active" value="1"><input class="input input-sm" data-n="name" placeholder="Decant 10 ml" aria-label="Nombre de la presentación"></td>
    <td><div class="input-group has-addon"><input class="input input-sm" data-n="base_qty" inputmode="decimal" style="width:100px" aria-label="Cantidad que consume"><span class="addon" data-unit-label>ml</span></div></td>
    <td><input class="input input-sm" data-n="price" inputmode="decimal" style="width:120px" aria-label="Precio"></td>
    <td><input class="input input-sm" data-n="sku" style="width:120px" aria-label="SKU"></td>
    <td><input class="input input-sm" data-n="barcode" style="width:140px" aria-label="Código de barras"></td>
    <td class="actions"><button class="btn btn-ghost btn-sm btn-icon" type="button" data-remove-variant aria-label="Quitar presentación"><?= icon('trash', 'icon-sm') ?></button></td>
  </tr>
</template>

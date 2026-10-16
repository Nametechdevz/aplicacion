<?php
use App\Core\View;
$stockClass = static function (array $r): string {
    if ((float) $r['available'] <= 0) { return 'is-out'; }
    if ((float) $r['min_stock'] > 0 && (float) $r['available'] <= (float) $r['min_stock']) { return 'is-low'; }
    return '';
};
$priceSuffix = static fn (array $r) => $r['sale_mode'] === 'fractional' ? ' / ' . $r['unit_code'] : '';
?>
<div class="page-head">
  <div>
    <div class="eyebrow">Catálogo</div>
    <h1>Productos</h1>
    <p><?= number_format($total, 0, ',', '.') ?> productos · existencias sumadas de las sucursales a su cargo.</p>
  </div>
  <div class="page-actions">
    <?php if (can('products.manage')): ?>
      <a class="btn" href="<?= e(url('/catalog')) ?>"><?= icon('tag') ?> Categorías y marcas</a>
      <a class="btn btn-primary" href="<?= e(url('/products/create')) ?>"><?= icon('plus') ?> Nuevo producto</a>
    <?php endif; ?>
  </div>
</div>

<section class="panel">
  <form class="toolbar" method="get" data-autosubmit>
    <div class="input-group grow">
      <?= icon('search') ?>
      <input class="input" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Nombre, código, SKU o código de barras" aria-label="Buscar productos">
    </div>
    <select class="select" name="category" aria-label="Categoría">
      <option value="">Todas las categorías</option>
      <?php foreach ($categories as $c): ?>
        <option value="<?= (int) $c['id'] ?>" <?= (int) $filters['category'] === (int) $c['id'] ? 'selected' : '' ?>><?= e(($c['parent_name'] ? '— ' : '') . $c['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <select class="select" name="brand" aria-label="Marca">
      <option value="">Todas las marcas</option>
      <?php foreach ($brands as $b): ?>
        <option value="<?= (int) $b['id'] ?>" <?= (int) $filters['brand'] === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <select class="select" name="stock" aria-label="Existencias">
      <option value="">Toda existencia</option>
      <option value="low" <?= $filters['stock'] === 'low' ? 'selected' : '' ?>>Existencia baja</option>
      <option value="out" <?= $filters['stock'] === 'out' ? 'selected' : '' ?>>Agotados</option>
    </select>
    <select class="select" name="status" aria-label="Estado">
      <option value="active" <?= $filters['status'] === 'active' ? 'selected' : '' ?>>Activos</option>
      <option value="inactive" <?= $filters['status'] === 'inactive' ? 'selected' : '' ?>>Inactivos</option>
      <option value="all" <?= $filters['status'] === 'all' ? 'selected' : '' ?>>Todos</option>
    </select>
    <select class="select" name="sort" aria-label="Ordenar">
      <option value="name" <?= $filters['sort'] === 'name' ? 'selected' : '' ?>>Nombre A–Z</option>
      <option value="price_asc" <?= $filters['sort'] === 'price_asc' ? 'selected' : '' ?>>Precio menor</option>
      <option value="price_desc" <?= $filters['sort'] === 'price_desc' ? 'selected' : '' ?>>Precio mayor</option>
      <option value="stock" <?= $filters['sort'] === 'stock' ? 'selected' : '' ?>>Menor existencia</option>
      <option value="recent" <?= $filters['sort'] === 'recent' ? 'selected' : '' ?>>Modificados recientemente</option>
    </select>
    <div class="segmented" role="group" aria-label="Vista">
      <a href="<?= e(query_with(['view' => 'grid', 'page' => null])) ?>" class="<?= $viewMode === 'grid' ? 'is-active' : '' ?>" aria-label="Vista de tarjetas" title="Tarjetas"><?= icon('layout-grid', 'icon-sm') ?></a>
      <a href="<?= e(query_with(['view' => 'table', 'page' => null])) ?>" class="<?= $viewMode === 'table' ? 'is-active' : '' ?>" aria-label="Vista de tabla" title="Tabla"><?= icon('list', 'icon-sm') ?></a>
    </div>
    <noscript><button class="btn btn-sm" type="submit">Filtrar</button></noscript>
  </form>

  <?php if (!$rows): ?>
    <?= View::partial('partials/empty', [
        'title' => $filters['q'] || $filters['category'] || $filters['brand'] || $filters['stock'] ? 'No hay productos con esos filtros' : 'Aún no hay productos',
        'text' => $filters['q'] ? 'Pruebe con otro nombre o código, o limpie los filtros.' : 'Cree el primer producto del catálogo con su fotografía, precio y unidad de venta.',
        'action' => can('products.manage') && !$filters['q'] ? ['Nuevo producto', '/products/create'] : null,
    ]) ?>
  <?php elseif ($viewMode === 'grid'): ?>
    <div class="product-grid">
      <?php foreach ($rows as $r): $sc = $stockClass($r); ?>
        <article class="p-card">
          <a href="<?= e(url('/products/' . $r['id'])) ?>" class="p-media" aria-label="<?= e($r['name']) ?>">
            <?php if ($r['thumb']): ?><img src="<?= e(upload_url($r['thumb'])) ?>" alt="" loading="lazy" decoding="async">
            <?php else: ?><?= View::partial('partials/placeholder') ?><?php endif; ?>
            <span class="p-flags">
              <?php if (!(int) $r['is_active']): ?><span class="badge badge-neutral">Inactivo</span><?php endif; ?>
              <?php if ($r['sale_mode'] === 'fractional'): ?><span class="badge badge-gold no-dot"><?= icon($r['unit_code'] === 'g' || $r['unit_code'] === 'kg' ? 'scale' : 'droplet', 'icon-sm') ?> Fraccionable</span><?php endif; ?>
            </span>
          </a>
          <?php if (can('products.manage')): ?>
            <div class="p-actions"><a class="btn btn-sm btn-icon" href="<?= e(url('/products/' . $r['id'] . '/edit')) ?>" aria-label="Editar <?= e($r['name']) ?>"><?= icon('edit', 'icon-sm') ?></a></div>
          <?php endif; ?>
          <div class="p-body">
            <div class="p-brand"><?= e($r['brand_name'] ?? 'Sin marca') ?></div>
            <a class="p-name" href="<?= e(url('/products/' . $r['id'])) ?>"><?= e($r['name']) ?></a>
            <div class="p-meta">
              <div class="p-price"><?= e(money($r['price'])) ?><small><?= e($priceSuffix($r)) ?></small></div>
              <div class="p-stock <?= $sc ?>"><?= $sc === 'is-out' ? 'Agotado' : e(qty($r['available'], $r['unit_code'])) ?></div>
            </div>
          </div>
        </article>
      <?php endforeach; ?>
    </div>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table table-stack">
        <thead><tr>
          <th>Producto</th><th>Código</th><th>Categoría</th><th>Unidad</th><th class="num">Precio</th>
          <?php if ($showCost): ?><th class="num">Costo</th><th class="num">Margen</th><?php endif; ?>
          <th class="num">Disponible</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          <?php foreach ($rows as $r): $sc = $stockClass($r);
            $margin = (float) $r['price'] > 0 ? (((float) $r['price'] - (float) $r['cost']) / (float) $r['price']) * 100 : 0; ?>
            <tr data-href="<?= e(url('/products/' . $r['id'])) ?>" class="is-clickable">
              <td class="cell-main">
                <div class="cell-product">
                  <?php if ($r['thumb']): ?><img class="thumb" src="<?= e(upload_url($r['thumb'])) ?>" alt="" loading="lazy">
                  <?php else: ?><span class="thumb" style="display:grid;place-items:center;color:var(--faint)"><?= icon('bottle', 'icon-sm') ?></span><?php endif; ?>
                  <div><div class="name"><?= e($r['name']) ?></div><div class="sub"><?= e($r['brand_name'] ?? 'Sin marca') ?><?= (int) $r['variants_count'] ? ' · ' . (int) $r['variants_count'] . ' presentaciones' : '' ?></div></div>
                </div>
              </td>
              <td data-label="Código"><span class="pill"><?= e($r['code']) ?></span></td>
              <td data-label="Categoría"><?= e($r['category_name'] ?? '—') ?><?= $r['subcategory_name'] ? '<div class="muted" style="font-size:12px">' . e($r['subcategory_name']) . '</div>' : '' ?></td>
              <td data-label="Unidad"><?= e($r['unit_name']) ?><?= $r['sale_mode'] === 'fractional' ? ' <span class="badge badge-gold no-dot">Fracc.</span>' : '' ?></td>
              <td class="num" data-label="Precio"><strong><?= e(money($r['price'])) ?></strong><span class="muted"><?= e($priceSuffix($r)) ?></span></td>
              <?php if ($showCost): ?>
                <td class="num" data-label="Costo"><?= e(money($r['cost'])) ?></td>
                <td class="num <?= $margin < (float) (setting('min_margin_pct') ?? 0) ? 'text-danger' : '' ?>" data-label="Margen"><?= e(pct($margin)) ?></td>
              <?php endif; ?>
              <td class="num" data-label="Disponible"><span class="p-stock <?= $sc ?>"><?= e(qty($r['available'], $r['unit_code'])) ?></span></td>
              <td data-label="Estado"><?= status_badge((int) $r['is_active'] ? 'active' : 'inactive') ?></td>
              <td class="actions">
                <?php if (can('products.manage')): ?><a class="btn btn-ghost btn-sm btn-icon" href="<?= e(url('/products/' . $r['id'] . '/edit')) ?>" aria-label="Editar"><?= icon('edit', 'icon-sm') ?></a><?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

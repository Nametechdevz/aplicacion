<?php
use App\Core\View;
use App\Models\Product;

$formAction = url($basePath);
$hasFilters = count(array_diff_key($query, ['orden' => 1])) > 0;
?>
<div class="container page-head">
  <nav class="breadcrumbs" aria-label="Ruta de navegación">
    <ol>
      <li><a href="<?= e(url('/')) ?>">Inicio</a></li>
      <?php if ($category || $brand): ?><li><a href="<?= e(url('catalogo')) ?>">Catálogo</a></li><?php endif; ?>
      <li aria-current="page"><?= e($heading) ?></li>
    </ol>
  </nav>
  <h1 class="page-title"><?= e($heading) ?></h1>
  <?php if (!empty($category['description'])): ?><p class="page-lead"><?= e($category['description']) ?></p><?php endif; ?>
</div>

<div class="container catalog">
  <aside class="catalog__filters">
    <details class="filters" data-filters open>
      <summary class="filters__toggle"><?= icon('filter', '', 16) ?> Filtrar productos <?= icon('chevron-down', 'filters__chevron', 16) ?></summary>
      <form method="get" action="<?= e($formAction) ?>" class="filters__form">
        <?php if ($filters['q'] !== ''): ?><input type="hidden" name="q" value="<?= e($filters['q']) ?>"><?php endif; ?>
        <?php if (isset($query['orden'])): ?><input type="hidden" name="orden" value="<?= e($query['orden']) ?>"><?php endif; ?>

        <?php if (!str_starts_with($basePath, 'categoria/')): ?>
        <fieldset class="filters__group">
          <legend>Categoría</legend>
          <select name="categoria" aria-label="Categoría">
            <option value="">Todas las categorías</option>
            <?php foreach ($categories as $c): ?>
              <option value="<?= e($c['slug']) ?>"<?= selected($c['slug'], $category['slug'] ?? '') ?>><?= e($c['name']) ?> (<?= (int) $c['product_count'] ?>)</option>
            <?php endforeach; ?>
          </select>
        </fieldset>
        <?php else: ?>
        <fieldset class="filters__group">
          <legend>Categoría</legend>
          <ul class="filters__links">
            <li><a href="<?= e(url('catalogo')) ?>">Todas las categorías</a></li>
            <?php foreach ($categories as $c): ?>
              <li><a href="<?= e(url('categoria/' . $c['slug'])) ?>"<?= ($category['id'] ?? 0) === $c['id'] ? ' aria-current="page"' : '' ?>><?= e($c['name']) ?></a></li>
            <?php endforeach; ?>
          </ul>
        </fieldset>
        <?php endif; ?>

        <?php if ($brands && !str_starts_with($basePath, 'marca/')): ?>
        <fieldset class="filters__group">
          <legend>Marca</legend>
          <select name="marca" aria-label="Marca">
            <option value="">Todas las marcas</option>
            <?php foreach ($brands as $b): ?>
              <option value="<?= e($b['slug']) ?>"<?= selected($b['slug'], $brand['slug'] ?? '') ?>><?= e($b['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </fieldset>
        <?php endif; ?>

        <?php if ($types): ?>
        <fieldset class="filters__group">
          <legend>Tipo de producto</legend>
          <select name="tipo" aria-label="Tipo de producto">
            <option value="">Todos los tipos</option>
            <?php foreach ($types as $t): ?>
              <option value="<?= e($t['name']) ?>"<?= selected($t['name'], $filters['type']) ?>><?= e($t['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </fieldset>
        <?php endif; ?>

        <fieldset class="filters__group">
          <legend>Precio (COP)</legend>
          <div class="filters__range">
            <label><span class="visually-hidden">Precio mínimo</span><input type="number" name="min" inputmode="numeric" min="0" step="1000" placeholder="Mín." value="<?= $filters['min'] !== null ? (int) $filters['min'] : '' ?>"></label>
            <span aria-hidden="true">—</span>
            <label><span class="visually-hidden">Precio máximo</span><input type="number" name="max" inputmode="numeric" min="0" step="1000" placeholder="Máx." value="<?= $filters['max'] !== null ? (int) $filters['max'] : '' ?>"></label>
          </div>
          <?php if ($priceBounds[1] > 0): ?><p class="hint">Entre <?= money($priceBounds[0]) ?> y <?= money($priceBounds[1]) ?></p><?php endif; ?>
        </fieldset>

        <fieldset class="filters__group">
          <legend>Disponibilidad</legend>
          <label class="check"><input type="checkbox" name="disponibles" value="1"<?= checked($filters['in_stock'] ? 1 : 0) ?>> <span>Solo productos disponibles</span></label>
        </fieldset>

        <div class="filters__actions">
          <button type="submit" class="btn btn--primary btn--block">Aplicar filtros</button>
          <?php if ($hasFilters): ?><a href="<?= e(url($basePath)) ?>" class="btn btn--ghost btn--block">Limpiar filtros</a><?php endif; ?>
        </div>
      </form>
    </details>
  </aside>

  <section class="catalog__results" aria-labelledby="resultados">
    <div class="catalog__toolbar">
      <p id="resultados" class="catalog__count">
        <?php if ($pager->total > 0): ?>
          Mostrando <?= $pager->from() ?>–<?= $pager->to() ?> de <?= number_es($pager->total) ?> producto<?= $pager->total === 1 ? '' : 's' ?>
        <?php else: ?>
          Sin resultados
        <?php endif; ?>
      </p>
      <form method="get" action="<?= e($formAction) ?>" class="sort-form" data-autosubmit>
        <?php foreach ($query as $k => $v): if ($k === 'orden') { continue; } ?>
          <input type="hidden" name="<?= e($k) ?>" value="<?= e($v) ?>">
        <?php endforeach; ?>
        <label for="orden">Ordenar por</label>
        <select id="orden" name="orden">
          <?php foreach (Product::SORTS as $value => $label): ?>
            <option value="<?= e($value) ?>"<?= selected($value, $filters['sort']) ?>><?= e($label) ?></option>
          <?php endforeach; ?>
        </select>
        <noscript><button type="submit" class="btn btn--ghost btn--sm">Ordenar</button></noscript>
      </form>
    </div>

    <?php if ($hasFilters): ?>
      <ul class="chips" aria-label="Filtros activos">
        <?php if ($filters['q'] !== ''): ?><li class="chip">Búsqueda: “<?= e($filters['q']) ?>”</li><?php endif; ?>
        <?php if ($category && !str_starts_with($basePath, 'categoria/')): ?><li class="chip"><?= e($category['name']) ?></li><?php endif; ?>
        <?php if ($brand && !str_starts_with($basePath, 'marca/')): ?><li class="chip"><?= e($brand['name']) ?></li><?php endif; ?>
        <?php if ($filters['type'] !== ''): ?><li class="chip"><?= e($filters['type']) ?></li><?php endif; ?>
        <?php if ($filters['min'] !== null): ?><li class="chip">Desde <?= money($filters['min']) ?></li><?php endif; ?>
        <?php if ($filters['max'] !== null): ?><li class="chip">Hasta <?= money($filters['max']) ?></li><?php endif; ?>
        <?php if ($filters['in_stock']): ?><li class="chip">Disponibles</li><?php endif; ?>
      </ul>
    <?php endif; ?>

    <?php if ($products): ?>
      <div class="product-grid product-grid--catalog">
        <?php foreach ($products as $i => $p): ?><?= View::partial('components/product-card', ['p' => $p, 'eager' => $i < 4]) ?><?php endforeach; ?>
      </div>
      <?= View::partial('components/pagination', ['pager' => $pager, 'path' => $basePath, 'query' => $query]) ?>
    <?php else: ?>
      <div class="empty-state">
        <?= icon('search', 'empty-state__icon', 40) ?>
        <h2>No encontramos productos con estos criterios</h2>
        <p><?= $filters['q'] !== '' ? 'Revisa la ortografía o prueba con un término más general.' : 'Prueba quitando algunos filtros para ver más resultados.' ?></p>
        <div class="empty-state__actions">
          <a href="<?= e(url('catalogo')) ?>" class="btn btn--primary">Ver todo el catálogo</a>
          <?php if (!empty($whatsappLink)): ?><a href="<?= e($whatsappLink) ?>" class="btn btn--ghost" target="_blank" rel="noopener">Pregúntanos por WhatsApp</a><?php endif; ?>
        </div>
      </div>
    <?php endif; ?>
  </section>
</div>

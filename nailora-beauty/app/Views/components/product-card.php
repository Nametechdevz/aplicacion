<?php
/** @var array $p */
$available = (int) $p['available_stock'] > 0;
$link = url('producto/' . $p['slug']);
$isVariant = (int) $p['has_variants'] === 1;
?>
<article class="product-card<?= $available ? '' : ' is-soldout' ?>">
  <a href="<?= e($link) ?>" class="product-card__media" tabindex="-1" aria-hidden="true">
    <img src="<?= e(image_url($p['image_path'])) ?>" alt="" loading="<?= ($eager ?? false) ? 'eager' : 'lazy' ?>" width="400" height="400" decoding="async">
    <span class="product-card__badges">
      <?php if (!$available): ?><span class="badge badge--muted">Agotado</span><?php endif; ?>
      <?php if ($p['pricing']['percent'] > 0): ?><span class="badge badge--sale">-<?= (int) $p['pricing']['percent'] ?>%</span><?php endif; ?>
      <?php if ((int) $p['is_new'] === 1): ?><span class="badge badge--new">Nuevo</span><?php endif; ?>
      <?php if ((int) $p['is_featured'] === 1 && ($showFeatured ?? true)): ?><span class="badge badge--featured">Destacado</span><?php endif; ?>
    </span>
  </a>
  <div class="product-card__body">
    <p class="product-card__meta"><?= e($p['brand_name'] ?: $p['category_name']) ?></p>
    <h3 class="product-card__title"><a href="<?= e($link) ?>"><?= e($p['name']) ?></a></h3>
    <?= App\Core\View::partial('components/price', ['pricing' => $p['pricing'], 'from' => $isVariant]) ?>
    <p class="product-card__stock <?= $available ? 'is-in' : 'is-out' ?>">
      <?= $available ? ((int) $p['available_stock'] <= 3 ? 'Últimas unidades' : 'Disponible') : 'Sin existencias' ?>
    </p>
  </div>
  <div class="product-card__actions">
    <?php if ($available && !$isVariant): ?>
      <form method="post" action="<?= e(url('carrito/agregar')) ?>" data-add-to-cart>
        <?= csrf_field() ?>
        <input type="hidden" name="product_id" value="<?= (int) $p['id'] ?>">
        <input type="hidden" name="quantity" value="1">
        <button type="submit" class="btn btn--primary btn--block btn--sm"><?= icon('bag', '', 16) ?> Añadir</button>
      </form>
    <?php elseif ($available): ?>
      <a href="<?= e($link) ?>" class="btn btn--primary btn--block btn--sm">Elegir opción</a>
    <?php else: ?>
      <a href="<?= e($link) ?>" class="btn btn--ghost btn--block btn--sm">Ver producto</a>
    <?php endif; ?>
  </div>
</article>

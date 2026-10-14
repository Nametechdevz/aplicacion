<?php
use App\Core\View;

$available = (int) $product['available_stock'] > 0;
$hasVariants = (int) $product['has_variants'] === 1;
$firstAvailable = null;
foreach ($variants as $v) {
    if ((int) $v['stock'] > 0) { $firstAvailable = $v; break; }
}
$selected = $firstAvailable ?? ($variants[0] ?? null);
$displayPricing = $selected ? $selected['pricing'] : $pricing;
$maxQty = min((int) config('app.catalog.max_cart_quantity', 50), $selected ? (int) $selected['stock'] : (int) $product['available_stock']);
$mainImage = $images[0] ?? null;
?>
<div class="container page-head page-head--compact">
  <nav class="breadcrumbs" aria-label="Ruta de navegación">
    <ol>
      <li><a href="<?= e(url('/')) ?>">Inicio</a></li>
      <li><a href="<?= e(url('categoria/' . $product['category_slug'])) ?>"><?= e($product['category_name']) ?></a></li>
      <li aria-current="page"><?= e($product['name']) ?></li>
    </ol>
  </nav>
</div>

<div class="container product-detail">
  <section class="gallery" aria-label="Imágenes del producto" data-gallery>
    <div class="gallery__main">
      <img src="<?= e(image_url($mainImage['path'] ?? null)) ?>" alt="<?= e($mainImage['alt'] ?? $product['name']) ?>" width="800" height="800" data-gallery-main fetchpriority="high">
      <?php if ($displayPricing['percent'] > 0): ?><span class="badge badge--sale gallery__badge">-<?= (int) $displayPricing['percent'] ?>%</span><?php endif; ?>
    </div>
    <?php if (count($images) > 1): ?>
      <ul class="gallery__thumbs">
        <?php foreach ($images as $i => $img): ?>
          <li>
            <a href="<?= e(image_url($img['path'])) ?>" class="gallery__thumb<?= $i === 0 ? ' is-active' : '' ?>" data-gallery-thumb data-alt="<?= e($img['alt'] ?: $product['name']) ?>" aria-label="Ver imagen <?= $i + 1 ?>">
              <img src="<?= e(image_url($img['path'])) ?>" alt="" width="96" height="96" loading="lazy">
            </a>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </section>

  <section class="product-info">
    <p class="product-info__meta">
      <a href="<?= e(url('categoria/' . $product['category_slug'])) ?>"><?= e($product['category_name']) ?></a>
      <?php if ($product['brand_name']): ?> · <a href="<?= e(url('marca/' . $product['brand_slug'])) ?>"><?= e($product['brand_name']) ?></a><?php endif; ?>
    </p>
    <h1 class="product-info__title"><?= e($product['name']) ?></h1>
    <p class="product-info__sku">Ref. <span data-variant-sku><?= e($selected['sku'] ?? $product['sku']) ?></span></p>

    <div class="product-info__price" data-price-box>
      <span class="price price--lg">
        <span class="price__current" data-price-current><?= money($displayPricing['final']) ?></span>
        <span class="price__old" data-price-old<?= $displayPricing['old_price'] ? '' : ' hidden' ?>><span class="visually-hidden">Precio anterior:</span><span data-price-old-value><?= $displayPricing['old_price'] ? money($displayPricing['old_price']) : '' ?></span></span>
      </span>
      <?php if ($displayPricing['promotion']): ?><p class="promo-note"><?= icon('tag', '', 14) ?> <?= e($displayPricing['promotion']) ?></p><?php endif; ?>
    </div>

    <?php if ($product['short_description']): ?><p class="product-info__lead"><?= e($product['short_description']) ?></p><?php endif; ?>

    <form method="post" action="<?= e(url('carrito/agregar')) ?>" class="buy-box" data-add-to-cart data-buy-box>
      <?= csrf_field() ?>
      <input type="hidden" name="product_id" value="<?= (int) $product['id'] ?>">

      <?php if ($hasVariants): ?>
        <fieldset class="variant-picker">
          <legend>Elige una opción: <strong data-variant-name><?= e($selected['name'] ?? '') ?></strong></legend>
          <div class="variant-picker__options">
            <?php foreach ($variants as $v): $out = (int) $v['stock'] <= 0; ?>
              <label class="variant-option<?= $out ? ' is-out' : '' ?>">
                <input type="radio" name="variant_id" value="<?= (int) $v['id'] ?>"
                  <?= ($selected && (int) $selected['id'] === (int) $v['id']) ? 'checked' : '' ?>
                  <?= $out ? 'disabled' : '' ?>
                  data-variant
                  data-name="<?= e($v['name']) ?>"
                  data-sku="<?= e($v['sku']) ?>"
                  data-price="<?= e(money($v['pricing']['final'])) ?>"
                  data-old="<?= e($v['pricing']['old_price'] ? money($v['pricing']['old_price']) : '') ?>"
                  data-stock="<?= (int) $v['stock'] ?>">
                <?php if ($v['color_hex']): ?>
                  <span class="variant-option__swatch is-color" style="--swatch: <?= e($v['color_hex']) ?>" title="<?= e($v['name']) ?>"></span>
                  <span class="visually-hidden"><?= e($v['name']) ?><?= $out ? ' (agotado)' : '' ?></span>
                <?php else: ?>
                  <span class="variant-option__swatch"><?= e($v['name']) ?><?= $out ? ' · agotado' : '' ?></span>
                <?php endif; ?>
              </label>
            <?php endforeach; ?>
          </div>
        </fieldset>
      <?php endif; ?>

      <p class="stock-indicator <?= $available ? 'is-in' : 'is-out' ?>" data-stock-label>
        <?php if (!$available): ?>
          <?= icon('alert', '', 16) ?> Agotado por ahora
        <?php else: $stockShown = $selected ? (int) $selected['stock'] : (int) $product['available_stock']; ?>
          <?= icon('check', '', 16) ?> <?= $stockShown <= 3 ? "¡Últimas $stockShown unidades!" : "Disponible ($stockShown unidades)" ?>
        <?php endif; ?>
      </p>

      <?php if ($available): ?>
        <div class="buy-box__row">
          <div class="qty" data-qty>
            <button type="button" class="qty__btn" data-qty-step="-1" aria-label="Disminuir cantidad"><?= icon('minus', '', 16) ?></button>
            <label for="cantidad" class="visually-hidden">Cantidad</label>
            <input id="cantidad" type="number" name="quantity" value="1" min="1" max="<?= max(1, $maxQty) ?>" inputmode="numeric" data-qty-input>
            <button type="button" class="qty__btn" data-qty-step="1" aria-label="Aumentar cantidad"><?= icon('plus', '', 16) ?></button>
          </div>
          <button type="submit" class="btn btn--primary btn--lg buy-box__submit" data-submit-label="Añadir al carrito"><?= icon('bag', '', 18) ?> Añadir al carrito</button>
        </div>
      <?php endif; ?>
    </form>

    <?php if ($consultLink): ?>
      <a href="<?= e($consultLink) ?>" class="btn btn--whatsapp btn--block" target="_blank" rel="noopener"><?= icon('chat', '', 18) ?> <?= $available ? 'Comprar o consultar por WhatsApp' : 'Preguntar disponibilidad por WhatsApp' ?></a>
    <?php endif; ?>

    <ul class="assurances">
      <li><?= icon('truck', '', 18) ?><div><strong>Envíos a toda Colombia</strong><span>Costo de envío: <?= e($shipping['pending'] ? 'se confirma por WhatsApp según tu ciudad' : $shipping['label']) ?>.</span></div></li>
      <li><?= icon('chat', '', 18) ?><div><strong>Confirmación personalizada</strong><span>Revisamos tu pedido contigo antes de despacharlo.</span></div></li>
    </ul>

    <?php if ($product['description']): ?>
      <details class="product-description" open>
        <summary>Descripción</summary>
        <div class="rich-text"><?= rich_text($product['description']) ?></div>
      </details>
    <?php endif; ?>
    <details class="product-description">
      <summary>Entregas</summary>
      <div class="rich-text"><p><?= e(setting('shipping_info', '')) ?></p></div>
    </details>
  </section>
</div>

<?php if ($related): ?>
<section class="section">
  <div class="container">
    <?= View::partial('components/section-head', ['eyebrow' => 'También te puede gustar', 'title' => 'Productos relacionados', 'link' => url('categoria/' . $product['category_slug'])]) ?>
    <div class="product-grid">
      <?php foreach ($related as $p): ?><?= View::partial('components/product-card', ['p' => $p]) ?><?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

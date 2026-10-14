<?php
use App\Core\View;

$heroImage = setting('hero_image', '');
$heroUrl = $heroImage && is_file(PUBLIC_PATH . '/' . $heroImage) ? url($heroImage) : asset('assets/images/hero.svg');
?>
<section class="hero">
  <div class="container hero__inner">
    <div class="hero__copy">
      <?php if ($eyebrow = setting('hero_eyebrow', '')): ?><p class="eyebrow"><?= e($eyebrow) ?></p><?php endif; ?>
      <h1 class="hero__title"><?= e(setting('hero_title', 'Color que se queda contigo')) ?></h1>
      <p class="hero__text"><?= e(setting('hero_subtitle', '')) ?></p>
      <div class="hero__actions">
        <a href="<?= e(url('catalogo')) ?>" class="btn btn--primary btn--lg"><?= e(setting('hero_cta_text', 'Comprar ahora')) ?></a>
        <a href="#categorias" class="btn btn--ghost btn--lg">Explorar catálogo</a>
      </div>
      <ul class="hero__facts">
        <li><?= icon('truck', '', 18) ?> Envíos a toda Colombia</li>
        <li><?= icon('chat', '', 18) ?> Confirmación por WhatsApp</li>
      </ul>
    </div>
    <div class="hero__media">
      <img src="<?= e($heroUrl) ?>" alt="Esmaltes y productos para uñas de <?= e(setting('store_name')) ?>" width="640" height="640" fetchpriority="high">
    </div>
  </div>
</section>

<?php if ($categories): ?>
<section class="section" id="categorias">
  <div class="container">
    <?= View::partial('components/section-head', ['eyebrow' => 'Explora', 'title' => 'Compra por categoría', 'link' => url('catalogo'), 'linkText' => 'Ver catálogo']) ?>
    <ul class="category-grid">
      <?php foreach ($categories as $i => $cat): ?>
        <li>
          <a class="category-tile" href="<?= e(url('categoria/' . $cat['slug'])) ?>">
            <span class="category-tile__media"><img src="<?= e(image_url($cat['image_path'])) ?>" alt="" width="300" height="300" loading="<?= $i < 4 ? 'eager' : 'lazy' ?>"></span>
            <span class="category-tile__name"><?= e($cat['name']) ?></span>
            <span class="category-tile__count"><?= (int) $cat['product_count'] ?> producto<?= (int) $cat['product_count'] === 1 ? '' : 's' ?></span>
          </a>
        </li>
      <?php endforeach; ?>
    </ul>
  </div>
</section>
<?php endif; ?>

<?php if ($featured): ?>
<section class="section section--tint">
  <div class="container">
    <?= View::partial('components/section-head', ['eyebrow' => 'Selección', 'title' => 'Productos destacados', 'link' => url('catalogo')]) ?>
    <div class="product-grid">
      <?php foreach ($featured as $p): ?><?= View::partial('components/product-card', ['p' => $p, 'showFeatured' => false]) ?><?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($onSale): ?>
<section class="section">
  <div class="container">
    <?= View::partial('components/section-head', ['eyebrow' => 'Precios especiales', 'title' => 'Ofertas vigentes', 'link' => url('catalogo')]) ?>
    <div class="product-grid">
      <?php foreach ($onSale as $p): ?><?= View::partial('components/product-card', ['p' => $p]) ?><?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($newest): ?>
<section class="section">
  <div class="container">
    <?= View::partial('components/section-head', ['eyebrow' => 'Recién llegados', 'title' => 'Novedades', 'link' => url('catalogo?orden=novedades')]) ?>
    <div class="product-grid">
      <?php foreach ($newest as $p): ?><?= View::partial('components/product-card', ['p' => $p]) ?><?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($bestSellers): ?>
<section class="section section--tint">
  <div class="container">
    <?= View::partial('components/section-head', ['eyebrow' => 'Favoritos', 'title' => 'Más vendidos']) ?>
    <div class="product-grid">
      <?php foreach ($bestSellers as $p): ?><?= View::partial('components/product-card', ['p' => $p]) ?><?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($benefits): ?>
<section class="section section--benefits">
  <div class="container">
    <ul class="benefits">
      <?php foreach ($benefits as $b): ?>
        <li class="benefit">
          <span class="benefit__icon"><?= icon($b['icon'], '', 22) ?></span>
          <div>
            <h3 class="benefit__title"><?= e($b['title']) ?></h3>
            <?php if ($b['text']): ?><p><?= e($b['text']) ?></p><?php endif; ?>
          </div>
        </li>
      <?php endforeach; ?>
    </ul>
  </div>
</section>
<?php endif; ?>

<section class="section">
  <div class="container shipping-band">
    <div class="shipping-band__copy">
      <p class="eyebrow">Entregas nacionales</p>
      <h2 class="section-title">Llegamos a todo Colombia</h2>
      <p><?= e(setting('shipping_info', '')) ?></p>
      <a href="<?= e(url('pagina/envios')) ?>" class="link-arrow">Información de envíos <?= icon('arrow-right', '', 16) ?></a>
    </div>
    <ol class="steps">
      <li><span>1</span><div><strong>Elige tus productos</strong><p>Agrégalos al carrito y revisa el resumen.</p></div></li>
      <li><span>2</span><div><strong>Registra tu pedido</strong><p>Completa tus datos de entrega en un solo paso.</p></div></li>
      <li><span>3</span><div><strong>Confirma por WhatsApp</strong><p>Validamos disponibilidad, envío y pago contigo.</p></div></li>
    </ol>
  </div>
</section>

<?php if ($brands): ?>
<section class="section section--tint">
  <div class="container">
    <?= View::partial('components/section-head', ['eyebrow' => 'Marcas', 'title' => 'Marcas disponibles']) ?>
    <ul class="brand-list">
      <?php foreach ($brands as $b): ?>
        <li><a href="<?= e(url('marca/' . $b['slug'])) ?>"><?= e($b['name']) ?></a></li>
      <?php endforeach; ?>
    </ul>
  </div>
</section>
<?php endif; ?>

<?php if (!empty($whatsappLink)): ?>
<section class="section">
  <div class="container cta-band">
    <div>
      <h2 class="cta-band__title">¿Necesitas ayuda para elegir?</h2>
      <p>Cuéntanos qué buscas y te recomendamos los productos adecuados.</p>
    </div>
    <a href="<?= e($whatsappLink) ?>" class="btn btn--light btn--lg" target="_blank" rel="noopener"><?= icon('chat', '', 18) ?> Hablar por WhatsApp</a>
  </div>
</section>
<?php endif; ?>

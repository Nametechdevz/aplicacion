<?php
use App\Core\View;

$storeName = (string) setting('store_name', 'Nailora Beauty');
$favicon = setting('favicon_path', '');
$faviconUrl = $favicon && is_file(PUBLIC_PATH . '/' . $favicon) ? url($favicon) : asset('assets/images/favicon.svg');
$promoEnabled = setting('promo_bar_enabled', '1') === '1' && trim((string) setting('promo_bar_text', '')) !== '';
$socials = array_filter([
    'Instagram' => setting('social_instagram', ''),
    'Facebook' => setting('social_facebook', ''),
    'TikTok' => setting('social_tiktok', ''),
], static fn ($u) => $u && preg_match('#^https?://#i', $u));
$searchValue = (string) (App\Core\Request::current()?->query('q') ?? '');
?>
<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($pageTitle ?? $storeName) ?></title>
  <meta name="description" content="<?= e($metaDescription ?? setting('store_description', '')) ?>">
  <meta name="robots" content="<?= e($robots ?? 'index,follow') ?>">
  <?php if (!empty($canonical)): ?><link rel="canonical" href="<?= e($canonical) ?>"><?php endif; ?>
  <meta name="theme-color" content="#6F2445">
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
  <meta property="og:site_name" content="<?= e($storeName) ?>">
  <meta property="og:title" content="<?= e($pageTitle ?? $storeName) ?>">
  <meta property="og:description" content="<?= e($metaDescription ?? setting('store_description', '')) ?>">
  <meta property="og:type" content="<?= e($ogType ?? 'website') ?>">
  <meta property="og:locale" content="es_CO">
  <?php if (!empty($canonical)): ?><meta property="og:url" content="<?= e($canonical) ?>"><?php endif; ?>
  <?php if (!empty($ogImage)): ?><meta property="og:image" content="<?= e($ogImage) ?>"><?php endif; ?>
  <link rel="icon" href="<?= e($faviconUrl) ?>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap">
  <link rel="stylesheet" href="<?= e(asset('assets/css/main.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('assets/css/storefront.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('assets/css/responsive.css')) ?>">
  <?php if (!empty($structuredData)): ?>
  <script type="application/ld+json"><?= json_encode($structuredData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
  <?php endif; ?>
</head>
<body class="store">
  <a class="skip-link" href="#contenido">Saltar al contenido</a>

  <?php if ($promoEnabled): ?>
  <div class="promo-bar"><p><?= icon('sparkles', '', 14) ?> <?= e(setting('promo_bar_text')) ?></p></div>
  <?php endif; ?>

  <header class="site-header" data-header>
    <div class="container site-header__inner">
      <button class="icon-btn site-header__menu" type="button" data-drawer-open aria-controls="menu-movil" aria-expanded="false">
        <?= icon('menu', '', 22) ?><span class="visually-hidden">Abrir menú</span>
      </button>

      <a href="<?= e(url('/')) ?>" class="site-logo" aria-label="<?= e($storeName) ?> — inicio">
        <?= View::partial('components/logo') ?>
      </a>

      <form class="site-search" action="<?= e(url('catalogo')) ?>" method="get" role="search">
        <label for="buscar" class="visually-hidden">Buscar productos</label>
        <input id="buscar" type="search" name="q" value="<?= e($searchValue) ?>" placeholder="Buscar esmaltes, geles, herramientas…" maxlength="80" autocomplete="off">
        <button type="submit" aria-label="Buscar"><?= icon('search', '', 18) ?></button>
      </form>

      <div class="site-header__actions">
        <?php if (!empty($whatsappLink)): ?>
        <a class="icon-btn hide-sm" href="<?= e($whatsappLink) ?>" target="_blank" rel="noopener" title="Escríbenos por WhatsApp">
          <?= icon('chat', '', 21) ?><span class="visually-hidden">WhatsApp</span>
        </a>
        <?php endif; ?>
        <a class="icon-btn cart-btn" href="<?= e(url('carrito')) ?>" aria-label="Carrito de compras">
          <?= icon('bag', '', 22) ?>
          <span class="cart-count<?= ($cartCount ?? 0) > 0 ? '' : ' is-empty' ?>" data-cart-count><?= (int) ($cartCount ?? 0) ?></span>
        </a>
      </div>
    </div>

    <nav class="site-nav" aria-label="Categorías">
      <div class="container">
        <ul class="site-nav__list">
          <li><a href="<?= e(url('catalogo')) ?>"<?= is_active_path('/catalogo') ? ' aria-current="page"' : '' ?>>Todo</a></li>
          <?php foreach (array_slice($navCategories ?? [], 0, 8) as $cat): ?>
            <li><a href="<?= e(url('categoria/' . $cat['slug'])) ?>"<?= is_active_path('/categoria/' . $cat['slug']) ? ' aria-current="page"' : '' ?>><?= e($cat['name']) ?></a></li>
          <?php endforeach; ?>
        </ul>
      </div>
    </nav>
  </header>

  <div class="drawer" id="menu-movil" data-drawer hidden>
    <div class="drawer__backdrop" data-drawer-close></div>
    <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="Menú">
      <div class="drawer__head">
        <?= View::partial('components/logo', ['size' => 30]) ?>
        <button class="icon-btn" type="button" data-drawer-close aria-label="Cerrar menú"><?= icon('x', '', 22) ?></button>
      </div>
      <form class="site-search site-search--drawer" action="<?= e(url('catalogo')) ?>" method="get" role="search">
        <label for="buscar-movil" class="visually-hidden">Buscar productos</label>
        <input id="buscar-movil" type="search" name="q" value="<?= e($searchValue) ?>" placeholder="Buscar productos…" maxlength="80">
        <button type="submit" aria-label="Buscar"><?= icon('search', '', 18) ?></button>
      </form>
      <nav aria-label="Menú principal">
        <ul class="drawer__nav">
          <li><a href="<?= e(url('/')) ?>">Inicio</a></li>
          <li><a href="<?= e(url('catalogo')) ?>">Catálogo completo</a></li>
          <?php foreach ($navCategories ?? [] as $cat): ?>
            <li><a href="<?= e(url('categoria/' . $cat['slug'])) ?>"><?= e($cat['name']) ?></a></li>
          <?php endforeach; ?>
        </ul>
        <ul class="drawer__nav drawer__nav--secondary">
          <li><a href="<?= e(url('carrito')) ?>">Mi carrito</a></li>
          <?php foreach ($footerPages ?? [] as $pg): ?>
            <?php if (in_array($pg['slug'], ['envios', 'preguntas-frecuentes', 'contacto'], true)): ?>
              <li><a href="<?= e(url('pagina/' . $pg['slug'])) ?>"><?= e($pg['title']) ?></a></li>
            <?php endif; ?>
          <?php endforeach; ?>
        </ul>
      </nav>
      <?php if (!empty($whatsappLink)): ?>
        <a class="btn btn--whatsapp btn--block" href="<?= e($whatsappLink) ?>" target="_blank" rel="noopener"><?= icon('chat', '', 18) ?> Escríbenos por WhatsApp</a>
      <?php endif; ?>
    </div>
  </div>

  <main id="contenido" tabindex="-1">
    <?= View::partial('components/flash', ['flashMessages' => $flashMessages ?? []]) ?>
    <?= $content ?>
  </main>

  <footer class="site-footer">
    <div class="container site-footer__grid">
      <div class="site-footer__brand">
        <a href="<?= e(url('/')) ?>" class="site-logo site-logo--footer" aria-label="<?= e($storeName) ?>"><?= View::partial('components/logo') ?></a>
        <p><?= e(setting('store_description', '')) ?></p>
        <?php if ($socials): ?>
          <ul class="social-links">
            <?php foreach ($socials as $label => $href): ?>
              <li><a href="<?= e($href) ?>" target="_blank" rel="noopener"><?= icon('link', '', 14) ?> <?= e($label) ?></a></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
      </div>
      <div>
        <h2 class="site-footer__title">Comprar</h2>
        <ul class="site-footer__links">
          <li><a href="<?= e(url('catalogo')) ?>">Catálogo</a></li>
          <?php foreach (array_slice($navCategories ?? [], 0, 5) as $cat): ?>
            <li><a href="<?= e(url('categoria/' . $cat['slug'])) ?>"><?= e($cat['name']) ?></a></li>
          <?php endforeach; ?>
        </ul>
      </div>
      <div>
        <h2 class="site-footer__title">Información</h2>
        <ul class="site-footer__links">
          <?php foreach ($footerPages ?? [] as $pg): ?>
            <li><a href="<?= e(url('pagina/' . $pg['slug'])) ?>"><?= e($pg['title']) ?></a></li>
          <?php endforeach; ?>
        </ul>
      </div>
      <div>
        <h2 class="site-footer__title">Contacto</h2>
        <ul class="site-footer__contact">
          <?php if (!empty($whatsappLink)): ?><li><?= icon('chat', '', 16) ?> <a href="<?= e($whatsappLink) ?>" target="_blank" rel="noopener">WhatsApp</a></li><?php endif; ?>
          <?php if ($phone = setting('contact_phone', '')): ?><li><?= icon('phone', '', 16) ?> <a href="tel:<?= e(preg_replace('/[^\d+]/', '', $phone)) ?>"><?= e($phone) ?></a></li><?php endif; ?>
          <?php if ($mail = setting('contact_email', '')): ?><li><?= icon('mail', '', 16) ?> <a href="mailto:<?= e($mail) ?>"><?= e($mail) ?></a></li><?php endif; ?>
          <?php if ($addr = setting('store_address', '')): ?><li><?= icon('pin', '', 16) ?> <span><?= e($addr) ?></span></li><?php endif; ?>
          <?php if ($hours = setting('business_hours', '')): ?><li><?= icon('clock', '', 16) ?> <span><?= e($hours) ?></span></li><?php endif; ?>
          <li><?= icon('truck', '', 16) ?> <span>Envíos a toda Colombia</span></li>
        </ul>
      </div>
    </div>
    <div class="container site-footer__bottom">
      <p>© <?= date('Y') ?> <?= e($storeName) ?>. Precios en pesos colombianos (COP).</p>
    </div>
  </footer>

  <?php if (!empty($whatsappLink)): ?>
  <a class="wa-float" href="<?= e($whatsappLink) ?>" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">
    <?= icon('chat', '', 26) ?>
  </a>
  <?php endif; ?>

  <div class="toast-region" aria-live="polite" aria-atomic="true" data-toast-region></div>
  <script src="<?= e(asset('assets/js/app.js')) ?>" defer></script>
  <script src="<?= e(asset('assets/js/cart.js')) ?>" defer></script>
</body>
</html>

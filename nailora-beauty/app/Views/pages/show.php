<div class="container page-head">
  <nav class="breadcrumbs" aria-label="Ruta de navegación">
    <ol><li><a href="<?= e(url('/')) ?>">Inicio</a></li><li aria-current="page"><?= e($page['title']) ?></li></ol>
  </nav>
  <h1 class="page-title"><?= e($page['title']) ?></h1>
</div>
<div class="container info-page">
  <article class="rich-text card"><?= rich_text($page['content']) ?></article>
  <?php if ($page['slug'] === 'contacto'): ?>
  <aside class="card contact-card">
    <h2 class="card__title">Canales de atención</h2>
    <ul class="site-footer__contact">
      <?php if (!empty($whatsappLink)): ?><li><?= icon('chat', '', 16) ?> <a href="<?= e($whatsappLink) ?>" target="_blank" rel="noopener">WhatsApp <?= e(format_phone(App\Services\WhatsAppService::storeNumber())) ?></a></li><?php endif; ?>
      <?php if ($phone = setting('contact_phone', '')): ?><li><?= icon('phone', '', 16) ?> <a href="tel:<?= e(preg_replace('/[^\d+]/', '', $phone)) ?>"><?= e($phone) ?></a></li><?php endif; ?>
      <?php if ($mail = setting('contact_email', '')): ?><li><?= icon('mail', '', 16) ?> <a href="mailto:<?= e($mail) ?>"><?= e($mail) ?></a></li><?php endif; ?>
      <?php if ($addr = setting('store_address', '')): ?><li><?= icon('pin', '', 16) ?> <span><?= e($addr) ?></span></li><?php endif; ?>
      <?php if ($hours = setting('business_hours', '')): ?><li><?= icon('clock', '', 16) ?> <span><?= e($hours) ?></span></li><?php endif; ?>
    </ul>
    <?php if (empty($whatsappLink) && !setting('contact_phone', '') && !setting('contact_email', '')): ?>
      <p class="muted">Los datos de contacto se publicarán próximamente.</p>
    <?php endif; ?>
  </aside>
  <?php endif; ?>
</div>

<div class="section-head">
  <div>
    <?php if (!empty($eyebrow)): ?><p class="eyebrow"><?= e($eyebrow) ?></p><?php endif; ?>
    <h2 class="section-title"><?= e($title) ?></h2>
  </div>
  <?php if (!empty($link)): ?><a href="<?= e($link) ?>" class="link-arrow"><?= e($linkText ?? 'Ver todo') ?> <?= icon('arrow-right', '', 16) ?></a><?php endif; ?>
</div>

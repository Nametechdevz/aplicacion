<?php
$logoPath = setting('logo_path', '');
$storeName = (string) setting('store_name', 'Nailora Beauty');
$parts = explode(' ', $storeName, 2);
?>
<?php if ($logoPath && is_file(PUBLIC_PATH . '/' . $logoPath)): ?>
  <img src="<?= e(url($logoPath)) ?>" alt="<?= e($storeName) ?>" class="logo-img" height="44">
<?php else: ?>
  <span class="logo-lockup">
    <?= brand_mark($size ?? 36) ?>
    <span class="logo-text"><span class="logo-word"><?= e($parts[0]) ?></span><?php if (isset($parts[1])): ?><span class="logo-sub"><?= e($parts[1]) ?></span><?php endif; ?></span>
  </span>
<?php endif; ?>

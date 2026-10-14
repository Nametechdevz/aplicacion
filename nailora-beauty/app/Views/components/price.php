<?php
/** @var array $pricing  @var bool $from */
$from = $from ?? false;
?>
<span class="price">
  <?php if ($from): ?><span class="price__from">Desde</span><?php endif; ?>
  <span class="price__current"><?= money($pricing['final']) ?></span>
  <?php if ($pricing['old_price']): ?>
    <span class="price__old"><span class="visually-hidden">Precio anterior:</span><?= money($pricing['old_price']) ?></span>
  <?php endif; ?>
</span>

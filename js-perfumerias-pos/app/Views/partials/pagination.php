<?php
$pages = max(1, (int) ceil($total / max(1, $per)));
if ($pages <= 1) { return; }
$from = ($page - 1) * $per + 1; $to = min($total, $page * $per);
$window = array_unique(array_filter([1, $page - 1, $page, $page + 1, $pages], fn ($p) => $p >= 1 && $p <= $pages));
sort($window);
?>
<div class="row-between wrap" style="width:100%">
  <span class="muted" style="font-size:12.5px">Mostrando <?= number_format($from, 0, ',', '.') ?>–<?= number_format($to, 0, ',', '.') ?> de <?= number_format($total, 0, ',', '.') ?></span>
  <nav class="pagination" aria-label="Paginación">
    <a class="<?= $page <= 1 ? 'is-disabled' : '' ?>" href="<?= e(query_with(['page' => $page - 1])) ?>" aria-label="Anterior"><?= icon('chevron-left', 'icon-sm') ?></a>
    <?php $prev = 0; foreach ($window as $p): ?>
      <?php if ($p - $prev > 1): ?><span class="is-disabled">…</span><?php endif; ?>
      <?php if ($p === $page): ?><span class="is-current" aria-current="page"><?= $p ?></span>
      <?php else: ?><a href="<?= e(query_with(['page' => $p])) ?>"><?= $p ?></a><?php endif; ?>
    <?php $prev = $p; endforeach; ?>
    <a class="<?= $page >= $pages ? 'is-disabled' : '' ?>" href="<?= e(query_with(['page' => $page + 1])) ?>" aria-label="Siguiente"><?= icon('chevron-right', 'icon-sm') ?></a>
  </nav>
</div>

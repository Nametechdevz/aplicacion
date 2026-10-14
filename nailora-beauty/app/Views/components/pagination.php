<?php
/** @var App\Core\Paginator $pager  @var string $path  @var array $query */
if (!$pager->hasPages()) {
    return;
}
$param = $param ?? 'pagina';
?>
<nav class="pagination" aria-label="Paginación">
  <?php if ($pager->page > 1): ?>
    <a class="pagination__link" href="<?= e($pager->url($pager->page - 1, $path, $query, $param)) ?>" rel="prev"><?= icon('chevron-left', '', 16) ?><span class="visually-hidden">Página anterior</span></a>
  <?php endif; ?>
  <?php foreach ($pager->window() as $n): ?>
    <?php if ($n === null): ?>
      <span class="pagination__gap" aria-hidden="true">…</span>
    <?php elseif ($n === $pager->page): ?>
      <span class="pagination__link is-current" aria-current="page"><?= $n ?></span>
    <?php else: ?>
      <a class="pagination__link" href="<?= e($pager->url($n, $path, $query, $param)) ?>"><?= $n ?></a>
    <?php endif; ?>
  <?php endforeach; ?>
  <?php if ($pager->page < $pager->lastPage): ?>
    <a class="pagination__link" href="<?= e($pager->url($pager->page + 1, $path, $query, $param)) ?>" rel="next"><span class="visually-hidden">Página siguiente</span><?= icon('chevron-right', '', 16) ?></a>
  <?php endif; ?>
</nav>

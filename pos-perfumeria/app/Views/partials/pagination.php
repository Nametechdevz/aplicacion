<?php if (($pg['pages'] ?? 1) > 1): ?>
<nav class="mt-3 d-flex justify-content-between align-items-center">
    <small class="text-muted"><?= num($pg['total']) ?> registros</small>
    <ul class="pagination pagination-sm mb-0">
        <li class="page-item <?= $pg['page'] <= 1 ? 'disabled' : '' ?>"><a class="page-link" href="<?= e(page_url($pg['page'] - 1)) ?>">&laquo;</a></li>
        <?php for ($i = max(1, $pg['page'] - 3); $i <= min($pg['pages'], $pg['page'] + 3); $i++): ?>
            <li class="page-item <?= $i === $pg['page'] ? 'active' : '' ?>"><a class="page-link" href="<?= e(page_url($i)) ?>"><?= $i ?></a></li>
        <?php endfor; ?>
        <li class="page-item <?= $pg['page'] >= $pg['pages'] ? 'disabled' : '' ?>"><a class="page-link" href="<?= e(page_url($pg['page'] + 1)) ?>">&raquo;</a></li>
    </ul>
</nav>
<?php endif; ?>

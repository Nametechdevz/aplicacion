<div class="admin-page-head">
  <div>
    <h1 class="admin-title"><?= e($title) ?></h1>
    <?php if (!empty($subtitle)): ?><p class="admin-subtitle"><?= e($subtitle) ?></p><?php endif; ?>
  </div>
  <?php if (!empty($actions)): ?><div class="admin-page-head__actions"><?= $actions ?></div><?php endif; ?>
</div>

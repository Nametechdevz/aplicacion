<?php if (!empty($flashMessages)): ?>
<div class="flash-stack" role="status" aria-live="polite">
  <?php foreach ($flashMessages as $f): ?>
    <div class="flash flash--<?= e($f['type']) ?>" data-flash>
      <?= icon($f['type'] === 'success' ? 'check' : ($f['type'] === 'error' ? 'alert' : 'info'), 'flash__icon') ?>
      <p><?= e($f['message']) ?></p>
      <button type="button" class="flash__close" data-flash-close aria-label="Cerrar mensaje"><?= icon('x', '', 16) ?></button>
    </div>
  <?php endforeach; ?>
</div>
<?php endif; ?>

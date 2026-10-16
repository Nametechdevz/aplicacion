<div class="empty">
  <svg class="illus" viewBox="0 0 120 120" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="60" cy="60" r="54" fill="var(--gold-soft)" stroke="none"/>
    <g stroke="var(--gold-strong)" stroke-width="1.6">
      <rect x="50" y="20" width="20" height="10" rx="2"/><path d="M53 30h14l3 7H50z"/>
      <path d="M38 44c0-4 3-7 7-7h30c4 0 7 3 7 7v40c0 6-5 11-11 11H49c-6 0-11-5-11-11z" fill="var(--surface)"/>
      <path d="M38 58h44" stroke-dasharray="3 4"/>
    </g>
  </svg>
  <h3><?= e($title ?? 'Sin resultados') ?></h3>
  <p><?= e($text ?? '') ?></p>
  <?php if (!empty($action)): ?><a class="btn btn-primary" href="<?= e(url($action[1])) ?>"><?= icon($action[2] ?? 'plus') ?> <?= e($action[0]) ?></a><?php endif; ?>
</div>

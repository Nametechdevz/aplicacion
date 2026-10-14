<section class="minimal-card minimal-card--center">
  <p class="error-code"><?= (int) $status ?></p>
  <h1 class="minimal-title"><?= $status === 404 ? 'No encontramos esta página' : ($status === 419 ? 'La sesión expiró' : 'Algo salió mal') ?></h1>
  <p class="muted"><?= e($message) ?></p>
  <div class="minimal-actions">
    <a href="<?= e(url('/')) ?>" class="btn btn--primary">Ir al inicio</a>
    <a href="<?= e(url('catalogo')) ?>" class="btn btn--ghost">Ver catálogo</a>
  </div>
  <?php if (!empty($debug)): ?>
    <pre class="debug-trace"><?= e(get_class($debug) . ': ' . $debug->getMessage() . "\n" . $debug->getFile() . ':' . $debug->getLine() . "\n\n" . $debug->getTraceAsString()) ?></pre>
  <?php endif; ?>
</section>

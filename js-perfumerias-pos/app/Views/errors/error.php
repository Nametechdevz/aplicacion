<?php
$titles = [403 => 'Acceso restringido', 404 => 'Página no encontrada', 405 => 'Acción no permitida', 419 => 'Sesión expirada', 422 => 'Datos no válidos', 500 => 'Algo salió mal'];
?>
<div class="error-page">
  <div class="code"><?= (int) $status ?></div>
  <h1 style="font-size:22px"><?= e($titles[$status] ?? 'Error') ?></h1>
  <p class="muted" style="max-width:52ch"><?= e($message) ?></p>
  <div class="row mt-2">
    <a class="btn btn-primary" href="<?= e(url('/')) ?>"><?= icon('arrow-left') ?> Volver al inicio</a>
  </div>
</div>

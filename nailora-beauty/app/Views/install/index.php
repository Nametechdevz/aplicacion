<?php
$allOk = !in_array(false, array_filter($requirements, static fn ($k) => !str_contains($k, 'recomendada'), ARRAY_FILTER_USE_KEY), true);
$needsAdmin = !$db['has_schema'] || $db['admins'] === 0;
?>
<section class="minimal-card">
  <h1 class="minimal-title">Instalación</h1>
  <p class="muted">Este asistente crea las tablas, el primer administrador y bloquea el instalador al terminar.</p>

  <h2 class="minimal-subtitle">Requisitos</h2>
  <ul class="checklist">
    <?php foreach ($requirements as $label => $ok): ?>
      <li class="<?= $ok ? 'is-ok' : 'is-bad' ?>"><?= icon($ok ? 'check' : 'alert', '', 16) ?> <?= e($label) ?></li>
    <?php endforeach; ?>
    <li class="<?= $db['connected'] ? 'is-ok' : 'is-bad' ?>"><?= icon($db['connected'] ? 'check' : 'alert', '', 16) ?> Conexión a la base de datos<?= $db['error'] ? ': ' . e($db['error']) : '' ?></li>
    <?php if ($db['connected']): ?>
      <li class="is-ok"><?= icon('info', '', 16) ?> Tablas: <?= $db['has_schema'] ? 'ya existen (no se modificarán)' : 'se crearán ahora' ?></li>
    <?php endif; ?>
  </ul>

  <?php if ($allOk && $db['connected']): ?>
  <form method="post" action="<?= e(url('instalar')) ?>" class="stack" data-once-submit>
    <?= csrf_field() ?>
    <div class="field<?= has_error('install_token') ? ' has-error' : '' ?>">
      <label for="install_token">Token de instalación (INSTALL_TOKEN del archivo .env)</label>
      <input id="install_token" name="install_token" type="password" required autocomplete="off">
    </div>
    <?php if ($needsAdmin): ?>
      <h2 class="minimal-subtitle">Primer administrador</h2>
      <div class="field<?= has_error('name') ? ' has-error' : '' ?>"><label for="name">Nombre</label><input id="name" name="name" required maxlength="120" value="<?= e(old('name')) ?>"><?= error_for('name') ?></div>
      <div class="field<?= has_error('email') ? ' has-error' : '' ?>"><label for="email">Correo</label><input id="email" name="email" type="email" required maxlength="190" value="<?= e(old('email')) ?>"><?= error_for('email') ?></div>
      <div class="field<?= has_error('password') ? ' has-error' : '' ?>"><label for="password">Contraseña (mínimo 10 caracteres, letras y números)</label><input id="password" name="password" type="password" required minlength="10" autocomplete="new-password"><?= error_for('password') ?></div>
      <div class="field<?= has_error('password_confirmation') ? ' has-error' : '' ?>"><label for="password_confirmation">Repita la contraseña</label><input id="password_confirmation" name="password_confirmation" type="password" required autocomplete="new-password"><?= error_for('password_confirmation') ?></div>
    <?php else: ?>
      <p class="notice"><?= icon('info', '', 16) ?> Ya existe al menos un administrador: no se creará otro.</p>
    <?php endif; ?>
    <div class="field"><label for="whatsapp_number">Número de WhatsApp de la tienda (opcional, ej. 573001234567)</label><input id="whatsapp_number" name="whatsapp_number" inputmode="tel" maxlength="20" value="<?= e(old('whatsapp_number')) ?>"></div>
    <label class="check"><input type="checkbox" name="load_demo" value="1"> <span>Cargar datos de demostración (productos genéricos con SKU DEMO-)</span></label>
    <button type="submit" class="btn btn--primary btn--block">Instalar</button>
  </form>
  <?php else: ?>
    <p class="notice notice--warning"><?= icon('alert', '', 16) ?> Corrija los requisitos marcados y recargue esta página.</p>
  <?php endif; ?>
</section>

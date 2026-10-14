<section class="minimal-card">
  <h1 class="minimal-title">Administración</h1>
  <p class="muted">Ingrese con su cuenta de administrador.</p>
  <form method="post" action="<?= e(url('admin/login')) ?>" class="stack" data-once-submit>
    <?= csrf_field() ?>
    <div class="field">
      <label for="email">Correo electrónico</label>
      <input id="email" name="email" type="email" required autocomplete="username" maxlength="190" value="<?= e(old('email')) ?>" autofocus>
    </div>
    <div class="field">
      <label for="password">Contraseña</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" maxlength="128">
    </div>
    <button type="submit" class="btn btn--primary btn--block btn--lg" data-loading-text="Verificando…"><?= icon('lock', '', 18) ?> Iniciar sesión</button>
  </form>
  <p class="hint hint--center"><a href="<?= e(url('/')) ?>">← Volver a la tienda</a></p>
</section>

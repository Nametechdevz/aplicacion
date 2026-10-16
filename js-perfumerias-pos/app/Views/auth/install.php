<div class="auth" style="grid-template-columns:minmax(0,1fr)">
  <section class="auth-form">
    <div class="auth-card" style="max-width:460px">
      <div class="auth-mobile-brand" style="display:flex"><span class="brand-mark" style="color:var(--gold-strong);border-color:var(--gold)">JS</span><span class="brand-name" style="font-family:var(--font-display);font-weight:600;font-size:24px">JS Perfumerías</span></div>
      <div class="eyebrow">Instalación</div>
      <h1>Primer superadministrador</h1>
      <p class="lead">Se crearán las tablas de la base de datos y la cuenta principal. Esta página deja de existir al terminar.</p>
      <form method="post" action="<?= e(url('/install')) ?>" autocomplete="off">
        <?= csrf_field() ?>
        <?php foreach ([['install_token', 'Código de instalación (INSTALL_TOKEN del .env)', 'password', ''], ['name', 'Nombre completo', 'text', ''], ['username', 'Usuario (minúsculas)', 'text', ''], ['email', 'Correo (opcional)', 'email', ''], ['password', 'Contraseña (mín. 10, letras y números)', 'password', ''], ['password_confirmation', 'Repita la contraseña', 'password', '']] as [$n, $l, $t]): ?>
          <div class="field">
            <label for="<?= $n ?>"><?= e($l) ?></label>
            <input class="input <?= field_error($n) ? 'is-invalid' : '' ?>" id="<?= $n ?>" name="<?= $n ?>" type="<?= $t ?>" value="<?= in_array($t, ['password'], true) ? '' : e(old($n)) ?>" <?= $n === 'email' ? '' : 'required' ?>>
            <?php if ($err = field_error($n)): ?><span class="error"><?= e($err) ?></span><?php endif; ?>
          </div>
        <?php endforeach; ?>
        <button class="btn btn-primary btn-lg btn-block" type="submit"><span class="spinner"></span> Instalar</button>
      </form>
    </div>
  </section>
</div>

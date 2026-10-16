<?php $roleLabels = ['superadmin' => 'Superadministrador', 'branch_admin' => 'Administrador de sucursal', 'cashier' => 'Cajero / vendedor']; ?>
<div class="page-head">
  <div><div class="eyebrow">Cuenta</div><h1>Mi cuenta</h1><p>Datos de acceso, sucursales asignadas y seguridad.</p></div>
</div>
<div class="grid grid-12">
  <section class="panel span-5">
    <div class="panel-body">
      <div class="row" style="gap:14px">
        <span class="avatar avatar-lg"><?= e(initials($user['name'])) ?></span>
        <div><h2 style="font-size:18px"><?= e($user['name']) ?></h2><div class="muted">@<?= e($user['username']) ?></div></div>
      </div>
      <dl class="dl mt-3">
        <dt>Rol</dt><dd><?= e(implode(', ', array_map(fn ($r) => $roleLabels[$r] ?? $r, $roles))) ?></dd>
        <dt>Correo</dt><dd><?= e($user['email'] ?: '—') ?></dd>
        <dt>Último acceso</dt><dd><?= e(fmt_dt($user['last_login_at'])) ?></dd>
        <dt>Contraseña cambiada</dt><dd><?= e(fmt_dt($user['password_changed_at'])) ?></dd>
      </dl>
      <div class="mt-3">
        <div class="label mb-2">Sucursales asignadas</div>
        <div class="row wrap">
          <?php foreach ($branches as $b): ?><span class="badge <?= $b['is_default'] ? 'badge-gold' : 'badge-neutral' ?>"><?= e($b['name']) ?></span><?php endforeach; ?>
          <?php if (!$branches): ?><span class="muted"><?= can('branches.all') ? 'Acceso a todas las sucursales' : 'Sin sucursales asignadas' ?></span><?php endif; ?>
        </div>
      </div>
    </div>
  </section>
  <section class="panel span-7">
    <div class="panel-head"><div><h2>Cambiar contraseña</h2><div class="sub">Mínimo 10 caracteres, con letras y números.</div></div></div>
    <form method="post" action="<?= e(url('/profile/password')) ?>" class="panel-body">
      <?= csrf_field() ?>
      <div class="form-grid">
        <div class="field col-12"><label for="cp">Contraseña actual</label><input class="input <?= field_error('current_password') ? 'is-invalid' : '' ?>" id="cp" type="password" name="current_password" required autocomplete="current-password">
          <?php if ($err = field_error('current_password')): ?><span class="error"><?= e($err) ?></span><?php endif; ?></div>
        <div class="field col-6"><label for="np">Nueva contraseña</label><input class="input <?= field_error('password') ? 'is-invalid' : '' ?>" id="np" type="password" name="password" minlength="10" required autocomplete="new-password">
          <?php if ($err = field_error('password')): ?><span class="error"><?= e($err) ?></span><?php endif; ?></div>
        <div class="field col-6"><label for="np2">Confirmar contraseña</label><input class="input <?= field_error('password_confirmation') ? 'is-invalid' : '' ?>" id="np2" type="password" name="password_confirmation" minlength="10" required autocomplete="new-password">
          <?php if ($err = field_error('password_confirmation')): ?><span class="error"><?= e($err) ?></span><?php endif; ?></div>
      </div>
      <div class="row mt-3" style="justify-content:flex-end"><button class="btn btn-primary" type="submit"><?= icon('key') ?> Actualizar contraseña</button></div>
    </form>
  </section>
</div>

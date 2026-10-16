<?php
$val = static fn (string $k) => old($k, $user[$k] ?? '');
$err = static fn (string $k) => field_error($k) ? '<span class="error">' . icon('alert', 'icon-sm') . e(field_error($k)) . '</span>' : '';
$selRoles = old('roles', $access['roles']) ?: ['cashier'];
$selBranches = array_map('intval', old('branches', $access['branches']) ?: []);
$grants = old('grants', $access['grants']);
$denies = old('denies', $access['denies']);
$roleDesc = [
  'superadmin' => 'Control global de la empresa y todas las sucursales.',
  'branch_admin' => 'Gestiona equipo, ventas, cierres y autorizaciones de sus sucursales.',
  'cashier' => 'Vende en el POS y opera su caja dentro de sus límites.',
];
$modules = [];
foreach ($permissions as $p) { $modules[$p['module']][] = $p; }
$moduleNames = ['dashboard' => 'Panel', 'branches' => 'Sucursales', 'users' => 'Usuarios', 'products' => 'Productos', 'inventory' => 'Inventario', 'transfers' => 'Transferencias', 'pos' => 'Punto de venta', 'sales' => 'Ventas', 'returns' => 'Devoluciones', 'cash' => 'Caja', 'purchases' => 'Compras', 'customers' => 'Clientes', 'reports' => 'Reportes', 'audit' => 'Auditoría', 'settings' => 'Configuración'];
?>
<div class="page-head">
  <div><div class="eyebrow"><?= $user ? 'Editar usuario' : 'Nuevo usuario' ?></div><h1><?= e($user['name'] ?? 'Registrar usuario') ?></h1>
    <p>Defina el rol, las sucursales donde trabaja y, si es necesario, permisos individuales adicionales o restringidos.</p></div>
  <div class="page-actions"><a class="btn btn-ghost" href="<?= e(url('/users')) ?>">Cancelar</a><button class="btn btn-primary" type="submit" form="user-form"><?= icon('check') ?> Guardar usuario</button></div>
</div>

<form id="user-form" method="post" action="<?= e(url($user ? '/users/' . $user['id'] : '/users')) ?>" class="grid grid-12" style="align-items:start" data-user-form autocomplete="off">
  <?= csrf_field() ?>
  <div class="panel span-8">
    <section class="form-section">
      <h3>Datos personales</h3><p class="muted">El usuario se escribe en minúsculas y se usa para iniciar sesión.</p>
      <div class="form-grid">
        <div class="field col-6"><label for="u-name">Nombre completo<span class="req">*</span></label><input class="input <?= field_error('name') ? 'is-invalid' : '' ?>" id="u-name" name="name" required maxlength="120" value="<?= e($val('name')) ?>"><?= $err('name') ?></div>
        <div class="field col-6"><label for="u-username">Usuario<span class="req">*</span></label><div class="input-group"><span class="icon" style="left:13px;width:auto;color:var(--muted)">@</span><input class="input <?= field_error('username') ? 'is-invalid' : '' ?>" id="u-username" name="username" required pattern="[a-z0-9._\-]{3,60}" value="<?= e($val('username')) ?>" autocapitalize="none" spellcheck="false"></div><?= $err('username') ?></div>
        <div class="field col-6"><label for="u-email">Correo</label><input class="input <?= field_error('email') ? 'is-invalid' : '' ?>" id="u-email" name="email" type="email" maxlength="160" value="<?= e($val('email')) ?>"><?= $err('email') ?></div>
        <div class="field col-6"><label for="u-phone">Teléfono</label><input class="input" id="u-phone" name="phone" maxlength="40" value="<?= e($val('phone')) ?>"></div>
      </div>
    </section>
    <section class="form-section">
      <div class="row-between"><div><h3><?= $user ? 'Restablecer contraseña' : 'Contraseña inicial' ?></h3><p class="muted" style="margin:0"><?= $user ? 'Déjela en blanco para conservar la actual.' : 'Mínimo 10 caracteres, con letras y números.' ?></p></div>
        <button class="btn btn-sm" type="button" data-generate><?= icon('sparkle', 'icon-sm') ?> Generar segura</button></div>
      <div class="form-grid mt-2">
        <div class="field col-6"><label for="u-pass">Contraseña<?= $user ? '' : '<span class="req">*</span>' ?></label><input class="input <?= field_error('password') ? 'is-invalid' : '' ?>" id="u-pass" name="password" type="password" minlength="10" <?= $user ? '' : 'required' ?> autocomplete="new-password"><?= $err('password') ?></div>
        <div class="field col-6"><label for="u-pass2">Confirmar contraseña</label><input class="input <?= field_error('password_confirmation') ? 'is-invalid' : '' ?>" id="u-pass2" name="password_confirmation" type="password" minlength="10" autocomplete="new-password"><?= $err('password_confirmation') ?></div>
      </div>
      <div class="callout callout-gold mt-2 hidden" data-generated><?= icon('key', 'icon-sm') ?><span></span></div>
    </section>
    <section class="form-section">
      <h3>Rol</h3><p class="muted">El rol define los permisos base. Un administrador de sucursal solo puede crear cajeros.</p>
      <div class="grid grid-3" style="gap:12px">
        <?php foreach ($roles as $r): ?>
          <label class="method" style="cursor:pointer;min-height:120px;<?= in_array($r['code'], $selRoles, true) ? '' : '' ?>">
            <span class="row-between" style="width:100%"><strong><?= e($r['name']) ?></strong><input type="radio" name="roles[]" value="<?= e($r['code']) ?>" <?= in_array($r['code'], $selRoles, true) ? 'checked' : '' ?> data-role style="accent-color:var(--carbon);width:18px;height:18px"></span>
            <span class="muted" style="font-weight:500;font-size:12.5px"><?= e($roleDesc[$r['code']] ?? '') ?></span>
          </label>
        <?php endforeach; ?>
      </div>
      <?= $err('roles') ?>
    </section>
    <?php if (can('users.manage')): ?>
    <section class="form-section">
      <h3>Permisos individuales</h3><p class="muted">Ajustes puntuales sobre el rol: por ejemplo, permitir ajustes de inventario a un administrador o restringir anulaciones.</p>
      <div class="stack" style="gap:14px">
        <?php foreach ($modules as $mod => $perms): ?>
          <div>
            <div class="label mb-2" style="text-transform:uppercase;letter-spacing:.12em;font-size:10.5px;color:var(--muted)"><?= e($moduleNames[$mod] ?? $mod) ?></div>
            <div class="panel" style="box-shadow:none">
              <?php foreach ($perms as $i => $p):
                $state = in_array($p['code'], $grants, true) ? 'grant' : (in_array($p['code'], $denies, true) ? 'deny' : ''); ?>
                <div class="row-between" style="padding:9px 14px;<?= $i ? 'border-top:1px solid var(--line)' : '' ?>">
                  <div style="min-width:0"><div style="font-size:13.5px;font-weight:500"><?= e($p['name']) ?></div><div class="muted" style="font-size:11.5px"><?= e($p['code']) ?> · <span data-by-role="<?= e($p['code']) ?>"></span></div></div>
                  <select class="select select-sm" style="width:150px" data-perm="<?= e($p['code']) ?>" aria-label="Permiso <?= e($p['name']) ?>">
                    <option value="" <?= $state === '' ? 'selected' : '' ?>>Según rol</option>
                    <option value="grant" <?= $state === 'grant' ? 'selected' : '' ?>>Conceder</option>
                    <option value="deny" <?= $state === 'deny' ? 'selected' : '' ?>>Negar</option>
                  </select>
                </div>
              <?php endforeach; ?>
            </div>
          </div>
        <?php endforeach; ?>
      </div>
      <div data-perm-hidden></div>
    </section>
    <?php endif; ?>
    <div class="form-actions"><a class="btn btn-ghost" href="<?= e(url('/users')) ?>">Cancelar</a><button class="btn btn-primary" type="submit"><?= icon('check') ?> Guardar usuario</button></div>
  </div>

  <aside class="span-4 stack" style="position:sticky;top:84px">
    <section class="panel">
      <div class="panel-head"><div><h2>Sucursales</h2><div class="sub">Dónde puede operar y consultar información</div></div></div>
      <div class="panel-body stack" style="gap:8px">
        <?php foreach ($branches as $b): $checked = in_array((int) $b['id'], $selBranches, true); ?>
          <div class="row-between panel" style="padding:10px 12px;box-shadow:none">
            <label class="check"><input type="checkbox" name="branches[]" value="<?= (int) $b['id'] ?>" <?= $checked ? 'checked' : '' ?>> <?= icon($b['type'] === 'warehouse' ? 'boxes' : 'store', 'icon-sm muted') ?> <?= e($b['name']) ?></label>
            <label class="check" style="font-size:12px;color:var(--muted)" title="Sucursal predeterminada al iniciar sesión"><input type="radio" name="default_branch" value="<?= (int) $b['id'] ?>" <?= (int) $defaultBranch === (int) $b['id'] ? 'checked' : '' ?>> Principal</label>
          </div>
        <?php endforeach; ?>
        <?= $err('branches') ?>
        <p class="muted" style="font-size:12px">El superadministrador accede a todas las sucursales aunque no estén marcadas.</p>
      </div>
    </section>
    <?php if (can('discounts.configure')): ?>
    <section class="panel">
      <div class="panel-head"><div><h2>Límite de descuento</h2><div class="sub">Vacío = usa el límite de su rol</div></div></div>
      <div class="panel-body">
        <div class="input-group has-addon"><input class="input" name="discount_limit" inputmode="decimal" value="<?= e($ownLimit !== null ? rtrim(rtrim((string) $ownLimit, '0'), '.') : '') ?>" placeholder="Según rol"><span class="addon">%</span></div>
        <p class="muted mt-2" style="font-size:12px">Descuentos superiores requieren autorización de un supervisor. También aplican límites por sucursal y por producto.</p>
      </div>
    </section>
    <?php endif; ?>
  </aside>
</form>
<script type="application/json" id="role-perms"><?= json_encode($rolePerms, JSON_HEX_TAG | JSON_HEX_AMP) ?></script>

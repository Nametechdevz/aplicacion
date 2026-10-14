<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Usuarios administradores', 'subtitle' => 'Todos los usuarios tienen rol de administrador con acceso completo al panel.']) ?>
<div class="admin-grid admin-grid--form">
  <div class="panel panel--flush">
    <div class="table-wrap">
      <table class="table table--responsive">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Último acceso</th><th>Estado</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
        <tbody>
        <?php foreach ($users as $u): ?>
          <tr>
            <td data-label="Nombre" class="strong"><?= e($u['name']) ?><?= (int) $u['id'] === auth_id() ? ' <span class="badge">Usted</span>' : '' ?></td>
            <td data-label="Correo"><?= e($u['email']) ?></td>
            <td data-label="Último acceso"><?= e(date_es($u['last_login_at'], true)) ?></td>
            <td data-label="Estado"><?= (int) $u['is_active'] ? '<span class="badge badge--success">Activo</span>' : '<span class="badge badge--muted">Inactivo</span>' ?></td>
            <td class="actions"><?php if ((int) $u['id'] !== auth_id()): ?><form method="post" action="<?= e(url('admin/usuarios/' . $u['id'] . '/estado')) ?>" data-confirm="¿<?= (int) $u['is_active'] ? 'Desactivar' : 'Activar' ?> a <?= e($u['name']) ?>?"><?= csrf_field() ?><button class="btn btn--ghost btn--xs"><?= (int) $u['is_active'] ? 'Desactivar' : 'Activar' ?></button></form><?php endif; ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
  <form method="post" action="<?= e(url('admin/usuarios')) ?>" class="panel stack" data-once-submit>
    <?= csrf_field() ?>
    <h2 class="panel__title">Nuevo administrador</h2>
    <div class="field<?= has_error('name') ? ' has-error' : '' ?>"><label for="u-name">Nombre</label><input id="u-name" name="name" required maxlength="120" value="<?= e(old('name')) ?>"><?= error_for('name') ?></div>
    <div class="field<?= has_error('email') ? ' has-error' : '' ?>"><label for="u-email">Correo</label><input id="u-email" name="email" type="email" required maxlength="190" value="<?= e(old('email')) ?>"><?= error_for('email') ?></div>
    <div class="field<?= has_error('password') ? ' has-error' : '' ?>"><label for="u-pass">Contraseña inicial</label><input id="u-pass" name="password" type="password" required minlength="10" autocomplete="new-password"><p class="hint">Mínimo 10 caracteres con letras y números.</p><?= error_for('password') ?></div>
    <button type="submit" class="btn btn--primary btn--block">Crear usuario</button>
  </form>
</div>

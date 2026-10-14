<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Mi perfil', 'subtitle' => $user['email']]) ?>
<form method="post" action="<?= e(url('admin/perfil')) ?>" class="panel admin-form-narrow stack" data-once-submit>
  <?= csrf_field() ?>
  <div class="field<?= has_error('name') ? ' has-error' : '' ?>"><label for="name">Nombre</label><input id="name" name="name" required maxlength="120" value="<?= e(old('name', $user['name'])) ?>"><?= error_for('name') ?></div>
  <h2 class="panel__title">Cambiar contraseña <span class="optional">(opcional)</span></h2>
  <div class="field<?= has_error('current_password') ? ' has-error' : '' ?>"><label for="current_password">Contraseña actual</label><input id="current_password" name="current_password" type="password" autocomplete="current-password"><?= error_for('current_password') ?></div>
  <div class="field<?= has_error('password') ? ' has-error' : '' ?>"><label for="password">Nueva contraseña</label><input id="password" name="password" type="password" minlength="10" autocomplete="new-password"><?= error_for('password') ?></div>
  <div class="field<?= has_error('password_confirmation') ? ' has-error' : '' ?>"><label for="password_confirmation">Repita la nueva contraseña</label><input id="password_confirmation" name="password_confirmation" type="password" autocomplete="new-password"><?= error_for('password_confirmation') ?></div>
  <div class="form-actions"><button type="submit" class="btn btn--primary">Guardar</button></div>
</form>

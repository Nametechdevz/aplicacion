<div class="row"><div class="col-lg-6"><div class="card"><div class="card-body">
<form method="post" action="<?= url(empty($u['id']) ? '/users' : '/users/' . $u['id']) ?>" class="row g-3">
    <?= csrf_field() ?>
    <div class="col-12"><label class="form-label">Nombre *</label><input name="name" class="form-control" value="<?= e($u['name'] ?? '') ?>" required></div>
    <div class="col-12"><label class="form-label">Correo (usuario de ingreso) *</label><input type="email" name="email" class="form-control" value="<?= e($u['email'] ?? '') ?>" required></div>
    <div class="col-12"><label class="form-label">Contraseña <?= empty($u['id']) ? '*' : '<small class="text-muted">(déjala vacía para no cambiarla)</small>' ?></label><input type="password" name="password" class="form-control" minlength="8" autocomplete="new-password" <?= empty($u['id']) ? 'required' : '' ?>></div>
    <div class="col-md-6"><label class="form-label">Rol</label><select name="role" class="form-select"><option value="cajero" <?= $u['role'] === 'cajero' ? 'selected' : '' ?>>Cajero</option><option value="admin" <?= $u['role'] === 'admin' ? 'selected' : '' ?>>Administrador</option></select></div>
    <div class="col-md-6 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="active" value="1" id="act" <?= !empty($u['active']) ? 'checked' : '' ?>><label class="form-check-label" for="act">Activo</label></div></div>
    <div class="col-12"><button class="btn btn-primary">Guardar</button> <a href="<?= url('/users') ?>" class="btn btn-light">Cancelar</a></div>
</form>
</div></div></div></div>

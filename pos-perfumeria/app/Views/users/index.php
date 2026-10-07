<a href="<?= url('/users/create') ?>" class="btn btn-primary mb-3"><i class="bi bi-person-plus"></i> Nuevo usuario</a>
<div class="card"><div class="table-responsive">
<table class="table table-hover align-middle mb-0">
    <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($users as $u): ?>
        <tr class="<?= $u['active'] ? '' : 'text-muted' ?>">
            <td class="fw-semibold"><?= e($u['name']) ?></td><td><?= e($u['email']) ?></td>
            <td><span class="badge <?= $u['role'] === 'admin' ? 'text-bg-primary' : 'text-bg-light' ?>"><?= e(ucfirst($u['role'])) ?></span></td>
            <td><?= $u['active'] ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Inactivo</span>' ?></td>
            <td class="small"><?= $u['last_login_at'] ? fdate($u['last_login_at'], 'd/m/Y H:i') : '—' ?></td>
            <td class="text-end"><a href="<?= url('/users/' . $u['id'] . '/edit') ?>" class="btn btn-sm btn-light"><i class="bi bi-pencil"></i></a></td>
        </tr>
    <?php endforeach; ?>
    </tbody>
</table></div></div>
<div class="small text-muted mt-2"><b>Administrador:</b> acceso total. <b>Cajero:</b> vende, abre/cierra su caja, consulta productos, clientes e inventario; no ve costos ni reportes, no hace devoluciones y su descuento máximo se define en Configuración.</div>

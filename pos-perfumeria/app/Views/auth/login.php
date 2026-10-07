<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Iniciar sesión · <?= e(setting('company_trade_name', 'POS Perfumería')) ?></title>
    <link href="<?= asset('vendor/bootstrap/bootstrap.min.css') ?>" rel="stylesheet">
    <link href="<?= asset('vendor/bootstrap-icons/bootstrap-icons.min.css') ?>" rel="stylesheet">
    <link href="<?= asset('css/app.css') ?>" rel="stylesheet">
</head>
<body>
<div class="login-wrap">
    <div class="card login-card p-4">
        <div class="text-center mb-3">
            <div class="logo"><i class="bi bi-droplet-half"></i></div>
            <h1 class="h4 mb-0"><?= e(setting('company_trade_name', 'POS Perfumería')) ?></h1>
            <div class="text-muted small">Sistema de punto de venta</div>
        </div>
        <?php foreach (flashes() as $f): ?>
            <div class="alert alert-<?= e($f['type']) ?> py-2 small"><?= e($f['message']) ?></div>
        <?php endforeach; ?>
        <form method="post" action="<?= url('/login') ?>">
            <?= csrf_field() ?>
            <div class="mb-3">
                <label class="form-label">Correo</label>
                <input type="email" name="email" class="form-control form-control-lg" value="<?= e(old('email')) ?>" required autofocus>
            </div>
            <div class="mb-3">
                <label class="form-label">Contraseña</label>
                <input type="password" name="password" class="form-control form-control-lg" required>
            </div>
            <button class="btn btn-primary btn-lg w-100">Ingresar</button>
        </form>
    </div>
</div>
</body>
</html>
<?php clear_old(); ?>

<?php use App\Core\View; ?>
<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title><?= e($pageTitle ?? 'Nailora Beauty') ?></title>
  <link rel="icon" href="<?= e(asset('assets/images/favicon.svg')) ?>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap">
  <link rel="stylesheet" href="<?= e(asset('assets/css/main.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('assets/css/admin.css')) ?>">
</head>
<body class="minimal">
  <main class="minimal__main">
    <a href="<?= e(url('/')) ?>" class="minimal__logo"><?= View::partial('components/logo') ?></a>
    <?= View::partial('components/flash', ['flashMessages' => $flashMessages ?? []]) ?>
    <?= $content ?>
  </main>
  <script src="<?= e(asset('assets/js/app.js')) ?>" defer></script>
</body>
</html>

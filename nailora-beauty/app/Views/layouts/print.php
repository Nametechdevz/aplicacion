<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title><?= e($pageTitle ?? 'Imprimir') ?></title>
  <link rel="stylesheet" href="<?= e(asset('assets/css/main.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('assets/css/admin.css')) ?>">
</head>
<body class="print-page">
  <?= $content ?>
  <script src="<?= e(asset('assets/js/admin.js')) ?>" defer></script>
</body>
</html>

<?php use App\Core\Session; $flashes = Session::flashes(); ?><!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
  <meta name="base-url" content="<?= e(rtrim(url('/'), '/')) ?>">
  <meta name="theme-color" content="#151515">
  <meta name="robots" content="noindex, nofollow">
  <title><?= e(($title ?? 'Iniciar sesión') . ' · JS Perfumerías') ?></title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700;800&display=swap">
  <script src="<?= e(asset('js/theme-init.js')) ?>"></script>
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body>
<?= \App\Core\View::partial('partials/icons') ?>
<?= $content ?>
<div class="toasts" aria-live="polite"></div>
<script type="application/json" id="flash-data"><?= json_encode($flashes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?></script>
<script src="<?= e(asset('js/app.js')) ?>"></script>
</body>
</html>

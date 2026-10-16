<?php /** Pantalla de inicio de sesión. */ ?>
<div class="auth">
  <section class="auth-art" aria-hidden="true">
    <svg class="art-lines" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" fill="none">
      <defs>
        <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#C5A46D" stop-opacity=".0"/>
          <stop offset=".45" stop-color="#C5A46D" stop-opacity=".55"/>
          <stop offset="1" stop-color="#C5A46D" stop-opacity=".05"/>
        </linearGradient>
        <radialGradient id="glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stop-color="#C5A46D" stop-opacity=".18"/>
          <stop offset="1" stop-color="#C5A46D" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="400" cy="430" r="250" fill="url(#glow)"/>
      <!-- Frasco de perfume en trazo fino -->
      <g stroke="url(#gl)" stroke-width="1.2">
        <rect x="352" y="214" width="96" height="44" rx="6"/>
        <rect x="372" y="186" width="56" height="28" rx="4"/>
        <path d="M376 258h48l10 26H366z"/>
        <path d="M300 300c0-10 8-16 18-16h164c10 0 18 6 18 16v260c0 30-22 52-52 52H352c-30 0-52-22-52-52z"/>
        <path d="M318 330h164M318 540h164" stroke-opacity=".5"/>
        <path d="M330 300v250M470 300v250" stroke-opacity=".25"/>
      </g>
      <g stroke="#C5A46D" stroke-opacity=".14" stroke-width="1">
        <circle cx="400" cy="430" r="320"/>
        <circle cx="400" cy="430" r="380"/>
        <path d="M0 640C140 590 260 600 400 640S660 700 800 650"/>
        <path d="M0 680C150 630 270 640 410 680S660 740 800 690"/>
      </g>
      <g fill="#C5A46D">
        <circle cx="240" cy="250" r="1.6" opacity=".6"/><circle cx="560" cy="330" r="1.2" opacity=".5"/>
        <circle cx="520" cy="190" r="1.8" opacity=".4"/><circle cx="200" cy="470" r="1.2" opacity=".5"/>
      </g>
    </svg>
    <div class="brand-lockup">
      <span class="brand-mark">JS</span>
      <span class="brand-text"><span class="brand-name">JS Perfumerías</span><span class="brand-sub">Point of Sale</span></span>
    </div>
    <blockquote>
      <p>Cada fragancia,<br>cada sucursal,<br><em>en perfecto orden.</em></p>
      <footer>Ventas · Inventario · Caja</footer>
    </blockquote>
    <div class="art-foot">
      <span><?= icon('shield') ?> Acceso protegido</span>
      <span><?= icon('store') ?> Multisucursal</span>
    </div>
  </section>

  <section class="auth-form">
    <div class="auth-card">
      <div class="auth-mobile-brand">
        <span class="brand-mark">JS</span>
        <span class="brand-name" style="font-family:var(--font-display);font-weight:600">JS Perfumerías</span>
      </div>
      <div class="eyebrow">Bienvenido</div>
      <h1>Iniciar sesión</h1>
      <p class="lead">Ingrese con el usuario asignado por la administración.</p>

      <form method="post" action="<?= e(url('/login')) ?>" novalidate>
        <?= csrf_field() ?>
        <div class="field">
          <label for="username">Usuario</label>
          <div class="input-group">
            <?= icon('user') ?>
            <input class="input <?= field_error('username') ? 'is-invalid' : '' ?>" id="username" name="username" type="text"
                   autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus
                   value="<?= e(old('username')) ?>" placeholder="usuario">
          </div>
        </div>
        <div class="field">
          <label for="password">Contraseña</label>
          <div class="input-group" style="position:relative">
            <?= icon('lock') ?>
            <input class="input" id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••••">
            <button type="button" class="icon-btn pw-toggle" data-pw-toggle aria-label="Mostrar contraseña" style="width:34px;height:34px"><?= icon('eye', 'icon-sm') ?></button>
          </div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">
          <span class="spinner"></span> Ingresar <?= icon('arrow-right') ?>
        </button>
      </form>
      <div class="foot">
        <span>© <?= date('Y') ?> JS Perfumerías</span>
        <span>Conexión cifrada · sesión segura</span>
      </div>
    </div>
  </section>
</div>
<script src="<?= e(asset('js/login.js')) ?>" defer></script>

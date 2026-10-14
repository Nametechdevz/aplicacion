<?php
use App\Core\View;

$hasOld = !empty($GLOBALS['__old_input']);
$s = static fn (string $k, string $d = '') => $hasOld ? (string) old($k, '') : (string) ($settings[$k] ?? $d);
$cls = static fn (string $f) => has_error($f) ? ' has-error' : '';
$text = static function (string $key, string $label, string $hint = '', string $type = 'text', array $attrs = []) use ($s, $cls): string {
    $extra = '';
    foreach ($attrs as $a => $v) { $extra .= ' ' . $a . '="' . e($v) . '"'; }
    return '<div class="field' . $cls($key) . '"><label for="' . $key . '">' . e($label) . '</label><input id="' . $key . '" name="' . $key . '" type="' . $type . '" value="' . e($s($key)) . '"' . $extra . '>' . ($hint ? '<p class="hint">' . e($hint) . '</p>' : '') . error_for($key) . '</div>';
};
$area = static function (string $key, string $label, string $hint = '', int $rows = 3) use ($s, $cls): string {
    return '<div class="field field--full' . $cls($key) . '"><label for="' . $key . '">' . e($label) . '</label><textarea id="' . $key . '" name="' . $key . '" rows="' . $rows . '">' . e($s($key)) . '</textarea>' . ($hint ? '<p class="hint">' . e($hint) . '</p>' : '') . error_for($key) . '</div>';
};
$image = static function (string $key, string $label, string $hint) use ($settings): string {
    $path = $settings[$key] ?? '';
    $preview = $path && is_file(PUBLIC_PATH . '/' . $path) ? '<img src="' . e(url($path)) . '" alt="" class="setting-preview">' : '<span class="muted small">Usando el diseño por defecto</span>';
    $remove = $path ? '<label class="check"><input type="checkbox" name="remove_' . $key . '" value="1"> <span>Quitar y volver al predeterminado</span></label>' : '';
    return '<div class="field"><span class="label">' . e($label) . '</span><div class="inline-media">' . $preview . '<label class="upload-box upload-box--inline">' . icon('upload', '', 18) . '<span>Subir</span><input type="file" name="' . $key . '" accept="image/jpeg,image/png,image/webp"></label></div><p class="hint">' . e($hint) . '</p>' . $remove . '</div>';
};
?>
<?= View::partial('admin/_header', ['title' => 'Configuración', 'subtitle' => 'Datos del negocio, textos de la tienda, WhatsApp y envíos. Las credenciales técnicas (base de datos) se configuran en el archivo .env, no aquí.']) ?>

<form method="post" action="<?= e(url('admin/configuracion')) ?>" enctype="multipart/form-data" class="settings-form" data-once-submit>
  <?= csrf_field() ?>
  <nav class="tabs tabs--anchors" aria-label="Secciones">
    <a href="#negocio" class="tabs__link">Negocio</a><a href="#whatsapp" class="tabs__link">WhatsApp</a><a href="#portada" class="tabs__link">Portada</a><a href="#envios" class="tabs__link">Envíos y pagos</a><a href="#marca" class="tabs__link">Marca</a><a href="#redes" class="tabs__link">Redes</a>
  </nav>

  <section class="panel" id="negocio">
    <h2 class="panel__title">Datos del negocio</h2>
    <div class="form-grid">
      <?= $text('store_name', 'Nombre de la tienda', '', 'text', ['required' => 'required', 'maxlength' => '120']) ?>
      <?= $text('store_tagline', 'Lema corto', 'Aparece en el título de la página de inicio.', 'text', ['maxlength' => '160']) ?>
      <?= $area('store_description', 'Descripción de la tienda', 'Se usa en el pie de página y como meta descripción.', 2) ?>
      <?= $text('contact_phone', 'Teléfono de contacto', '', 'tel', ['maxlength' => '40']) ?>
      <?= $text('contact_email', 'Correo comercial', '', 'email', ['maxlength' => '190']) ?>
      <?= $text('store_address', 'Dirección (opcional)', 'Déjela vacía si no atiende público.', 'text', ['maxlength' => '255']) ?>
      <?= $text('business_hours', 'Horario de atención', '', 'text', ['maxlength' => '200']) ?>
      <div class="field"><span class="label">Moneda</span><p class="stock-now"><strong>COP</strong> — pesos colombianos, sin decimales</p></div>
      <?= $text('low_stock_default', 'Umbral de stock bajo por defecto', 'Para productos nuevos.', 'number', ['min' => '0']) ?>
    </div>
  </section>

  <section class="panel" id="whatsapp">
    <h2 class="panel__title">WhatsApp</h2>
    <div class="form-grid">
      <?= $text('whatsapp_number', 'Número de WhatsApp de la tienda', 'Formato internacional sin +, espacios ni guiones. Colombia: 57 + 10 dígitos (ej. 573001234567).', 'tel', ['maxlength' => '20', 'inputmode' => 'numeric']) ?>
      <?= $text('whatsapp_order_intro', 'Saludo del mensaje de pedido', 'Primera línea del resumen que envía el cliente.', 'text', ['maxlength' => '200']) ?>
    </div>
    <?php if (empty($settings['whatsapp_number'])): ?><p class="notice notice--warning"><?= icon('alert', '', 16) ?> Sin número configurado los botones de WhatsApp no se muestran en la tienda.</p><?php endif; ?>
  </section>

  <section class="panel" id="portada">
    <h2 class="panel__title">Portada y barra promocional</h2>
    <div class="form-grid">
      <label class="check field--full"><input type="checkbox" name="promo_bar_enabled" value="1"<?= checked($hasOld ? (old('promo_bar_enabled') ? 1 : 0) : ($settings['promo_bar_enabled'] ?? '1')) ?>> <span>Mostrar barra promocional superior</span></label>
      <?= $text('promo_bar_text', 'Texto de la barra promocional', '', 'text', ['maxlength' => '160']) ?>
      <?= $text('hero_eyebrow', 'Antetítulo de la portada', '', 'text', ['maxlength' => '60']) ?>
      <?= $text('hero_title', 'Título principal', '', 'text', ['maxlength' => '120']) ?>
      <?= $text('hero_cta_text', 'Texto del botón principal', '', 'text', ['maxlength' => '40']) ?>
      <?= $area('hero_subtitle', 'Texto de presentación', '', 2) ?>
      <?= $image('hero_image', 'Imagen de portada', 'Recomendado: cuadrada, mínimo 1200 × 1200 px.') ?>
      <?= $area('benefits', 'Beneficios de compra', 'Uno por línea con el formato: Título|Descripción', 3) ?>
    </div>
  </section>

  <section class="panel" id="envios">
    <h2 class="panel__title">Envíos y pagos</h2>
    <div class="form-grid">
      <fieldset class="field field--full">
        <legend class="label">Costo de envío</legend>
        <div class="radio-row">
          <label class="check"><input type="radio" name="shipping_mode" value="manual"<?= $s('shipping_mode', 'manual') === 'manual' ? ' checked' : '' ?>> <span>Se confirma por WhatsApp (no se suma al total)</span></label>
          <label class="check"><input type="radio" name="shipping_mode" value="flat"<?= $s('shipping_mode') === 'flat' ? ' checked' : '' ?>> <span>Tarifa fija nacional</span></label>
        </div>
      </fieldset>
      <?= $text('shipping_flat_rate', 'Tarifa fija (COP)', 'Solo con “Tarifa fija”.', 'text', ['inputmode' => 'numeric']) ?>
      <?= $text('free_shipping_threshold', 'Envío gratis desde (COP)', '0 = sin envío gratis.', 'text', ['inputmode' => 'numeric']) ?>
      <?= $area('shipping_info', 'Información de entregas', 'Se muestra en la portada y en cada producto.', 3) ?>
      <?= $area('payment_methods', 'Métodos de pago', 'Uno por línea. Se muestran en el checkout; no se procesan pagos en línea.', 3) ?>
    </div>
  </section>

  <section class="panel" id="marca">
    <h2 class="panel__title">Marca</h2>
    <div class="form-grid">
      <?= $image('logo_path', 'Logotipo', 'PNG o WebP con fondo transparente, alto recomendado 88 px. Si no sube uno se usa el logotipo tipográfico.') ?>
      <?= $image('favicon_path', 'Favicon', 'PNG cuadrado de 64 × 64 px o más.') ?>
    </div>
  </section>

  <section class="panel" id="redes">
    <h2 class="panel__title">Redes sociales</h2>
    <div class="form-grid">
      <?= $text('social_instagram', 'Instagram', '', 'url', ['placeholder' => 'https://instagram.com/…']) ?>
      <?= $text('social_facebook', 'Facebook', '', 'url', ['placeholder' => 'https://facebook.com/…']) ?>
      <?= $text('social_tiktok', 'TikTok', '', 'url', ['placeholder' => 'https://tiktok.com/@…']) ?>
    </div>
  </section>

  <div class="sticky-save">
    <p class="muted small">Las políticas y páginas informativas se editan en <a href="<?= e(url('admin/paginas')) ?>">Páginas</a>.</p>
    <button type="submit" class="btn btn--primary btn--lg" data-loading-text="Guardando…"><?= icon('check', '', 18) ?> Guardar configuración</button>
  </div>
</form>

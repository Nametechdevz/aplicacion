<?php
use App\Core\View;

$hasOld = !empty($GLOBALS['__old_input']);
$val = static fn (string $k) => old($k, $page[$k] ?? '');
?>
<?= View::partial('admin/_header', ['title' => $page['title'], 'actions' => '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="' . e(url('pagina/' . $page['slug'])) . '">' . icon('eye', '', 16) . ' Ver página</a>']) ?>
<form method="post" action="<?= e(url('admin/paginas/' . $page['id'])) ?>" class="panel" data-once-submit>
  <?= csrf_field() ?>
  <div class="form-grid">
    <div class="field<?= has_error('title') ? ' has-error' : '' ?>"><label for="title">Título</label><input id="title" name="title" required maxlength="150" value="<?= e($val('title')) ?>"><?= error_for('title') ?></div>
    <div class="field"><label for="meta_description">Meta descripción</label><input id="meta_description" name="meta_description" maxlength="300" value="<?= e($val('meta_description')) ?>"></div>
    <div class="field field--full<?= has_error('content') ? ' has-error' : '' ?>">
      <label for="content">Contenido</label>
      <textarea id="content" name="content" rows="18" class="textarea-code"><?= e($val('content')) ?></textarea>
      <p class="hint">Formato sencillo: párrafos separados por una línea en blanco; “## ” al inicio de una línea para títulos; “- ” para listas. No se admite HTML.</p>
      <?= error_for('content') ?>
    </div>
    <label class="check"><input type="checkbox" name="is_active" value="1"<?= checked($hasOld ? (old('is_active') ? 1 : 0) : $page['is_active']) ?>> <span>Publicada (visible y enlazada en el pie de página)</span></label>
  </div>
  <div class="form-actions"><a class="btn btn--ghost" href="<?= e(url('admin/paginas')) ?>">Cancelar</a><button class="btn btn--primary" type="submit">Guardar</button></div>
</form>

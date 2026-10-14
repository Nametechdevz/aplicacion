<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Páginas informativas', 'subtitle' => 'Revise y adapte estos textos a las condiciones reales de su negocio antes de publicar la tienda.']) ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Página</th><th>URL</th><th>Estado</th><th>Actualizada</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>
      <?php foreach ($pages as $p): ?>
        <tr>
          <td data-label="Página"><a class="strong" href="<?= e(url('admin/paginas/' . $p['id'] . '/editar')) ?>"><?= e($p['title']) ?></a></td>
          <td data-label="URL"><a href="<?= e(url('pagina/' . $p['slug'])) ?>" target="_blank" rel="noopener">/pagina/<?= e($p['slug']) ?></a></td>
          <td data-label="Estado"><?= (int) $p['is_active'] ? '<span class="badge badge--success">Publicada</span>' : '<span class="badge badge--muted">Oculta</span>' ?></td>
          <td data-label="Actualizada"><?= e(date_es($p['updated_at'], true)) ?></td>
          <td class="actions"><a class="btn btn--ghost btn--xs" href="<?= e(url('admin/paginas/' . $p['id'] . '/editar')) ?>"><?= icon('edit', '', 14) ?> Editar</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

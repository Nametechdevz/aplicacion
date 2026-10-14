<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Categorías', 'subtitle' => 'Ordene y organice el catálogo. Solo las categorías activas aparecen en la tienda.', 'actions' => '<a href="' . e(url('admin/categorias/nueva')) . '" class="btn btn--primary">' . icon('plus', '', 18) . ' Nueva categoría</a>']) ?>
<?php if ($categories): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Categoría</th><th class="num">Orden</th><th class="num">Productos</th><th>Estado</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>
      <?php foreach ($categories as $c): ?>
        <tr>
          <td data-label="Categoría"><div class="cell-product"><img src="<?= e(image_url($c['image_path'])) ?>" alt="" width="44" height="44" loading="lazy"><div><a class="strong" href="<?= e(url('admin/categorias/' . $c['id'] . '/editar')) ?>"><?= e($c['name']) ?></a><span class="muted small">/categoria/<?= e($c['slug']) ?></span></div></div></td>
          <td data-label="Orden" class="num"><?= (int) $c['sort_order'] ?></td>
          <td data-label="Productos" class="num"><a href="<?= e(url('admin/productos?categoria=' . $c['id'])) ?>"><?= (int) $c['product_count'] ?></a></td>
          <td data-label="Estado"><?= (int) $c['is_active'] ? '<span class="badge badge--success">Activa</span>' : '<span class="badge badge--muted">Inactiva</span>' ?></td>
          <td class="actions">
            <a href="<?= e(url('admin/categorias/' . $c['id'] . '/editar')) ?>" class="btn btn--ghost btn--xs"><?= icon('edit', '', 14) ?> Editar</a>
            <form method="post" action="<?= e(url('admin/categorias/' . $c['id'] . '/estado')) ?>"><?= csrf_field() ?><button class="btn btn--ghost btn--xs"><?= (int) $c['is_active'] ? 'Desactivar' : 'Activar' ?></button></form>
            <?php if ((int) $c['product_count'] === 0): ?>
              <form method="post" action="<?= e(url('admin/categorias/' . $c['id'] . '/eliminar')) ?>" data-confirm="¿Eliminar la categoría «<?= e($c['name']) ?>»?" data-confirm-label="Eliminar"><?= csrf_field() ?><button class="btn btn--danger-ghost btn--xs" aria-label="Eliminar"><?= icon('trash', '', 14) ?></button></form>
            <?php endif; ?>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?php else: ?>
  <div class="admin-empty"><?= icon('folder', '', 32) ?><h2>Aún no hay categorías</h2><p>Las categorías organizan el catálogo y el menú de la tienda.</p><a href="<?= e(url('admin/categorias/nueva')) ?>" class="btn btn--primary">Crear categoría</a></div>
<?php endif; ?>

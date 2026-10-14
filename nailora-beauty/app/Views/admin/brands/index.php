<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Marcas', 'subtitle' => 'Registre solo marcas reales que comercializa. La sección de marcas aparece en la tienda cuando hay marcas activas con productos.']) ?>
<div class="admin-grid admin-grid--form">
  <div class="panel panel--flush">
    <?php if ($brands): ?>
    <div class="table-wrap">
      <table class="table table--responsive table--forms">
        <thead><tr><th>Nombre</th><th class="num">Productos</th><th>Activa</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
        <tbody>
        <?php foreach ($brands as $b): $fid = 'brand-' . $b['id']; ?>
          <tr>
            <td data-label="Nombre"><input form="<?= $fid ?>" name="name" value="<?= e($b['name']) ?>" maxlength="120" required aria-label="Nombre"></td>
            <td data-label="Productos" class="num"><?= (int) $b['product_count'] ?></td>
            <td data-label="Activa"><input form="<?= $fid ?>" type="checkbox" name="is_active" value="1"<?= checked($b['is_active']) ?> aria-label="Activa"></td>
            <td class="actions">
              <form id="<?= $fid ?>" method="post" action="<?= e(url('admin/marcas/' . $b['id'])) ?>"><?= csrf_field() ?><button class="btn btn--ghost btn--xs">Guardar</button></form>
              <form method="post" action="<?= e(url('admin/marcas/' . $b['id'] . '/eliminar')) ?>" data-confirm="¿Eliminar la marca «<?= e($b['name']) ?>»? Sus productos quedarán sin marca." data-confirm-label="Eliminar"><?= csrf_field() ?><button class="btn btn--danger-ghost btn--xs" aria-label="Eliminar"><?= icon('trash', '', 14) ?></button></form>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <?php else: ?>
      <div class="admin-empty admin-empty--sm"><?= icon('award', '', 28) ?><p>No hay marcas registradas. Es opcional: los productos pueden no tener marca.</p></div>
    <?php endif; ?>
  </div>
  <form method="post" action="<?= e(url('admin/marcas')) ?>" class="panel">
    <?= csrf_field() ?>
    <h2 class="panel__title">Nueva marca</h2>
    <div class="field"><label for="brand-name">Nombre</label><input id="brand-name" name="name" required maxlength="120"></div>
    <button type="submit" class="btn btn--primary btn--block" style="margin-top:1rem">Crear marca</button>
  </form>
</div>

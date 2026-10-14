<?php
use App\Core\View;
use App\Models\Promotion;

$now = date('Y-m-d H:i:s');
?>
<?= View::partial('admin/_header', ['title' => 'Promociones', 'subtitle' => 'Descuentos automáticos por fechas. Se calculan en el servidor y nunca dejan un precio negativo. Si un producto tiene varias, se aplica la de mayor descuento.', 'actions' => '<a class="btn btn--primary" href="' . e(url('admin/promociones/nueva')) . '">' . icon('plus', '', 18) . ' Nueva promoción</a>']) ?>
<?php if ($promotions): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Promoción</th><th>Descuento</th><th>Alcance</th><th>Vigencia</th><th>Estado</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>
      <?php foreach ($promotions as $p):
          $state = !(int) $p['is_active'] ? ['Inactiva', 'muted'] : ($p['ends_at'] <= $now ? ['Vencida', 'muted'] : ($p['starts_at'] > $now ? ['Programada', 'warning'] : ['Vigente', 'success']));
      ?>
        <tr>
          <td data-label="Promoción"><a class="strong" href="<?= e(url('admin/promociones/' . $p['id'] . '/editar')) ?>"><?= e($p['name']) ?></a></td>
          <td data-label="Descuento"><?= $p['discount_type'] === 'percent' ? e(rtrim(rtrim(number_format((float) $p['discount_value'], 2, ',', '.'), '0'), ',')) . '%' : money($p['discount_value']) ?></td>
          <td data-label="Alcance"><?= e(Promotion::SCOPES[$p['scope']]) ?><?= $p['scope'] === 'products' ? ' (' . (int) $p['product_count'] . ')' : ($p['scope'] === 'categories' ? ' (' . (int) $p['category_count'] . ')' : '') ?></td>
          <td data-label="Vigencia"><?= e(date_es($p['starts_at'], true)) ?><br><span class="muted small">hasta <?= e(date_es($p['ends_at'], true)) ?></span></td>
          <td data-label="Estado"><span class="badge badge--<?= $state[1] ?>"><?= $state[0] ?></span></td>
          <td class="actions">
            <a class="btn btn--ghost btn--xs" href="<?= e(url('admin/promociones/' . $p['id'] . '/editar')) ?>"><?= icon('edit', '', 14) ?> Editar</a>
            <form method="post" action="<?= e(url('admin/promociones/' . $p['id'] . '/estado')) ?>"><?= csrf_field() ?><button class="btn btn--ghost btn--xs"><?= (int) $p['is_active'] ? 'Desactivar' : 'Activar' ?></button></form>
            <form method="post" action="<?= e(url('admin/promociones/' . $p['id'] . '/eliminar')) ?>" data-confirm="¿Eliminar la promoción «<?= e($p['name']) ?>»?" data-confirm-label="Eliminar"><?= csrf_field() ?><button class="btn btn--danger-ghost btn--xs" aria-label="Eliminar"><?= icon('trash', '', 14) ?></button></form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?php else: ?>
  <div class="admin-empty"><?= icon('percent', '', 32) ?><h2>Sin promociones</h2><p>Cree descuentos por porcentaje o valor fijo para productos, categorías o toda la tienda.</p><a class="btn btn--primary" href="<?= e(url('admin/promociones/nueva')) ?>">Crear promoción</a></div>
<?php endif; ?>

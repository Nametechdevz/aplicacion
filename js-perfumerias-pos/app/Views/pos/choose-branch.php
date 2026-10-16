<div class="content" style="max-width:720px">
  <div class="panel">
    <div class="panel-body">
      <div class="empty">
        <?= icon('store', 'icon-lg text-gold') ?>
        <h3>Seleccione una sucursal de venta</h3>
        <p><?= $branch ? 'La sucursal activa («' . e($branch['name']) . '») no es un punto de venta habilitado.' : 'No tiene una sucursal asignada.' ?> Elija dónde va a vender.</p>
        <?php if ($stores): ?>
          <form method="post" action="<?= e(url('/branch/switch')) ?>" class="row wrap" style="justify-content:center;margin-top:10px">
            <?= csrf_field() ?>
            <?php foreach ($stores as $s): ?>
              <button class="btn" type="submit" name="branch_id" value="<?= (int) $s['id'] ?>"><?= icon('store') ?> <?= e($s['name']) ?></button>
            <?php endforeach; ?>
          </form>
        <?php else: ?>
          <p class="muted">Solicite a la administración que le asigne una sucursal.</p>
        <?php endif; ?>
      </div>
    </div>
  </div>
</div>

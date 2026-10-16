<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Venta</div><h1><?= e($sale['number']) ?></h1><p><?= e(fmt_dt($sale['created_at'])) ?> · <?= e($sale['branch_name']) ?></p></div>
  <div class="page-actions"><a class="btn" href="<?= e(url('/sales')) ?>"><?= icon('arrow-left') ?> Volver al historial</a>
    <a class="btn" href="<?= e(url('/sales/' . $sale['id'] . '/receipt')) ?>" target="_blank" rel="noopener"><?= icon('receipt') ?> Ver comprobante</a></div>
</div>
<div class="grid grid-12"><section class="panel span-8"><div class="panel-body"><?= View::partial('sales/detail', ['sale' => $sale, 'drawer' => false]) ?></div></section></div>

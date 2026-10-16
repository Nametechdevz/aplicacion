<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Comprobante <?= e($sale['number']) ?></title>
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
  <style>body{background:#fff;color:#000}@media print{@page{size:80mm auto;margin:0}.no-print{display:none}}</style>
</head>
<body>
<div class="receipt">
  <div class="r-center">
    <div class="r-brand"><?= e($company['company_name'] ?? 'JS Perfumerías') ?></div>
    <?php if (!empty($company['company_tax_id'])): ?><div>NIT <?= e($company['company_tax_id']) ?></div><?php endif; ?>
    <div><?= e($sale['branch_name']) ?></div>
    <?php if ($sale['branch_address']): ?><div><?= e($sale['branch_address']) ?></div><?php endif; ?>
    <?php if ($sale['branch_phone']): ?><div>Tel. <?= e($sale['branch_phone']) ?></div><?php endif; ?>
  </div>
  <div class="r-sep"></div>
  <table>
    <tr><td>Comprobante</td><td class="r-right"><strong><?= e($sale['number']) ?></strong></td></tr>
    <tr><td>Fecha</td><td class="r-right"><?= e(fmt_dt($sale['created_at'], 'd/m/Y H:i')) ?></td></tr>
    <tr><td>Caja</td><td class="r-right"><?= e($sale['register_name']) ?></td></tr>
    <tr><td>Atendió</td><td class="r-right"><?= e($sale['seller_name']) ?></td></tr>
    <?php if ($sale['customer_name']): ?><tr><td>Cliente</td><td class="r-right"><?= e($sale['customer_name']) ?></td></tr><?php endif; ?>
  </table>
  <?php if ($sale['status'] === 'voided'): ?><div class="r-sep"></div><div class="r-center"><strong>*** VENTA ANULADA ***</strong></div><?php endif; ?>
  <?php if ((int) $sale['reprint_count'] > 0): ?><div class="r-center"><small>Reimpresión</small></div><?php endif; ?>
  <div class="r-sep"></div>
  <table>
    <?php foreach ($sale['items'] as $it): ?>
      <tr><td colspan="2"><?= e($it['product_name']) ?><?= $it['variant_name'] ? ' · ' . e($it['variant_name']) : '' ?></td></tr>
      <tr><td><small><?= e(qty($it['quantity'], $it['unit_code'])) ?> × <?= e(money($it['list_unit_price'])) ?></small></td><td class="r-right"><?= e(money($it['gross_amount'])) ?></td></tr>
      <?php if ((float) $it['discount_amount'] > 0): ?><tr><td><small>Descuento</small></td><td class="r-right">−<?= e(money($it['discount_amount'])) ?></td></tr><?php endif; ?>
    <?php endforeach; ?>
  </table>
  <div class="r-sep"></div>
  <table>
    <tr><td>Subtotal</td><td class="r-right"><?= e(money($sale['subtotal'])) ?></td></tr>
    <?php if ((float) $sale['discount_total'] > 0): ?><tr><td>Descuentos</td><td class="r-right">−<?= e(money($sale['discount_total'])) ?></td></tr><?php endif; ?>
    <tr class="r-total"><td>TOTAL</td><td class="r-right"><?= e(money($sale['total'])) ?></td></tr>
    <?php foreach ($sale['payments'] as $p): ?><tr><td><?= e($p['method_name']) ?><?= $p['reference'] ? ' (' . e($p['reference']) . ')' : '' ?></td><td class="r-right"><?= e(money($p['received'])) ?></td></tr><?php endforeach; ?>
    <?php if ((float) $sale['change_total'] > 0): ?><tr><td>Cambio</td><td class="r-right"><?= e(money($sale['change_total'])) ?></td></tr><?php endif; ?>
  </table>
  <div class="r-sep"></div>
  <div class="r-center"><small><?= e($sale['receipt_footer'] ?: ($company['receipt_footer'] ?? '')) ?></small><br><small>Documento no válido como factura electrónica.</small></div>
  <div class="r-center no-print" style="margin-top:16px"><button class="btn btn-sm" type="button" data-print>Imprimir</button></div>
</div>
<script src="<?= e(asset('js/receipt.js')) ?>" <?= $autoprint ? 'data-autoprint' : '' ?>></script>
</body>
</html>

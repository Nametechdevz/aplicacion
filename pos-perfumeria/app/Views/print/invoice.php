<?php
$isFev = $sale['doc_type'] === 'FEV';
$c = $company;
$taxes = App\Services\Calculator::taxBreakdown($items);
?>
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= ($isFev ? 'Factura ' : 'Documento POS ') . e($sale['full_number']) ?></title>
<style>
    @page { size: letter; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; margin: 0; background: #eee; }
    .page { max-width: 216mm; margin: 0 auto; background: #fff; padding: 12mm; }
    .row { display: flex; gap: 12px; }
    .grow { flex: 1; }
    h1 { font-size: 18px; margin: 0 0 4px; color: #6b2c5f; }
    .box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }
    .doc { text-align: center; min-width: 210px; }
    .doc .num { font-size: 18px; font-weight: bold; color: #6b2c5f; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #6b2c5f; color: #fff; padding: 6px; font-size: 10px; text-align: left; }
    td { padding: 5px 6px; border-bottom: 1px solid #eee; }
    .r { text-align: right; } .c { text-align: center; }
    .totals td { border: 0; padding: 3px 6px; }
    .totals .grand td { font-size: 14px; font-weight: bold; border-top: 2px solid #6b2c5f; }
    .muted { color: #777; } .small { font-size: 9px; word-break: break-all; }
    .label { font-size: 9px; text-transform: uppercase; color: #777; }
    .actions { text-align: center; padding: 10px; }
    .actions button { font-size: 14px; padding: 8px 16px; cursor: pointer; }
    .void { color: #c00; font-size: 22px; font-weight: bold; text-align: center; border: 3px solid #c00; padding: 4px; margin: 6px 0; }
    @media print { body { background: #fff; } .page { padding: 0; } .actions { display: none; } }
</style></head>
<body>
<div class="actions"><button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button> <button onclick="window.close()">Cerrar</button></div>
<div class="page">
    <div class="row">
        <div class="grow">
            <h1><?= e($c['company_trade_name'] ?: $c['company_name']) ?></h1>
            <div><b><?= e($c['company_name']) ?></b> · NIT <?= e($c['company_nit']) ?>-<?= e($c['company_dv']) ?></div>
            <div><?= ($c['company_tax_regime'] ?? '48') === '48' ? 'Responsable de IVA' : 'No responsable de IVA' ?> · Resp. fiscales: <?= e($c['company_tax_responsibilities']) ?></div>
            <div><?= e($c['company_address']) ?> · <?= e($c['company_city_name']) ?>, <?= e($c['company_department']) ?></div>
            <div>Tel: <?= e($c['company_phone']) ?> · <?= e($c['company_email']) ?></div>
        </div>
        <div class="box doc">
            <div class="label"><?= $isFev ? 'Factura electrónica de venta' : 'Documento equivalente electrónico POS' ?></div>
            <div class="num"><?= e($sale['full_number']) ?></div>
            <div>Fecha: <?= fdate($sale['issued_at'], 'd/m/Y h:i a') ?></div>
            <div>Vence: <?= fdate($sale['issued_at']) ?> (contado)</div>
        </div>
    </div>
    <?php if ($sale['status'] === 'anulada'): ?><div class="void">ANULADA MEDIANTE NOTA CRÉDITO</div><?php endif; ?>

    <div class="box" style="margin-top:10px">
        <div class="row">
            <div class="grow"><span class="label">Adquiriente</span><br><b><?= e($customer['name']) ?></b><br>
                <?= e(doc_types()[$customer['doc_type']] ?? '') ?>: <?= e($customer['doc_number']) ?><?= $customer['dv'] !== null && $customer['dv'] !== '' ? '-' . e($customer['dv']) : '' ?></div>
            <div class="grow"><span class="label">Contacto</span><br><?= e($customer['email']) ?><br><?= e($customer['phone']) ?></div>
            <div class="grow"><span class="label">Dirección</span><br><?= e($customer['address']) ?><br><?= e($customer['city_name']) ?> <?= e($customer['department']) ?></div>
        </div>
    </div>

    <table>
        <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th class="c">Cant.</th><th class="r">Vr. unitario</th><th class="r">Desc.</th><th class="r">IVA</th><th class="r">Total</th></tr></thead>
        <tbody>
        <?php foreach ($items as $i => $it): ?>
            <tr>
                <td><?= $i + 1 ?></td><td><?= e($it['code']) ?></td><td><?= e($it['description']) ?></td>
                <td class="c"><?= (int) $it['qty'] ?></td><td class="r"><?= money($it['unit_price']) ?></td>
                <td class="r"><?= $it['discount_amount'] > 0 ? money($it['discount_amount']) : '—' ?></td>
                <td class="r"><?= num($it['tax_rate']) ?>%</td><td class="r"><?= money($it['total']) ?></td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>

    <div class="row" style="margin-top:10px">
        <div class="grow">
            <div class="box">
                <span class="label">Valor en letras</span><br><b><?= e(App\Services\NumberToWords::pesos((float) $sale['total'])) ?></b>
            </div>
            <div class="box" style="margin-top:8px">
                <span class="label">Forma de pago: contado</span><br>
                <?php foreach ($payments as $p): ?><?= e(payment_label($p['method'])) ?>: <?= money($p['amount']) ?><?= $p['reference'] ? ' (' . e($p['reference']) . ')' : '' ?><br><?php endforeach; ?>
                <?php if ($sale['change_amount'] > 0): ?>Cambio: <?= money($sale['change_amount']) ?><?php endif; ?>
            </div>
            <?php if ($sale['notes']): ?><div class="box" style="margin-top:8px"><span class="label">Observaciones</span><br><?= e($sale['notes']) ?></div><?php endif; ?>
        </div>
        <div style="width:260px">
            <table class="totals">
                <tr><td>Subtotal (base gravable)</td><td class="r"><?= money($sale['subtotal']) ?></td></tr>
                <?php foreach ($taxes as $t): ?><tr><td>IVA <?= num($t['rate']) ?>%</td><td class="r"><?= money($t['tax']) ?></td></tr><?php endforeach; ?>
                <?php if ($sale['discount_total'] > 0): ?><tr><td class="muted">Descuentos incluidos</td><td class="r muted"><?= money($sale['discount_total']) ?></td></tr><?php endif; ?>
                <tr class="grand"><td>TOTAL A PAGAR</td><td class="r"><?= money($sale['total']) ?></td></tr>
            </table>
        </div>
    </div>

    <div class="row box" style="margin-top:12px; align-items:center">
        <div id="qr" data-qr="<?= e($edoc['qr_data'] ?? '') ?>"></div>
        <div class="grow small">
            <?php if ($edoc): ?>
                <b><?= $isFev ? 'CUFE' : 'CUDE' ?>:</b> <?= e($edoc['uuid']) ?><br>
                Estado DIAN: <?= e(ucfirst($edoc['status'])) ?> · Ambiente: <?= $edoc['environment'] === '1' ? 'Producción' : 'Pruebas' ?><br>
            <?php endif; ?>
            <?php if ($range && $range['resolution_number']): ?>
                Autorización de numeración DIAN No. <?= e($range['resolution_number']) ?> del <?= fdate($range['resolution_date']) ?>, prefijo <?= e($range['prefix']) ?> del <?= e($range['from_number']) ?> al <?= e($range['to_number']) ?>, vigente del <?= fdate($range['valid_from']) ?> al <?= fdate($range['valid_to']) ?>.<br>
            <?php endif; ?>
            <?php if ($isFev): ?>Esta factura electrónica de venta se asimila en todos sus efectos a una letra de cambio (Art. 774 Código de Comercio).<br><?php endif; ?>
            Software: <?= e($c['software_name'] ?? '') ?> · Fabricante: <?= e($c['software_manufacturer'] ?? '') ?> · Cajero: <?= e($sale['cashier']) ?>
        </div>
    </div>
    <p class="c muted" style="margin-top:10px"><?= nl2br(e($c['ticket_footer'] ?? '')) ?></p>
</div>
<?php $qrSize = 120; include __DIR__ . '/_qr.php'; ?>
</body></html>

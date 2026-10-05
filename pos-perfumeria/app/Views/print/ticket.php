<?php
$isFev = $sale['doc_type'] === 'FEV';
$label = $isFev ? 'FACTURA ELECTRÓNICA DE VENTA' : 'DOCUMENTO EQUIVALENTE ELECTRÓNICO<br>TIQUETE DE MÁQUINA REGISTRADORA CON SISTEMA P.O.S.';
$c = $company;
?>
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($sale['full_number']) ?></title>
<style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; background: #eee; }
    .ticket { width: 80mm; margin: 0 auto; background: #fff; padding: 4mm 4mm 8mm; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 1px 0; }
    td.r { white-space: nowrap; padding-left: 6px; }
    .big { font-size: 16px; }
    .small { font-size: 10px; word-break: break-all; }
    #qr { display: flex; justify-content: center; margin: 6px 0; }
    .actions { text-align: center; padding: 10px; }
    .actions button { font-size: 14px; padding: 8px 16px; cursor: pointer; }
    @media print { body { background: #fff; } .actions { display: none; } .ticket { padding-top: 0; } }
</style></head>
<body>
<div class="actions"><button onclick="window.print()">🖨️ Imprimir</button> <button onclick="window.close()">Cerrar</button></div>
<div class="ticket">
    <div class="c b big"><?= e($c['company_trade_name'] ?: $c['company_name']) ?></div>
    <div class="c"><?= e($c['company_name']) ?></div>
    <div class="c">NIT <?= e($c['company_nit']) ?>-<?= e($c['company_dv']) ?></div>
    <div class="c"><?= ($c['company_tax_regime'] ?? '48') === '48' ? 'Responsable de IVA' : 'No responsable de IVA' ?></div>
    <div class="c"><?= e($c['company_address']) ?> · <?= e($c['company_city_name']) ?></div>
    <div class="c">Tel: <?= e($c['company_phone']) ?></div>
    <div class="hr"></div>
    <div class="c b"><?= $label ?></div>
    <div class="c b big"><?= e($sale['full_number']) ?></div>
    <?php if ($sale['status'] === 'anulada'): ?><div class="c b big">*** ANULADA ***</div><?php endif; ?>
    <div class="hr"></div>
    <table>
        <tr><td>Fecha:</td><td class="r"><?= fdate($sale['issued_at'], 'd/m/Y h:i:s a') ?></td></tr>
        <tr><td>Caja:</td><td class="r"><?= e($c['pos_box_plate'] ?? 'CAJA-01') ?></td></tr>
        <tr><td>Cajero:</td><td class="r"><?= e($sale['cashier']) ?></td></tr>
        <tr><td>Cliente:</td><td class="r"><?= e($customer['name']) ?></td></tr>
        <tr><td><?= e(doc_type_short($customer['doc_type'])) ?>:</td><td class="r"><?= e($customer['doc_number']) ?><?= $customer['dv'] !== null && $customer['dv'] !== '' ? '-' . e($customer['dv']) : '' ?></td></tr>
    </table>
    <div class="hr"></div>
    <table>
        <?php foreach ($items as $it): ?>
            <tr><td colspan="3"><?= e($it['description']) ?></td></tr>
            <tr>
                <td><?= (int) $it['qty'] ?> x <?= money($it['unit_price']) ?></td>
                <td class="r"><?= (float) $it['discount_pct'] > 0 ? '-' . num($it['discount_pct'], 1) . '%' : '' ?></td>
                <td class="r"><?= money($it['total']) ?></td>
            </tr>
        <?php endforeach; ?>
    </table>
    <div class="hr"></div>
    <table>
        <tr><td>Artículos:</td><td class="r"><?= array_sum(array_column($items, 'qty')) ?></td></tr>
                <?php foreach (App\Services\Calculator::taxBreakdown($items) as $t): ?>
            <tr><td>Base IVA <?= num($t['rate']) ?>%:</td><td class="r"><?= money($t['base']) ?></td></tr>
            <tr><td>IVA <?= num($t['rate']) ?>%:</td><td class="r"><?= money($t['tax']) ?></td></tr>
        <?php endforeach; ?>
        <?php if ($sale['discount_total'] > 0): ?><tr><td>Ahorro:</td><td class="r"><?= money($sale['discount_total']) ?></td></tr><?php endif; ?>
        <tr class="b big"><td>TOTAL:</td><td class="r"><?= money($sale['total']) ?></td></tr>
    </table>
    <div class="hr"></div>
    <table>
        <?php foreach ($payments as $p): ?><tr><td><?= e(payment_label($p['method'])) ?>:</td><td class="r"><?= money($p['amount']) ?></td></tr><?php endforeach; ?>
        <?php if ($sale['change_amount'] > 0): ?><tr class="b"><td>Cambio:</td><td class="r"><?= money($sale['change_amount']) ?></td></tr><?php endif; ?>
    </table>
    <div class="hr"></div>
    <?php if ($range && $range['resolution_number']): ?>
        <div class="small">Resolución DIAN No. <?= e($range['resolution_number']) ?> del <?= fdate($range['resolution_date']) ?>, prefijo <?= e($range['prefix']) ?> del <?= e($range['from_number']) ?> al <?= e($range['to_number']) ?>. Vigencia: <?= fdate($range['valid_from']) ?> a <?= fdate($range['valid_to']) ?>.</div>
    <?php endif; ?>
    <?php if ($edoc): ?>
        <div class="small"><b><?= $isFev ? 'CUFE' : 'CUDE' ?>:</b> <?= e($edoc['uuid']) ?></div>
        <div id="qr" data-qr="<?= e($edoc['qr_data']) ?>"></div>
        <?php if ($edoc['status'] !== 'aceptado'): ?><div class="c small">Documento en proceso de validación DIAN</div><?php endif; ?>
    <?php endif; ?>
    <div class="small c">Software: <?= e($c['software_name'] ?? 'POS Perfumería') ?> · Fabricante: <?= e($c['software_manufacturer'] ?? '') ?></div>
    <div class="hr"></div>
    <div class="c"><?= nl2br(e($c['ticket_footer'] ?? '')) ?></div>
</div>
<?php $qrSize = 150; include __DIR__ . '/_qr.php'; ?>
</body></html>

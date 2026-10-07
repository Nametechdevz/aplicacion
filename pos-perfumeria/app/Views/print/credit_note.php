<?php $c = $company; $isPos = $sale['doc_type'] === 'POS'; ?>
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nota crédito <?= e($cn['full_number']) ?></title>
<style>
    @page { size: letter; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; margin: 0; background: #eee; }
    .page { max-width: 216mm; margin: 0 auto; background: #fff; padding: 12mm; }
    .row { display: flex; gap: 12px; } .grow { flex: 1; }
    h1 { font-size: 18px; margin: 0 0 4px; color: #6b2c5f; }
    .box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }
    .doc { text-align: center; min-width: 210px; } .doc .num { font-size: 18px; font-weight: bold; color: #b02a37; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #6b2c5f; color: #fff; padding: 6px; font-size: 10px; text-align: left; }
    td { padding: 5px 6px; border-bottom: 1px solid #eee; }
    .r { text-align: right; } .c { text-align: center; } .small { font-size: 9px; word-break: break-all; } .label { font-size: 9px; text-transform: uppercase; color: #777; }
    .actions { text-align: center; padding: 10px; } .actions button { font-size: 14px; padding: 8px 16px; cursor: pointer; }
    @media print { body { background: #fff; } .page { padding: 0; } .actions { display: none; } }
</style></head>
<body>
<div class="actions"><button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button> <a href="<?= url('/sales/' . $sale['id']) ?>"><button>Ver venta</button></a></div>
<div class="page">
    <div class="row">
        <div class="grow">
            <h1><?= e($c['company_trade_name'] ?: $c['company_name']) ?></h1>
            <div><b><?= e($c['company_name']) ?></b> · NIT <?= e($c['company_nit']) ?>-<?= e($c['company_dv']) ?></div>
            <div><?= e($c['company_address']) ?> · <?= e($c['company_city_name']) ?> · Tel: <?= e($c['company_phone']) ?></div>
        </div>
        <div class="box doc">
            <div class="label"><?= $isPos ? 'Nota de ajuste crédito al documento equivalente' : 'Nota crédito electrónica' ?></div>
            <div class="num"><?= e($cn['full_number']) ?></div>
            <div>Fecha: <?= fdate($cn['issued_at'], 'd/m/Y h:i a') ?></div>
        </div>
    </div>
    <div class="box" style="margin-top:10px">
        <div class="row">
            <div class="grow"><span class="label">Cliente</span><br><b><?= e($customer['name']) ?></b><br><?= e(doc_type_short($customer['doc_type'])) ?> <?= e($customer['doc_number']) ?></div>
            <div class="grow"><span class="label">Documento afectado</span><br><b><?= e($sale['full_number']) ?></b> del <?= fdate($sale['issued_at']) ?><br><span class="small"><?= $isPos ? 'CUDE' : 'CUFE' ?>: <?= e($edoc['uuid'] ?? '') ?></span></div>
            <div class="grow"><span class="label">Concepto</span><br><?= e($cn['reason_code']) ?> · <?= e($reasons[$cn['reason_code']] ?? '') ?><br><?= e($cn['reason_text']) ?></div>
        </div>
    </div>
    <table>
        <thead><tr><th>Código</th><th>Descripción</th><th class="c">Cant.</th><th class="r">Vr. unitario</th><th class="r">IVA</th><th class="r">Total</th></tr></thead>
        <tbody>
        <?php foreach ($cnItems as $it): ?>
            <tr><td><?= e($it['code']) ?></td><td><?= e($it['description']) ?></td><td class="c"><?= (int) $it['qty'] ?></td><td class="r"><?= money($it['unit_price']) ?></td><td class="r"><?= num($it['tax_rate']) ?>%</td><td class="r"><?= money($it['total']) ?></td></tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <div class="row" style="margin-top:10px">
        <div class="grow box"><span class="label">Valor en letras</span><br><b><?= e(App\Services\NumberToWords::pesos((float) $cn['total'])) ?></b><br>
            <span class="label">Reembolso</span>: <?= e(payment_label($cn['refund_method'])) ?> · Elaboró: <?= e($cn['user_name']) ?></div>
        <div style="width:240px">
            <table>
                <tr><td>Subtotal</td><td class="r"><?= money($cn['subtotal']) ?></td></tr>
                <tr><td>IVA</td><td class="r"><?= money($cn['tax_total']) ?></td></tr>
                <tr><td><b>TOTAL</b></td><td class="r"><b><?= money($cn['total']) ?></b></td></tr>
            </table>
        </div>
    </div>
    <div class="row box" style="margin-top:12px; align-items:center">
        <div id="qr" data-qr="<?= e($cnEdoc['qr_data'] ?? '') ?>"></div>
        <div class="grow small">
            <?php if ($cnEdoc): ?><b>CUDE:</b> <?= e($cnEdoc['uuid']) ?><br>Estado DIAN: <?= e(ucfirst($cnEdoc['status'])) ?> · Ambiente: <?= $cnEdoc['environment'] === '1' ? 'Producción' : 'Pruebas' ?><br><?php endif; ?>
            Software: <?= e($c['software_name'] ?? '') ?> · Fabricante: <?= e($c['software_manufacturer'] ?? '') ?>
        </div>
    </div>
</div>
<?php $qrSize = 110; include __DIR__ . '/_qr.php'; ?>
</body></html>

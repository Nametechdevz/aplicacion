<?php $sess = $s['session']; ?>
<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cierre de caja #<?= $sess['id'] ?></title>
<style>
    @page { size: 80mm auto; margin: 0; }
    body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; background: #eee; }
    .t { width: 80mm; margin: 0 auto; background: #fff; padding: 4mm; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; } table { width: 100%; border-collapse: collapse; }
    .a { text-align: center; padding: 10px; } @media print { .a { display: none; } body { background: #fff; } }
</style></head><body>
<div class="a"><button onclick="print()">🖨️ Imprimir</button></div>
<div class="t">
    <div class="c b"><?= e(setting('company_trade_name')) ?></div>
    <div class="c b"><?= $sess['status'] === 'cerrada' ? 'CIERRE DE CAJA' : 'ARQUEO PARCIAL' ?> #<?= $sess['id'] ?></div>
    <div class="hr"></div>
    <table>
        <tr><td>Cajero:</td><td class="r"><?= e($sess['user_name']) ?></td></tr>
        <tr><td>Apertura:</td><td class="r"><?= fdate($sess['opened_at'], 'd/m/Y H:i') ?></td></tr>
        <tr><td><?= $sess['closed_at'] ? 'Cierre:' : 'Impreso:' ?></td><td class="r"><?= fdate($sess['closed_at'] ?? date('Y-m-d H:i:s'), 'd/m/Y H:i') ?></td></tr>
    </table>
    <div class="hr"></div>
    <table>
        <?php foreach ($s['by_method'] as $m): ?><tr><td><?= e(payment_label($m['method'])) ?> (<?= (int) $m['count'] ?>)</td><td class="r"><?= money($m['total']) ?></td></tr><?php endforeach; ?>
        <tr class="b"><td>Total ventas (<?= (int) $s['sales']['count'] ?>)</td><td class="r"><?= money($s['sales']['total']) ?></td></tr>
        <tr><td>IVA incluido</td><td class="r"><?= money($s['sales']['tax_total']) ?></td></tr>
    </table>
    <div class="hr"></div>
    <table>
        <tr><td>Base inicial</td><td class="r"><?= money($sess['opening_amount']) ?></td></tr>
        <tr><td>Efectivo ventas</td><td class="r"><?= money($s['cash_sales']) ?></td></tr>
        <tr><td>Ingresos</td><td class="r"><?= money($s['ingresos']) ?></td></tr>
        <tr><td>Egresos</td><td class="r">-<?= money($s['egresos']) ?></td></tr>
        <tr class="b"><td>Esperado</td><td class="r"><?= money($s['expected']) ?></td></tr>
        <?php if ($sess['status'] === 'cerrada'): ?>
            <tr><td>Contado</td><td class="r"><?= money($sess['counted_cash']) ?></td></tr>
            <tr class="b"><td>Diferencia</td><td class="r"><?= money($sess['difference']) ?></td></tr>
        <?php endif; ?>
    </table>
    <?php if ($s['movements']): ?><div class="hr"></div>
        <?php foreach ($s['movements'] as $m): ?><div><?= $m['type'] === 'ingreso' ? '+' : '-' ?><?= money($m['amount']) ?> <?= e($m['concept']) ?></div><?php endforeach; ?>
    <?php endif; ?>
    <div class="hr"></div><br><br>
    <div class="c">______________________<br>Firma cajero</div>
</div></body></html>

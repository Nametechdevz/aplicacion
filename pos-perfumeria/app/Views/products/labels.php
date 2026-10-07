<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title>
<style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 8mm; }
    .grid { display: flex; flex-wrap: wrap; gap: 3mm; }
    .label { width: 50mm; height: 30mm; border: 1px dashed #bbb; padding: 1.5mm; box-sizing: border-box; text-align: center; overflow: hidden; page-break-inside: avoid; }
    .n { font-size: 9px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .p { font-size: 13px; font-weight: bold; }
    svg { max-width: 100%; height: 14mm; }
    .a { margin-bottom: 8px; } @media print { .a { display: none; } .label { border-color: transparent; } body { padding: 0; } }
</style></head><body>
<div class="a"><button onclick="print()">🖨️ Imprimir</button> Etiquetas 50×30 mm</div>
<div class="grid">
<?php foreach ($products as $p): for ($i = 0; $i < $copies; $i++): ?>
    <div class="label">
        <div class="n"><?= e(trim(($p['brand'] ?? '') . ' ' . $p['name'])) ?> <?= e($p['concentration']) ?> <?= $p['size_ml'] ? (int) $p['size_ml'] . 'ml' : '' ?></div>
        <svg class="bc" data-code="<?= e($p['code']) ?>"></svg>
        <div class="p"><?= money($p['price']) ?></div>
    </div>
<?php endfor; endforeach; ?>
</div>
<script src="<?= asset('vendor/JsBarcode.all.min.js') ?>"></script>
<script>
document.querySelectorAll('.bc').forEach(el => {
    const code = el.dataset.code;
    const fmt = /^\d{13}$/.test(code) ? 'EAN13' : (/^\d{12}$/.test(code) ? 'UPC' : 'CODE128');
    try { JsBarcode(el, code, { format: fmt, height: 40, fontSize: 11, margin: 0, width: 1.4 }); }
    catch (e) { JsBarcode(el, code, { format: 'CODE128', height: 40, fontSize: 11, margin: 0, width: 1.4 }); }
});
</script>
</body></html>

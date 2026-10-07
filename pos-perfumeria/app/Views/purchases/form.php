<form method="post" action="<?= url('/purchases') ?>" id="purchaseForm">
<?= csrf_field() ?>
<div class="card mb-3"><div class="card-body row g-3">
    <div class="col-md-4"><label class="form-label">Proveedor</label>
        <select name="supplier_id" class="form-select"><option value="">—</option><?php foreach ($suppliers as $s): ?><option value="<?= $s['id'] ?>"><?= e($s['name']) ?> (<?= e($s['nit']) ?>)</option><?php endforeach; ?></select>
        <div class="form-text"><a href="<?= url('/suppliers/create') ?>" target="_blank">Crear proveedor</a></div></div>
    <div class="col-md-3"><label class="form-label">No. factura proveedor</label><input name="invoice_number" class="form-control"></div>
    <div class="col-md-2"><label class="form-label">Fecha</label><input type="date" name="purchase_date" class="form-control" value="<?= date('Y-m-d') ?>"></div>
    <div class="col-md-3"><label class="form-label">Notas</label><input name="notes" class="form-control"></div>
</div></div>
<div class="card">
    <div class="card-body">
        <div class="input-group mb-3">
            <span class="input-group-text"><i class="bi bi-upc-scan"></i></span>
            <input id="pSearch" class="form-control" list="pList" placeholder="Escanea o escribe el código / nombre del producto y presiona Enter">
            <datalist id="pList"><?php foreach ($products as $p): ?><option value="<?= e($p['code']) ?>"><?= e($p['name'] . ' ' . ($p['brand'] ?? '') . ' ' . ($p['size_ml'] ? $p['size_ml'] . 'ml' : '')) ?></option><?php endforeach; ?></datalist>
        </div>
        <div class="table-responsive">
        <table class="table align-middle">
            <thead><tr><th>Producto</th><th style="width:110px">Cantidad</th><th style="width:170px">Costo unit. (sin IVA)</th><th style="width:100px">IVA %</th><th class="text-end">Total</th><th></th></tr></thead>
            <tbody id="rows"></tbody>
            <tfoot><tr><td colspan="4" class="text-end fw-bold">Total compra</td><td class="text-end fw-bold" id="gtotal">$ 0</td><td></td></tr></tfoot>
        </table>
        </div>
        <button class="btn btn-primary btn-lg"><i class="bi bi-check2"></i> Registrar compra y actualizar stock</button>
    </div>
</div>
</form>
<?php App\Core\View::start(); ?>
<script>
const PRODUCTS = <?= json_encode($products, JSON_UNESCAPED_UNICODE) ?>;
let n = 0;
const rows = document.getElementById('rows');
function addRow(p) {
    const ex = rows.querySelector(`[data-pid="${p.id}"]`);
    if (ex) { const q = ex.querySelector('.q'); q.value = +q.value + 1; recalc(); return; }
    const i = n++;
    const tr = document.createElement('tr');
    tr.dataset.pid = p.id;
    tr.innerHTML = `<td>${p.name.replace(/</g,'&lt;')} <small class="text-muted">${(p.brand||'').replace(/</g,'&lt;')} ${p.size_ml ? p.size_ml + 'ml' : ''} · stock ${p.stock}</small>
        <input type="hidden" name="items[${i}][product_id]" value="${p.id}"></td>
        <td><input type="number" min="1" class="form-control q" name="items[${i}][qty]" value="1"></td>
        <td><input type="number" min="0" step="any" class="form-control c" name="items[${i}][unit_cost]" value="${p.cost}"></td>
        <td><select class="form-select t" name="items[${i}][tax_rate]">${[19,5,0].map(r => `<option ${+p.tax_rate===r?'selected':''}>${r}</option>`).join('')}</select></td>
        <td class="text-end tot"></td>
        <td><button type="button" class="btn btn-sm btn-light text-danger del"><i class="bi bi-x"></i></button></td>`;
    rows.appendChild(tr);
    recalc();
}
function recalc() {
    let g = 0;
    rows.querySelectorAll('tr').forEach(tr => {
        const t = (+tr.querySelector('.q').value || 0) * (+tr.querySelector('.c').value || 0) * (1 + (+tr.querySelector('.t').value) / 100);
        tr.querySelector('.tot').textContent = fmt(t); g += t;
    });
    document.getElementById('gtotal').textContent = fmt(g);
}
rows.addEventListener('input', recalc);
rows.addEventListener('click', e => { if (e.target.closest('.del')) { e.target.closest('tr').remove(); recalc(); } });
const s = document.getElementById('pSearch');
s.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = s.value.trim().toLowerCase();
    const p = PRODUCTS.find(x => x.code.toLowerCase() === v) || PRODUCTS.find(x => x.name.toLowerCase().includes(v));
    if (p) { addRow(p); s.value = ''; } else alert('Producto no encontrado. Créalo primero en Productos.');
});
s.addEventListener('change', () => { const p = PRODUCTS.find(x => x.code === s.value); if (p) { addRow(p); s.value = ''; } });
</script>
<?php App\Core\View::end(); ?>

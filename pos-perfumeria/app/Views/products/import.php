<div class="row"><div class="col-lg-8">
<div class="card"><div class="card-body">
    <p>Sube un archivo <b>CSV</b> (separado por <code>;</code> o <code>,</code>) con estas columnas en la primera fila:</p>
    <pre class="bg-light p-2 rounded small"><?= e(implode(';', $cols)) ?></pre>
    <ul class="small text-muted">
        <li>Obligatorias: <b>codigo, nombre, precio</b>. Precio con IVA incluido.</li>
        <li>Si el código ya existe, el producto se <b>actualiza</b> (el stock no se modifica).</li>
        <li>Marcas y categorías que no existan se crean automáticamente.</li>
        <li>Género: Femenino / Masculino / Unisex (o Mujer / Hombre). IVA: 19, 5 o 0.</li>
        <li>Valores numéricos en formato colombiano: <code>559.900</code> o <code>559900,50</code>.</li>
        <li>Tip: <a href="<?= url('/products/export') ?>">exporta tus productos</a> para obtener una plantilla con el formato correcto.</li>
    </ul>
    <form method="post" enctype="multipart/form-data" action="<?= url('/products/import') ?>" class="d-flex gap-2">
        <?= csrf_field() ?>
        <input type="file" name="file" accept=".csv,text/csv" class="form-control" required>
        <button class="btn btn-primary text-nowrap"><i class="bi bi-upload"></i> Importar</button>
    </form>
</div></div>
</div></div>

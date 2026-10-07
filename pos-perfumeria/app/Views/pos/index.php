<?php if (!$session): ?>
<div class="row justify-content-center mt-4">
    <div class="col-md-6 col-lg-4">
        <div class="card">
            <div class="card-body text-center p-4">
                <div class="display-5 text-primary mb-2"><i class="bi bi-cash-coin"></i></div>
                <h2 class="h5">Abre la caja para empezar a vender</h2>
                <p class="text-muted small">Registra el dinero base con el que inicias el turno.</p>
                <form method="post" action="<?= url('/cash/open') ?>">
                    <?= csrf_field() ?>
                    <input type="hidden" name="redirect" value="/pos">
                    <div class="input-group input-group-lg mb-3">
                        <span class="input-group-text">$</span>
                        <input type="number" name="opening_amount" class="form-control" min="0" step="50" value="0" required autofocus>
                    </div>
                    <button class="btn btn-primary btn-lg w-100">Abrir caja</button>
                </form>
            </div>
        </div>
    </div>
</div>
<?php return; endif; ?>

<div class="pos-grid">
    <!-- ===== Izquierda: búsqueda y catálogo ===== -->
    <section class="pos-left">
        <div class="pos-search mb-2">
            <i class="bi bi-upc-scan"></i>
            <input id="search" class="form-control" placeholder="Escanea el código de barras o busca por nombre / marca  (F2)" autocomplete="off" autofocus>
            <div id="searchResults" class="search-results d-none"></div>
        </div>
        <div class="d-flex gap-1 flex-wrap mb-2" id="catFilters">
            <button class="btn btn-sm btn-primary" data-cat="">Todos</button>
            <?php foreach ($categories as $c): ?>
                <button class="btn btn-sm btn-outline-primary" data-cat="<?= (int) $c['id'] ?>"><?= e($c['name']) ?></button>
            <?php endforeach; ?>
            <div class="btn-group btn-group-sm ms-auto" role="group">
                <button class="btn btn-outline-secondary" data-gender="">Todos</button>
                <button class="btn btn-outline-secondary" data-gender="Femenino">Mujer</button>
                <button class="btn btn-outline-secondary" data-gender="Masculino">Hombre</button>
                <button class="btn btn-outline-secondary" data-gender="Unisex">Unisex</button>
            </div>
        </div>
        <div class="product-grid" id="productGrid"></div>
    </section>

    <!-- ===== Derecha: carrito ===== -->
    <section class="pos-right card">
        <div class="p-2 border-bottom">
            <div class="d-flex gap-2 align-items-center">
                <div class="flex-grow-1 position-relative">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text"><i class="bi bi-person"></i></span>
                        <input id="customerSearch" class="form-control" placeholder="Buscar cliente (cédula / nombre)" autocomplete="off">
                        <button class="btn btn-outline-primary" data-bs-toggle="modal" data-bs-target="#customerModal" title="Nuevo cliente"><i class="bi bi-person-plus"></i></button>
                    </div>
                    <div id="customerResults" class="search-results d-none"></div>
                </div>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2">
                <div class="small">
                    <strong id="customerName"></strong>
                    <span class="text-muted" id="customerDoc"></span>
                    <a href="#" id="customerReset" class="ms-1 small d-none">quitar</a>
                </div>
                <div class="btn-group btn-group-sm doc-toggle" role="group">
                    <input type="radio" class="btn-check" name="docType" id="dtPos" value="POS" checked>
                    <label class="btn btn-outline-primary" for="dtPos" title="Documento equivalente electrónico POS">Ticket POS</label>
                    <input type="radio" class="btn-check" name="docType" id="dtFev" value="FEV" <?= $hasFev ? '' : 'disabled' ?>>
                    <label class="btn btn-outline-primary" for="dtFev" title="Factura electrónica de venta">Factura elect.</label>
                </div>
            </div>
        </div>

        <div class="cart" id="cart"></div>

        <div class="totals">
            <div class="d-flex justify-content-between small"><span>Subtotal (sin IVA)</span><span id="tSubtotal">$ 0</span></div>
            <div class="d-flex justify-content-between small"><span>IVA</span><span id="tTax">$ 0</span></div>
            <div class="d-flex justify-content-between small text-success"><span>Descuentos</span><span id="tDiscount">$ 0</span></div>
            <div class="d-flex justify-content-between align-items-center mt-1">
                <div class="input-group input-group-sm flex-nowrap" style="width: 175px">
                    <span class="input-group-text">Desc.</span>
                    <input type="number" id="globalDiscount" class="form-control" min="0" max="<?= e($maxDiscount) ?>" step="1" value="0">
                    <span class="input-group-text">%</span>
                </div>
                <div class="grand" id="tTotal">$ 0</div>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button class="btn btn-outline-danger" id="btnClear" title="Vaciar venta"><i class="bi bi-trash"></i></button>
                <button class="btn btn-primary btn-charge flex-grow-1" id="btnCharge" disabled>
                    <i class="bi bi-credit-card"></i> Cobrar <kbd>F9</kbd>
                </button>
            </div>
        </div>
    </section>
</div>

<!-- ===== Modal de pago ===== -->
<div class="modal fade" id="payModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Cobrar <span id="payTotal" class="text-primary fw-bold"></span></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div id="payRows"></div>
                <button class="btn btn-sm btn-link px-0" id="addPayRow"><i class="bi bi-plus-circle"></i> Agregar otro medio de pago (pago mixto)</button>
                <div class="pay-quick d-flex flex-wrap gap-2 my-3" id="quickCash"></div>
                <div class="row g-2 align-items-center">
                    <div class="col-md-6">
                        <input id="saleNotes" class="form-control form-control-sm" maxlength="255" placeholder="Observaciones (opcional)">
                    </div>
                    <div class="col-md-6 text-md-end">
                        <div class="small text-muted">Recibido: <strong id="payReceived">$ 0</strong></div>
                        <div class="change-box" id="payChangeWrap">Cambio: <span id="payChange">$ 0</span></div>
                    </div>
                </div>
                <div class="alert alert-danger mt-3 mb-0 d-none" id="payError"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
                <button class="btn btn-primary btn-lg px-4" id="btnConfirm"><i class="bi bi-check2-circle"></i> Confirmar venta <kbd>Enter</kbd></button>
            </div>
        </div>
    </div>
</div>

<!-- ===== Modal venta exitosa ===== -->
<div class="modal fade" id="doneModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content text-center">
            <div class="modal-body p-4">
                <div class="display-4 text-success"><i class="bi bi-check-circle-fill"></i></div>
                <h4 class="mb-1">Venta registrada</h4>
                <div class="text-muted mb-2" id="doneNumber"></div>
                <div class="change-box mb-2" id="doneChange"></div>
                <div id="doneEdoc" class="small mb-3"></div>
                <div class="d-flex gap-2 justify-content-center">
                    <a href="#" target="_blank" class="btn btn-outline-primary" id="donePrint"><i class="bi bi-printer"></i> Imprimir</a>
                    <a href="#" class="btn btn-outline-secondary" id="doneView"><i class="bi bi-eye"></i> Ver venta</a>
                    <button class="btn btn-primary" data-bs-dismiss="modal" id="doneNew"><i class="bi bi-plus-lg"></i> Nueva venta</button>
                </div>
                <div class="form-check form-switch d-inline-block mt-3 small">
                    <input class="form-check-input" type="checkbox" id="autoPrint">
                    <label class="form-check-label" for="autoPrint">Imprimir automáticamente</label>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- ===== Modal nuevo cliente ===== -->
<div class="modal fade" id="customerModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <form class="modal-content" id="customerForm">
            <div class="modal-header"><h5 class="modal-title">Nuevo cliente</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body">
                <?php $c = []; $prefix = 'qc_'; include BASE_PATH . '/app/Views/customers/_fields.php'; ?>
                <div class="alert alert-danger mt-3 mb-0 d-none" id="customerError"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
                <button class="btn btn-primary">Guardar y seleccionar</button>
            </div>
        </form>
    </div>
</div>

<?php App\Core\View::start(); ?>
<script>
window.POS = {
    products: <?= json_encode(array_map(fn($p) => [
        'id' => (int) $p['id'], 'code' => $p['code'], 'name' => $p['name'], 'brand' => $p['brand'],
        'price' => (float) $p['price'], 'tax_rate' => (float) $p['tax_rate'], 'stock' => (int) $p['stock'],
        'size_ml' => $p['size_ml'] ? (int) $p['size_ml'] : null, 'concentration' => $p['concentration'],
        'gender' => $p['gender'], 'category_id' => $p['category_id'] ? (int) $p['category_id'] : null,
        'image' => $p['image'] ? url('uploads/' . $p['image']) : null,
    ], $products), JSON_UNESCAPED_UNICODE) ?>,
    consumer: <?= json_encode(['id' => 1, 'name' => $consumer['name'], 'doc' => $consumer['doc_number'], 'email' => $consumer['email']], JSON_UNESCAPED_UNICODE) ?>,
    maxDiscount: <?= json_encode((float) $maxDiscount) ?>,
    allowNegative: <?= $allowNegative ? 'true' : 'false' ?>,
    methods: <?= json_encode(payment_methods(), JSON_UNESCAPED_UNICODE) ?>,
};
</script>
<script src="<?= asset('js/pos.js') ?>"></script>
<?php App\Core\View::end(); ?>

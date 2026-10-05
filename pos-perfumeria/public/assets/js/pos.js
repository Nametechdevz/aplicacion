(() => {
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const STORE_KEY = 'pos_cart_v1';

    const state = {
        cart: [],
        customer: { ...POS.consumer },
        docType: 'POS',
        globalDiscount: 0,
        filter: { cat: '', gender: '', text: '' },
    };

    // ---------- Persistencia (por si se recarga la página) ----------
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify({ cart: state.cart, customer: state.customer, docType: state.docType, globalDiscount: state.globalDiscount })); } catch (e) { }
    }
    function load() {
        try {
            const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (!d) return;
            // refrescar precios/stock con el catálogo actual
            state.cart = (d.cart || []).map(l => {
                const p = POS.products.find(x => x.id === l.id);
                return p ? { ...p, qty: l.qty, discount: l.discount || 0, price: l.priceOverride ? l.price : p.price, priceOverride: !!l.priceOverride } : null;
            }).filter(Boolean);
            state.customer = d.customer || state.customer;
            state.docType = d.docType || 'POS';
            state.globalDiscount = d.globalDiscount || 0;
        } catch (e) { }
    }

    // ---------- Cálculos (idénticos al servidor) ----------
    const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    function lineCalc(l) {
        const pct = 100 * (1 - (1 - (l.discount || 0) / 100) * (1 - (state.globalDiscount || 0) / 100));
        const gross = round2(l.price * l.qty);
        const disc = round2(gross * pct / 100);
        const total = round2(gross - disc);
        const base = round2(total / (1 + l.tax_rate / 100));
        return { gross, disc, total, base, tax: round2(total - base) };
    }
    function totals() {
        let subtotal = 0, tax = 0, total = 0, disc = 0;
        state.cart.forEach(l => { const c = lineCalc(l); subtotal += c.base; tax += c.tax; total += c.total; disc += c.disc; });
        return { subtotal: round2(subtotal), tax: round2(tax), total: round2(total), disc: round2(disc) };
    }

    // ---------- Catálogo ----------
    function productLabel(p) {
        return [p.concentration, p.size_ml ? p.size_ml + 'ml' : ''].filter(Boolean).join(' · ');
    }
    function renderGrid() {
        const t = state.filter.text.toLowerCase();
        const list = POS.products.filter(p =>
            (!state.filter.cat || p.category_id == state.filter.cat) &&
            (!state.filter.gender || p.gender === state.filter.gender) &&
            (!t || (p.name + ' ' + (p.brand || '') + ' ' + p.code).toLowerCase().includes(t))
        ).slice(0, 300);
        $('#productGrid').innerHTML = list.map(p => `
            <div class="product-card ${p.stock <= 0 ? 'out' : ''}" data-id="${p.id}">
                ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ''}
                <div class="pc-brand">${esc(p.brand || '')}</div>
                <div class="pc-name">${esc(p.name)}</div>
                <div class="pc-meta">${esc(productLabel(p))} · <span class="${p.stock <= 0 ? 'text-danger' : ''}">Stock ${p.stock}</span></div>
                <div class="pc-price">${fmt(p.price)}</div>
            </div>`).join('') || '<div class="text-muted p-3">No hay productos con ese filtro.</div>';
    }

    // ---------- Carrito ----------
    function addProduct(p, qty = 1) {
        const line = state.cart.find(l => l.id === p.id);
        const inCart = line ? line.qty : 0;
        if (!POS.allowNegative && inCart + qty > p.stock) {
            toast(`Stock insuficiente de ${p.name} (disponible: ${p.stock})`, 'danger');
            return;
        }
        if (line) line.qty += qty;
        else state.cart.push({ ...p, qty, discount: 0, priceOverride: false });
        render();
        beep();
    }
    function renderCart() {
        if (!state.cart.length) {
            $('#cart').innerHTML = '<div class="cart-empty"><i class="bi bi-bag"></i>Escanea o selecciona productos</div>';
            return;
        }
        $('#cart').innerHTML = state.cart.map((l, i) => {
            const c = lineCalc(l);
            return `<div class="cart-line" data-i="${i}">
                <div class="d-flex justify-content-between gap-2">
                    <div class="cl-name">${esc(l.name)} <small class="text-muted fw-normal">${esc(l.brand || '')} ${esc(productLabel(l))}</small></div>
                    <button class="btn btn-sm btn-link text-danger p-0" data-act="del" title="Quitar"><i class="bi bi-x-lg"></i></button>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-1 gap-2">
                    <div class="qty-ctl">
                        <button class="btn btn-sm btn-outline-secondary" data-act="minus">−</button>
                        <input class="form-control form-control-sm mx-1" data-act="qty" value="${l.qty}" inputmode="numeric">
                        <button class="btn btn-sm btn-outline-secondary" data-act="plus">+</button>
                    </div>
                    <div class="small text-muted">
                        ${APP.isAdmin
                            ? `<input class="form-control form-control-sm d-inline-block text-end" style="width:95px" data-act="price" value="${l.price}" title="Precio unitario">`
                            : fmt(l.price)}
                    </div>
                    <div class="input-group input-group-sm" style="width:82px" title="Descuento %">
                        <input class="form-control text-end" data-act="disc" value="${l.discount || ''}" placeholder="0" inputmode="decimal">
                        <span class="input-group-text px-1">%</span>
                    </div>
                    <div class="fw-bold text-end" style="min-width:90px">${fmt(c.total)}</div>
                </div>
            </div>`;
        }).join('');
    }
    function render() {
        renderCart();
        const t = totals();
        $('#tSubtotal').textContent = fmt(t.subtotal);
        $('#tTax').textContent = fmt(t.tax);
        $('#tDiscount').textContent = t.disc > 0 ? '− ' + fmt(t.disc) : fmt(0);
        $('#tTotal').textContent = fmt(t.total);
        $('#btnCharge').disabled = !state.cart.length;
        $('#customerName').textContent = state.customer.name;
        $('#customerDoc').textContent = state.customer.id !== 1 ? '· ' + state.customer.doc : '';
        $('#customerReset').classList.toggle('d-none', state.customer.id === 1);
        $(`input[name=docType][value=${state.docType}]`).checked = true;
        $('#globalDiscount').value = state.globalDiscount || 0;
        save();
    }

    $('#cart').addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.tagName === 'INPUT') return;
        const i = +btn.closest('.cart-line').dataset.i;
        const l = state.cart[i];
        if (btn.dataset.act === 'del') state.cart.splice(i, 1);
        if (btn.dataset.act === 'minus') { l.qty > 1 ? l.qty-- : state.cart.splice(i, 1); }
        if (btn.dataset.act === 'plus') {
            if (!POS.allowNegative && l.qty + 1 > l.stock) return toast('Stock insuficiente', 'danger');
            l.qty++;
        }
        render();
    });
    $('#cart').addEventListener('change', e => {
        const inp = e.target.closest('input[data-act]');
        if (!inp) return;
        const i = +inp.closest('.cart-line').dataset.i;
        const l = state.cart[i];
        if (inp.dataset.act === 'qty') {
            let q = Math.max(1, parseInt(inp.value, 10) || 1);
            if (!POS.allowNegative && q > l.stock) { toast(`Solo hay ${l.stock} en stock`, 'danger'); q = Math.max(1, l.stock); }
            l.qty = q;
        }
        if (inp.dataset.act === 'disc') {
            let d = parseFloat(String(inp.value).replace(',', '.')) || 0;
            if (d < 0) d = 0;
            if (d > POS.maxDiscount) { toast(`Descuento máximo permitido: ${POS.maxDiscount}%`, 'warning'); d = POS.maxDiscount; }
            l.discount = d;
        }
        if (inp.dataset.act === 'price') {
            const p = parseFloat(String(inp.value).replace(',', '.'));
            if (p > 0) { l.price = p; l.priceOverride = true; }
        }
        render();
    });

    $('#globalDiscount').addEventListener('change', e => {
        let d = parseFloat(e.target.value) || 0;
        if (d > POS.maxDiscount) { toast(`Descuento máximo permitido: ${POS.maxDiscount}%`, 'warning'); d = POS.maxDiscount; }
        state.globalDiscount = Math.max(0, d);
        render();
    });
    $$('input[name=docType]').forEach(r => r.addEventListener('change', () => { state.docType = r.value; render(); }));
    $('#btnClear').addEventListener('click', () => {
        if (state.cart.length && !confirm('¿Vaciar la venta actual?')) return;
        resetSale();
    });
    function resetSale() {
        state.cart = []; state.customer = { ...POS.consumer }; state.docType = 'POS'; state.globalDiscount = 0;
        render();
        $('#search').focus();
    }

    $('#productGrid').addEventListener('click', e => {
        const card = e.target.closest('.product-card');
        if (!card) return;
        addProduct(POS.products.find(p => p.id === +card.dataset.id));
    });
    $$('#catFilters [data-cat]').forEach(b => b.addEventListener('click', () => {
        $$('#catFilters [data-cat]').forEach(x => { x.classList.remove('btn-primary'); x.classList.add('btn-outline-primary'); });
        b.classList.add('btn-primary'); b.classList.remove('btn-outline-primary');
        state.filter.cat = b.dataset.cat; renderGrid();
    }));
    $$('#catFilters [data-gender]').forEach(b => b.addEventListener('click', () => {
        $$('#catFilters [data-gender]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.filter.gender = b.dataset.gender; renderGrid();
    }));

    // ---------- Búsqueda / escáner ----------
    const search = $('#search');
    let selIdx = -1, results = [];
    function showResults() {
        const box = $('#searchResults');
        if (!results.length) { box.classList.add('d-none'); return; }
        box.innerHTML = results.map((p, i) => `<div class="item ${i === selIdx ? 'active' : ''}" data-i="${i}">
            <div><strong>${esc(p.name)}</strong> <small class="text-muted">${esc(p.brand || '')} ${esc(productLabel(p))}</small><br><small class="text-muted">${esc(p.code)} · Stock ${p.stock}</small></div>
            <div class="fw-bold text-primary">${fmt(p.price)}</div></div>`).join('');
        box.classList.remove('d-none');
    }
    search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        state.filter.text = q.length >= 2 ? q : '';
        renderGrid();
        if (q.length < 2) { results = []; showResults(); return; }
        results = POS.products.filter(p => (p.name + ' ' + (p.brand || '') + ' ' + p.code).toLowerCase().includes(q)).slice(0, 12);
        selIdx = results.length ? 0 : -1;
        showResults();
    });
    search.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { selIdx = Math.min(results.length - 1, selIdx + 1); showResults(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { selIdx = Math.max(0, selIdx - 1); showResults(); e.preventDefault(); }
        if (e.key === 'Escape') { search.value = ''; results = []; showResults(); state.filter.text = ''; renderGrid(); }
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = search.value.trim();
            if (!q) return;
            // Soporta "3*codigo" para cantidad
            let qty = 1, code = q;
            const m = q.match(/^(\d+)\s*\*\s*(.+)$/);
            if (m) { qty = parseInt(m[1], 10); code = m[2]; }
            const exact = POS.products.find(p => p.code === code);
            const p = exact || (results[selIdx] ?? null);
            if (p) { addProduct(p, qty); }
            else { toast('Producto no encontrado: ' + code, 'danger'); beep(true); }
            search.value = ''; results = []; showResults(); state.filter.text = ''; renderGrid();
        }
    });
    $('#searchResults').addEventListener('mousedown', e => {
        const it = e.target.closest('.item');
        if (!it) return;
        addProduct(results[+it.dataset.i]);
        search.value = ''; results = []; showResults(); state.filter.text = ''; renderGrid();
        setTimeout(() => search.focus(), 0);
    });
    search.addEventListener('blur', () => setTimeout(() => $('#searchResults').classList.add('d-none'), 150));

    // ---------- Clientes ----------
    const cs = $('#customerSearch');
    let cTimer;
    cs.addEventListener('input', () => {
        clearTimeout(cTimer);
        const q = cs.value.trim();
        if (q.length < 2) { $('#customerResults').classList.add('d-none'); return; }
        cTimer = setTimeout(async () => {
            const r = await api('/api/customers/search?q=' + encodeURIComponent(q));
            const box = $('#customerResults');
            box.innerHTML = (r.items || []).map(c => `<div class="item" data-c='${esc(JSON.stringify(c))}'>
                <div><strong>${esc(c.name)}</strong><br><small class="text-muted">${esc(c.doc_label)} ${esc(c.doc_number)}</small></div>
                <small class="text-muted">${esc(c.email || 'sin correo')}</small></div>`).join('')
                || '<div class="item text-muted">Sin resultados. Usa el botón + para crearlo.</div>';
            box.classList.remove('d-none');
        }, 250);
    });
    cs.addEventListener('blur', () => setTimeout(() => $('#customerResults').classList.add('d-none'), 150));
    $('#customerResults').addEventListener('mousedown', e => {
        const it = e.target.closest('[data-c]');
        if (!it) return;
        const c = JSON.parse(it.dataset.c);
        setCustomer(c);
    });
    function setCustomer(c) {
        state.customer = { id: +c.id, name: c.name, doc: c.doc_number, email: c.email };
        cs.value = '';
        $('#customerResults').classList.add('d-none');
        render();
    }
    $('#customerReset').addEventListener('click', e => { e.preventDefault(); state.customer = { ...POS.consumer }; if (state.docType === 'FEV') state.docType = 'POS'; render(); });

    $('#customerForm').addEventListener('submit', async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        const r = await api('/api/customers', { method: 'POST', body: JSON.stringify(data) });
        if (!r.ok) { $('#customerError').textContent = r.error; $('#customerError').classList.remove('d-none'); return; }
        $('#customerError').classList.add('d-none');
        e.target.reset();
        bootstrap.Modal.getOrCreateInstance('#customerModal').hide();
        setCustomer(r.customer);
        toast('Cliente creado', 'success');
    });

    // ---------- Pago ----------
    const payModal = new bootstrap.Modal('#payModal');
    const doneModal = new bootstrap.Modal('#doneModal');
    function methodOptions(sel) {
        return Object.entries(POS.methods).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
    }
    function addPayRow(method = 'efectivo', amount = '') {
        const div = document.createElement('div');
        div.className = 'row g-2 mb-2 pay-row';
        div.innerHTML = `
            <div class="col-5 col-md-4"><select class="form-select form-select-lg" data-f="method">${methodOptions(method)}</select></div>
            <div class="col-7 col-md-4"><div class="input-group input-group-lg"><span class="input-group-text">$</span><input class="form-control" data-f="amount" inputmode="numeric" value="${amount}"></div></div>
            <div class="col-10 col-md-3"><input class="form-control form-control-lg" data-f="reference" placeholder="Referencia / voucher"></div>
            <div class="col-2 col-md-1 d-grid"><button class="btn btn-outline-danger" data-f="del" tabindex="-1"><i class="bi bi-x"></i></button></div>`;
        $('#payRows').appendChild(div);
        updatePay();
        return div;
    }
    function readPayments() {
        return $$('#payRows .pay-row').map(r => ({
            method: $('[data-f=method]', r).value,
            amount: parseFloat(String($('[data-f=amount]', r).value).replace(/\./g, '').replace(',', '.')) || 0,
            reference: $('[data-f=reference]', r).value,
        }));
    }
    function updatePay() {
        const total = totals().total;
        const pays = readPayments();
        const received = pays.reduce((a, p) => a + p.amount, 0);
        const change = received - total;
        $('#payReceived').textContent = fmt(received);
        $('#payChange').textContent = change >= 0 ? fmt(change) : 'Faltan ' + fmt(-change);
        $('#payChangeWrap').className = 'change-box ' + (change >= 0 ? 'text-success' : 'text-danger');
        $('#btnConfirm').disabled = change < -0.009;
        $$('#payRows .pay-row').forEach(r => { $('[data-f=reference]', r).classList.toggle('invisible', $('[data-f=method]', r).value === 'efectivo'); });
    }
    function quickCashButtons(total) {
        const opts = new Set([total]);
        [10000, 20000, 50000, 100000].forEach(b => opts.add(Math.ceil(total / b) * b));
        $('#quickCash').innerHTML = '<span class="small text-muted align-self-center me-1">Efectivo rápido:</span>' +
            [...opts].sort((a, b) => a - b).slice(0, 5).map(v => `<button class="btn btn-outline-success" data-v="${v}">${fmt(v)}</button>`).join('');
    }
    $('#quickCash').addEventListener('click', e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        let row = $$('#payRows .pay-row').find(r => $('[data-f=method]', r).value === 'efectivo') || $('#payRows .pay-row');
        $('[data-f=method]', row).value = 'efectivo';
        $('[data-f=amount]', row).value = b.dataset.v;
        updatePay();
    });
    $('#payRows').addEventListener('input', updatePay);
    $('#payRows').addEventListener('change', updatePay);
    $('#payRows').addEventListener('click', e => {
        if (e.target.closest('[data-f=del]') && $$('#payRows .pay-row').length > 1) { e.target.closest('.pay-row').remove(); updatePay(); }
    });
    $('#addPayRow').addEventListener('click', () => {
        const total = totals().total;
        const paid = readPayments().reduce((a, p) => a + p.amount, 0);
        const row = addPayRow('tarjeta_debito', Math.max(0, Math.round(total - paid)));
        $('[data-f=amount]', row).focus();
    });

    function openPay() {
        if (!state.cart.length) return;
        if (state.docType === 'FEV' && state.customer.id === 1) {
            toast('Para factura electrónica selecciona o crea un cliente identificado.', 'warning');
            cs.focus();
            return;
        }
        const total = totals().total;
        $('#payTotal').textContent = fmt(total);
        $('#payRows').innerHTML = '';
        $('#payError').classList.add('d-none');
        $('#saleNotes').value = '';
        addPayRow('efectivo', Math.round(total));
        quickCashButtons(Math.round(total));
        payModal.show();
        setTimeout(() => { const a = $('#payRows [data-f=amount]'); a.focus(); a.select(); }, 350);
    }
    $('#btnCharge').addEventListener('click', openPay);

    let busy = false;
    async function confirmSale() {
        if (busy || $('#btnConfirm').disabled) return;
        busy = true;
        $('#btnConfirm').disabled = true;
        $('#btnConfirm').innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
        const payload = {
            customer_id: state.customer.id,
            doc_type: state.docType,
            global_discount: state.globalDiscount,
            notes: $('#saleNotes').value,
            items: state.cart.map(l => ({ product_id: l.id, qty: l.qty, discount: l.discount || 0, price: l.priceOverride ? l.price : undefined })),
            payments: readPayments(),
        };
        const r = await api('/pos/checkout', { method: 'POST', body: JSON.stringify(payload) });
        busy = false;
        $('#btnConfirm').innerHTML = '<i class="bi bi-check2-circle"></i> Confirmar venta <kbd>Enter</kbd>';
        $('#btnConfirm').disabled = false;
        if (!r.ok) {
            $('#payError').textContent = r.error || 'No se pudo registrar la venta';
            $('#payError').classList.remove('d-none');
            return;
        }
        // Actualizar stock local
        state.cart.forEach(l => { const p = POS.products.find(x => x.id === l.id); if (p) p.stock -= l.qty; });
        payModal.hide();
        $('#doneNumber').textContent = (r.sale.doc_type === 'FEV' ? 'Factura electrónica ' : 'Documento POS ') + r.sale.full_number + ' · ' + fmt(r.sale.total);
        $('#doneChange').innerHTML = r.sale.change_amount > 0 ? `Cambio: <span class="text-success">${fmt(r.sale.change_amount)}</span>` : '';
        const ok = r.edoc_status === 'aceptado';
        $('#doneEdoc').innerHTML = ok
            ? '<span class="badge text-bg-success"><i class="bi bi-cloud-check"></i> DIAN: aceptado</span>'
            : `<span class="badge text-bg-warning"><i class="bi bi-cloud-slash"></i> DIAN: ${esc(r.edoc_status)}</span><div class="text-muted mt-1">${esc(r.edoc_message || '')}<br>Puedes reintentar el envío desde Facturación DIAN.</div>`;
        $('#donePrint').href = r.ticket_url;
        $('#doneView').href = r.sale_url;
        resetSale();
        renderGrid();
        doneModal.show();
        if ($('#autoPrint').checked) window.open(r.ticket_url + '?autoprint=1', '_blank');
    }
    $('#btnConfirm').addEventListener('click', confirmSale);
    $('#payModal').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.target.matches('button, [data-f=reference], #saleNotes')) { e.preventDefault(); confirmSale(); }
    });
    $('#doneModal').addEventListener('hidden.bs.modal', () => search.focus());
    try { $('#autoPrint').checked = localStorage.getItem('pos_autoprint') === '1'; } catch (e) { }
    $('#autoPrint').addEventListener('change', e => { try { localStorage.setItem('pos_autoprint', e.target.checked ? '1' : '0'); } catch (x) { } });

    // ---------- Atajos ----------
    document.addEventListener('keydown', e => {
        if (e.key === 'F2') { e.preventDefault(); search.focus(); search.select(); }
        if (e.key === 'F9') { e.preventDefault(); openPay(); }
        if (e.key === 'F4') { e.preventDefault(); cs.focus(); }
    });

    // ---------- Utilidades ----------
    function toast(msg, type = 'info') {
        let wrap = $('#toastWrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'toastWrap';
            wrap.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            wrap.style.zIndex = 2000;
            document.body.appendChild(wrap);
        }
        const el = document.createElement('div');
        el.className = `toast align-items-center text-bg-${type} border-0`;
        el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
        wrap.appendChild(el);
        const t = new bootstrap.Toast(el, { delay: 3000 });
        t.show();
        el.addEventListener('hidden.bs.toast', () => el.remove());
    }
    let audioCtx;
    function beep(error = false) {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.frequency.value = error ? 220 : 880; g.gain.value = 0.05;
            o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + (error ? 0.25 : 0.07));
        } catch (e) { }
    }

    load();
    renderGrid();
    render();
})();

/* ==========================================================================
   Punto de venta. El navegador solo calcula una vista previa: el servidor
   recalcula precios, descuentos, existencias y pagos al cotizar y al vender.
   ========================================================================== */
(function () {
  'use strict';
  var J = window.JSP, doc = document;
  var root = doc.querySelector('[data-pos]');
  if (!root) return;
  var cfg = JSON.parse(doc.getElementById('pos-config').textContent);
  var esc = J.escapeHtml, money = J.money, icon = J.icon;

  var state = {
    catalog: [], byCode: {}, cat: '', q: '',
    lines: [], selected: -1, customer: null,
    quote: null, requestId: null, payments: [], busy: false
  };

  /* ---------------- Utilidades numéricas (vista previa) ---------------- */
  function n(v) { return Number(String(v == null ? '' : v).replace(',', '.')) || 0; }
  var MD = Math.pow(10, cfg.money_decimals || 0);
  function round2(v) { return Math.round((v + Number.EPSILON) * MD) / MD; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function fmtQty(v, unit) { return J.qty(v, unit); }
  function placeholder() {
    return '<span class="placeholder-img"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="26" y="6" width="12" height="7" rx="1.5"/><path d="M28 13h8l2 5H26z"/><path d="M17 24c0-3.3 2.7-6 6-6h18c3.3 0 6 2.7 6 6v26c0 4.4-3.6 8-8 8H25c-4.4 0-8-3.6-8-8z"/><path d="M17 31h30" stroke-dasharray="2 3"/></svg></span>';
  }

  /* ---------------- Catálogo ---------------- */
  var grid = root.querySelector('[data-grid]');
  var search = root.querySelector('[data-search]');

  function loadCatalog() {
    return J.api('/api/pos/catalog').then(function (d) {
      state.catalog = d.items;
      state.byCode = {};
      d.items.forEach(function (p) {
        [p.barcode, p.sku, p.code].forEach(function (c) { if (c) state.byCode[String(c).toLowerCase()] = { product: p }; });
        p.variants.forEach(function (v) { [v.barcode, v.sku].forEach(function (c) { if (c) state.byCode[String(c).toLowerCase()] = { product: p, variant: v }; }); });
      });
      renderGrid();
      renderCart();
    }).catch(function (e) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>No fue posible cargar el catálogo</h3><p>' + esc(e.message) + '</p><button class="btn" type="button" data-retry>Reintentar</button></div>';
    });
  }
  grid.addEventListener('click', function (e) { if (e.target.closest('[data-retry]')) loadCatalog(); });

  function stockState(p) {
    var a = n(p.available);
    if (a <= 0) return ['is-out', 'Agotado'];
    if (n(p.min) > 0 && a <= n(p.min)) return ['is-low', fmtQty(a, p.unit)];
    return ['', fmtQty(a, p.unit)];
  }
  function inCart(pid) {
    return state.lines.filter(function (l) { return l.product.id === pid; }).length;
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var words = q.split(/\s+/).filter(Boolean);
    return state.catalog.filter(function (p) {
      if (state.cat && String(p.category) !== String(state.cat)) return false;
      if (!words.length) return true;
      var hay = (p.name + ' ' + (p.brand || '') + ' ' + p.code + ' ' + (p.sku || '') + ' ' + (p.barcode || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
  }
  function renderGrid() {
    var items = filtered();
    if (!items.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Sin coincidencias</h3><p>No hay productos activos que coincidan con «' + esc(state.q) + '». Verifique el código o cambie la categoría.</p></div>';
      return;
    }
    var html = items.slice(0, 240).map(function (p) {
      var st = stockState(p), count = inCart(p.id);
      var media = p.thumb ? '<img src="' + esc(p.thumb) + '" alt="" loading="lazy" decoding="async">' : placeholder();
      var tag = p.fractional ? '<span class="badge badge-gold no-dot pi-tag">' + esc(p.unit) + '</span>' : (p.variants.length ? '<span class="badge badge-neutral no-dot pi-tag">' + p.variants.length + ' present.</span>' : '');
      return '<button type="button" class="pos-item ' + (st[0] === 'is-out' ? 'is-out' : '') + '" data-pid="' + p.id + '" aria-label="' + esc(p.name + ', ' + money(p.price)) + '">' +
        '<span class="p-media">' + media + tag + (count ? '<span class="pi-added">' + count + '</span>' : '') + '</span>' +
        '<span class="pi-body"><span class="pi-brand">' + esc(p.brand || '—') + '</span><span class="pi-name">' + esc(p.name) + '</span>' +
        '<span class="pi-foot"><span class="pi-price">' + money(p.price) + (p.fractional ? '<small> /' + esc(p.unit) + '</small>' : '') + '</span>' +
        '<span class="pi-stock ' + st[0] + '">' + esc(st[1]) + '</span></span></span></button>';
    }).join('');
    grid.innerHTML = html;
  }
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pid]');
    if (!b) return;
    var p = state.catalog.find(function (x) { return x.id === Number(b.getAttribute('data-pid')); });
    if (p) choose(p);
  });

  var searchTimer;
  search.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.q = search.value; renderGrid(); }, 60);
  });
  // Lector de código de barras (actúa como teclado + Enter) o búsqueda exacta
  search.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var code = search.value.trim().toLowerCase();
    if (!code) return;
    var hit = state.byCode[code];
    if (hit) {
      if (hit.variant) addLine(hit.product, hit.variant, '1');
      else choose(hit.product);
      search.value = ''; state.q = ''; renderGrid();
      return;
    }
    var list = filtered();
    if (list.length === 1) { choose(list[0]); search.value = ''; state.q = ''; renderGrid(); return; }
    J.toast(list.length ? 'Varias coincidencias: seleccione el producto.' : 'Código no encontrado: «' + search.value + '».', list.length ? 'info' : 'warning');
  });
  root.querySelector('[data-chips]').addEventListener('click', function (e) {
    var c = e.target.closest('[data-cat]');
    if (!c) return;
    state.cat = c.getAttribute('data-cat');
    root.querySelectorAll('[data-chips] .chip').forEach(function (x) { x.classList.toggle('is-active', x === c); });
    renderGrid();
  });

  /* ---------------- Selección de presentación / cantidad ---------------- */
  var optModal = doc.getElementById('options-modal');
  var optProduct = null;
  function choose(p) {
    if (!p.fractional && !p.variants.length) { addLine(p, null, '1'); return; }
    optProduct = p;
    optModal.querySelector('[data-opt-title]').textContent = p.name;
    optModal.querySelector('[data-opt-sub]').textContent = (p.brand ? p.brand + ' · ' : '') + 'Disponible: ' + fmtQty(p.available, p.unit);
    var vbox = optModal.querySelector('[data-opt-variants]');
    vbox.innerHTML = p.variants.length ? '<div class="label">Presentaciones</div>' + p.variants.map(function (v) {
      return '<button type="button" class="method" style="flex-direction:row;align-items:center;justify-content:space-between;width:100%" data-vid="' + v.id + '">' +
        '<span>' + esc(v.name) + '<br><small class="muted" style="font-weight:500">Consume ' + fmtQty(v.base_qty, p.unit) + '</small></span><strong>' + money(v.price) + '</strong></button>';
    }).join('') : '';
    var fr = optModal.querySelector('[data-opt-fraction]');
    fr.classList.toggle('hidden', !p.fractional && !!p.variants.length);
    optModal.querySelector('[data-opt-fraction-label]').textContent = p.fractional ? 'Cantidad a granel (' + p.unit + ') · ' + money(p.price) + ' por ' + p.unit : 'Cantidad';
    optModal.querySelector('[data-opt-unit]').textContent = p.fractional ? p.unit : 'und';
    var qtyInput = optModal.querySelector('[data-opt-qty]');
    qtyInput.value = '';
    var quick = p.unit === 'g' || p.unit === 'kg' ? [50, 100, 250, 500] : [5, 10, 30, 35, 50, 100];
    optModal.querySelector('[data-opt-quick]').innerHTML = p.fractional ? quick.map(function (q) { return '<button type="button" class="btn btn-sm" data-q="' + q + '">' + q + ' ' + esc(p.unit) + '</button>'; }).join('') : '';
    calcOpt();
    J.openDialog(optModal);
    setTimeout(function () { (p.fractional ? qtyInput : optModal.querySelector('[data-vid]') || qtyInput).focus(); }, 40);
  }
  function calcOpt() {
    var p = optProduct; if (!p) return;
    var q = n(optModal.querySelector('[data-opt-qty]').value);
    optModal.querySelector('[data-opt-calc]').textContent = q > 0 ? fmtQty(q, p.unit) + ' × ' + money(p.price) + ' = ' + money(round2(q * n(p.price))) : '';
  }
  optModal.addEventListener('input', calcOpt);
  optModal.addEventListener('click', function (e) {
    var v = e.target.closest('[data-vid]');
    if (v) {
      var variant = optProduct.variants.find(function (x) { return x.id === Number(v.getAttribute('data-vid')); });
      addLine(optProduct, variant, '1'); J.closeDialog(optModal); return;
    }
    var q = e.target.closest('[data-q]');
    if (q) { optModal.querySelector('[data-opt-qty]').value = q.getAttribute('data-q'); calcOpt(); addFromOpt(); return; }
    if (e.target.closest('[data-opt-add]')) addFromOpt();
  });
  optModal.querySelector('[data-opt-qty]').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addFromOpt(); } });
  function addFromOpt() {
    var raw = optModal.querySelector('[data-opt-qty]').value.replace(',', '.');
    var err = validQty(raw, optProduct.fractional ? optProduct.precision : 0);
    if (err) { J.toast(err, 'warning'); return; }
    addLine(optProduct, null, raw);
    J.closeDialog(optModal);
  }
  function validQty(raw, precision) {
    if (!/^\d+(\.\d+)?$/.test(raw) || n(raw) <= 0) return 'Escriba una cantidad mayor que cero.';
    var dec = (raw.split('.')[1] || '').replace(/0+$/, '').length;
    if (dec > precision) return precision === 0 ? 'Este producto se vende por unidades completas.' : 'Use como máximo ' + precision + ' decimal(es).';
    return null;
  }

  /* ---------------- Carrito ---------------- */
  var linesEl = root.querySelector('[data-lines]');
  function lineKey(p, v) { return p.id + ':' + (v ? v.id : 'b'); }
  function addLine(p, v, qty) {
    var key = lineKey(p, v);
    var existing = state.lines.findIndex(function (l) { return l.key === key && !l.discount; });
    if (existing >= 0) {
      var l = state.lines[existing];
      l.qty = String(round3(n(l.qty) + n(qty)));
      state.selected = existing;
    } else {
      state.lines.push({ key: key, product: p, variant: v, qty: String(qty), discount: null });
      state.selected = state.lines.length - 1;
    }
    if (n(p.available) <= 0) J.toast('Atención: «' + p.name + '» figura sin existencias en esta sucursal.', 'warning');
    if (search.value) { search.value = ''; state.q = ''; }
    changed();
    if (window.matchMedia('(min-width: 961px)').matches) setTimeout(function () { if (!doc.querySelector('dialog[open]')) search.focus(); }, 30);
  }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function linePrice(l) { return l.variant ? n(l.variant.price) : n(l.product.price); }
  function lineGross(l) { return round2(n(l.qty) * linePrice(l)); }
  function lineDiscount(l) {
    if (!l.discount) return 0;
    var g = lineGross(l), v = n(l.discount.value);
    var a = l.discount.type === 'percent' ? round2(g * v / 100) : l.discount.type === 'amount' ? v : round2(g - n(l.qty) * v);
    return Math.max(0, Math.min(g, a));
  }
  function precisionOf(l) { return l.variant ? 0 : (l.product.fractional ? l.product.precision : 0); }
  function unitOf(l) { return l.variant ? 'und' : l.product.unit; }

  function renderCart() {
    var count = state.lines.length;
    if (!count) {
      linesEl.innerHTML = '<div class="cart-empty"><svg class="illus" viewBox="0 0 120 120" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="60" r="52" fill="var(--gold-soft)"/><g stroke="var(--gold-strong)" stroke-width="1.6"><path d="M30 38h8l8 38h34l7-26H42"/><circle cx="50" cy="86" r="4"/><circle cx="76" cy="86" r="4"/></g></svg>' +
        '<strong style="color:var(--text)">Carrito vacío</strong><span style="font-size:13px">Toque un producto o escanee su código de barras.</span></div>';
    } else {
      linesEl.innerHTML = state.lines.map(function (l, i) {
        var p = l.product, g = lineGross(l), d = lineDiscount(l), total = round2(g - d);
        var q = state.quote && state.quote.lines[i];
        var media = p.thumb ? '<img class="thumb" src="' + esc(p.thumb) + '" alt="">' : '<span class="thumb" style="display:grid;place-items:center;color:var(--faint)">' + icon('bottle', 'icon-sm') + '</span>';
        var sub = (l.variant ? esc(l.variant.name) + ' · ' : '') + money(linePrice(l)) + (l.variant ? '' : ' / ' + esc(unitOf(l)));
        var discTag = '';
        if (l.discount) {
          var pctv = g > 0 ? (d / g * 100) : 0;
          discTag = '<span class="badge ' + (l.discount.approval_id ? 'badge-success' : (q && q.requires_approval ? 'badge-warning' : 'badge-gold')) + ' no-dot">−' + pctv.toFixed(1).replace('.', ',') + ' %' + (l.discount.approval_id ? ' autorizado' : '') + '</span>';
        }
        var warn = '';
        if (q && q.requires_approval && !l.discount.approval_id) warn = '<div class="text-warning" style="font-size:11.5px;margin-top:4px">' + icon('lock', 'icon-sm') + ' Requiere autorización</div>';
        else if (q && q.below_margin) warn = '<div class="text-warning" style="font-size:11.5px;margin-top:4px">' + icon('alert', 'icon-sm') + ' Margen bajo el mínimo</div>';
        var stock = state.quote && state.quote.stock && state.quote.stock[p.id];
        if (stock && !stock.ok) warn += '<div class="text-danger" style="font-size:11.5px;margin-top:4px">' + icon('alert', 'icon-sm') + ' Disponible: ' + fmtQty(stock.available, p.unit) + '</div>';
        return '<div class="cart-line' + (i === state.selected ? ' is-selected' : '') + '" data-i="' + i + '">' + media +
          '<div style="min-width:0"><div class="cl-name">' + esc(p.name) + '</div><div class="cl-sub">' + sub + '</div>' +
          '<div class="cl-controls"><span class="qty-box"><button type="button" data-dec aria-label="Disminuir">' + icon('minus', 'icon-sm') + '</button>' +
          '<input data-qty value="' + esc(l.qty) + '" inputmode="decimal" aria-label="Cantidad de ' + esc(p.name) + '"><span class="unit">' + esc(unitOf(l)) + '</span>' +
          '<button type="button" data-inc aria-label="Aumentar">' + icon('plus', 'icon-sm') + '</button></span>' +
          '<button type="button" class="link-btn" data-disc>' + icon('percent', 'icon-sm') + (l.discount ? 'Editar' : 'Descuento') + '</button>' +
          discTag + '</div>' + warn + '</div>' +
          '<div class="cl-right"><span class="cl-total">' + money(total) + '</span>' + (d > 0 ? '<span class="cl-list">' + money(g) + '</span>' : '') +
          '<button type="button" class="link-btn danger" data-remove aria-label="Quitar ' + esc(p.name) + '">' + icon('trash', 'icon-sm') + '</button></div></div>';
      }).join('');
    }
    var subtotal = 0, discounts = 0;
    state.lines.forEach(function (l) { subtotal += lineGross(l); discounts += lineDiscount(l); });
    var total = round2(subtotal - discounts);
    root.querySelector('[data-subtotal]').textContent = money(subtotal);
    root.querySelector('[data-discounts]').textContent = discounts ? '− ' + money(discounts) : money(0);
    root.querySelector('[data-total]').textContent = money(total);
    root.querySelector('[data-total-mobile]').textContent = money(total);
    root.querySelector('[data-count]').textContent = count;
    root.querySelector('[data-checkout]').disabled = !count || !cfg.session;
    root.querySelector('[data-margin-warning]').classList.toggle('hidden', !(state.quote && state.quote.below_margin));
    var sel = linesEl.querySelector('.is-selected');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  var quoteTimer, quoteSeq = 0;
  function changed() {
    state.quote = null;
    state.requestId = null; // el carrito cambió: nueva operación
    persist();
    renderCart();
    renderGrid();
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshQuote, 350);
  }
  function payloadItems() {
    return state.lines.map(function (l) {
      return {
        product_id: l.product.id, variant_id: l.variant ? l.variant.id : null, quantity: l.qty,
        discount: l.discount ? { type: l.discount.type, value: l.discount.value, reason: l.discount.reason || '', approval_id: l.discount.approval_id || null } : null
      };
    });
  }
  function refreshQuote() {
    if (!state.lines.length) return Promise.resolve(null);
    var seq = ++quoteSeq;
    return J.api('/api/pos/quote', { body: { items: payloadItems() } }).then(function (q) {
      if (seq !== quoteSeq) return null;
      state.quote = q;
      renderCart();
      return q;
    }).catch(function (e) { if (seq === quoteSeq) J.toast(e.message, 'error'); throw e; });
  }

  linesEl.addEventListener('click', function (e) {
    var row = e.target.closest('[data-i]');
    if (!row) return;
    var i = Number(row.getAttribute('data-i')), l = state.lines[i];
    state.selected = i;
    if (e.target.closest('[data-inc]')) { step(i, 1); return; }
    if (e.target.closest('[data-dec]')) { step(i, -1); return; }
    if (e.target.closest('[data-remove]')) { removeLine(i); return; }
    if (e.target.closest('[data-disc]')) { openDiscount(i); return; }
    if (!e.target.closest('input')) renderCart();
    return l;
  });
  linesEl.addEventListener('change', function (e) {
    if (!e.target.matches('[data-qty]')) return;
    var i = Number(e.target.closest('[data-i]').getAttribute('data-i')), l = state.lines[i];
    var raw = e.target.value.trim().replace(',', '.');
    var err = validQty(raw, precisionOf(l));
    if (err) { J.toast(err, 'warning'); e.target.value = l.qty; return; }
    l.qty = raw;
    changed();
  });
  linesEl.addEventListener('keydown', function (e) {
    if (e.target.matches('[data-qty]') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); search.focus(); }
  });
  function step(i, dir) {
    var l = state.lines[i];
    var s = l.product.fractional && !l.variant ? (l.product.unit === 'g' ? 10 : 5) : 1;
    var next = round3(n(l.qty) + dir * s);
    if (next <= 0) { removeLine(i); return; }
    l.qty = String(next);
    changed();
  }
  function removeLine(i) {
    state.lines.splice(i, 1);
    state.selected = Math.min(state.selected, state.lines.length - 1);
    changed();
  }
  root.querySelector('[data-clear]').addEventListener('click', function () {
    if (!state.lines.length) return;
    J.confirm({ title: '¿Vaciar el carrito?', text: 'Se quitarán todos los productos de esta venta.', ok: 'Vaciar', danger: true }).then(function (ok) {
      if (ok === false) return;
      state.lines = []; state.selected = -1; state.customer = null; renderCustomer(); changed();
    });
  });

  /* ---------------- Descuentos ---------------- */
  var dModal = doc.getElementById('discount-modal');
  var dForm = dModal.querySelector('[data-discount-form]');
  var dIndex = -1;
  function dType() { return dForm.querySelector('input[name=dtype]:checked').value; }
  function openDiscount(i) {
    dIndex = i;
    var l = state.lines[i];
    dModal.querySelector('[data-disc-product]').textContent = l.product.name + (l.variant ? ' · ' + l.variant.name : '') + ' — ' + fmtQty(l.qty, unitOf(l));
    var t = l.discount ? l.discount.type : 'percent';
    dForm.querySelector('input[name=dtype][value="' + t + '"]').checked = true;
    dForm.querySelector('[data-disc-value]').value = l.discount ? l.discount.value : '';
    dForm.querySelector('[data-disc-reason]').value = l.discount ? (l.discount.reason || '') : '';
    var lim = state.quote && state.quote.lines[i] ? state.quote.lines[i].limit : cfg.discount_limit;
    dForm.querySelector('[data-disc-limit]').textContent = String(n(lim)).replace('.', ',') + ' %';
    dForm.dataset.limit = n(lim);
    dForm.querySelector('[data-disc-remove]').classList.toggle('hidden', !l.discount);
    calcDiscount();
    J.openDialog(dModal);
    setTimeout(function () { dForm.querySelector('[data-disc-value]').select(); }, 40);
  }
  function calcDiscount() {
    var l = state.lines[dIndex]; if (!l) return;
    var t = dType(), v = n(dForm.querySelector('[data-disc-value]').value);
    var labels = { percent: ['Porcentaje de descuento', '%'], amount: ['Valor a descontar de la línea', '$'], final_price: ['Precio final por ' + (l.variant ? 'unidad' : unitOf(l)), '$'] };
    dForm.querySelector('[data-disc-label]').textContent = labels[t][0];
    dForm.querySelector('[data-disc-addon]').textContent = labels[t][1];
    var g = lineGross(l);
    var a = t === 'percent' ? round2(g * v / 100) : t === 'amount' ? v : round2(g - n(l.qty) * v);
    var valid = v > 0 && a >= 0 && a <= g && (t !== 'percent' || v <= 100);
    var pctv = g > 0 ? a / g * 100 : 0;
    dForm.querySelector('[data-disc-gross]').textContent = money(g);
    dForm.querySelector('[data-disc-amount]').textContent = valid ? '− ' + money(a) + ' (' + pctv.toFixed(2).replace('.', ',') + ' %)' : '—';
    dForm.querySelector('[data-disc-final]').textContent = valid ? money(g - a) : '—';
    var over = valid && pctv > n(dForm.dataset.limit) + 0.0001;
    var approved = l.discount && l.discount.approval_id && l.discount.approved_pct && pctv <= n(l.discount.approved_pct) + 0.01;
    dForm.querySelector('[data-disc-warning]').classList.toggle('hidden', !over || approved);
    var ap = dForm.querySelector('[data-disc-approved]');
    ap.classList.toggle('hidden', !approved);
    if (approved) ap.querySelector('span').textContent = 'Autorizado hasta ' + String(l.discount.approved_pct).replace('.', ',') + ' % por ' + (l.discount.approved_by || 'supervisor') + '.';
    var btn = dForm.querySelector('[data-disc-apply]');
    btn.disabled = !valid;
    btn.textContent = over && !approved ? 'Solicitar autorización' : 'Aplicar';
    return { valid: valid, over: over && !approved, pct: pctv, type: t, value: dForm.querySelector('[data-disc-value]').value.replace(',', '.'), gross: g };
  }
  dForm.addEventListener('input', calcDiscount);
  dForm.addEventListener('change', calcDiscount);
  dForm.querySelector('[data-disc-remove]').addEventListener('click', function () {
    state.lines[dIndex].discount = null; J.closeDialog(dModal); changed();
  });
  dForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = calcDiscount();
    if (!r.valid) return;
    var l = state.lines[dIndex];
    var reason = dForm.querySelector('[data-disc-reason]').value.trim();
    var keepApproval = l.discount && l.discount.approval_id && !r.over ? { approval_id: l.discount.approval_id, approved_pct: l.discount.approved_pct, approved_by: l.discount.approved_by } : {};
    l.discount = Object.assign({ type: r.type, value: r.value, reason: reason }, keepApproval);
    J.closeDialog(dModal);
    if (r.over) { requestApproval(dIndex, r); } else { changed(); }
  });

  /* ---------------- Autorizaciones ---------------- */
  var aModal = doc.getElementById('approval-modal');
  var poll = null, pending = null;
  function requestApproval(i, r) {
    var l = state.lines[i];
    J.api('/api/pos/approval', { body: { product_id: l.product.id, base_amount: String(r.gross), percent: r.pct.toFixed(4), reason: l.discount.reason || '' } })
      .then(function (d) {
        pending = { index: i, key: l.key, id: d.approval.id, pct: r.pct };
        aModal.querySelector('[data-appr-text]').textContent = 'Descuento de ' + r.pct.toFixed(2).replace('.', ',') + ' % sobre ' + l.product.name + ' (su límite es ' + String(n(cfg.discount_limit)).replace('.', ',') + ' %).';
        aModal.querySelector('[data-appr-form]').reset();
        J.openDialog(aModal);
        clearInterval(poll);
        poll = setInterval(checkApproval, 3000);
        changed();
      }).catch(function (e) { J.toast(e.message, 'error'); });
  }
  function applyApproval(a) {
    clearInterval(poll);
    var l = state.lines.find(function (x) { return x.key === pending.key; });
    if (l && l.discount) {
      l.discount.approval_id = a.id; l.discount.approved_pct = a.percent; l.discount.approved_by = a.decider;
      J.toast('Descuento autorizado por ' + (a.decider || 'supervisor') + '.', 'success');
    }
    pending = null;
    J.closeDialog(aModal);
    changed();
  }
  function checkApproval() {
    if (!pending) return;
    J.api('/api/pos/approval/' + pending.id).then(function (d) {
      var a = d.approval;
      if (a.status === 'approved') applyApproval(a);
      else if (a.status === 'rejected' || a.status === 'expired') {
        clearInterval(poll);
        J.toast(a.status === 'rejected' ? 'El supervisor rechazó el descuento.' + (a.notes ? ' ' + a.notes : '') : 'La solicitud venció.', 'error');
        var l = state.lines.find(function (x) { return pending && x.key === pending.key; });
        if (l) l.discount = null;
        pending = null; J.closeDialog(aModal); changed();
      }
    }).catch(function () { /* reintenta */ });
  }
  aModal.querySelector('[data-appr-form]').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pending) return;
    var f = e.target, btn = f.querySelector('button');
    btn.classList.add('is-loading');
    J.api('/api/pos/approval/' + pending.id + '/authorize', { body: { username: f.username.value, password: f.password.value } })
      .then(function (d) { f.reset(); applyApproval(d.approval); })
      .catch(function (err) { J.toast(err.message, 'error'); f.password.value = ''; })
      .finally(function () { btn.classList.remove('is-loading'); });
  });
  aModal.querySelector('[data-appr-cancel]').addEventListener('click', function () {
    clearInterval(poll);
    var l = pending && state.lines.find(function (x) { return x.key === pending.key; });
    if (l) l.discount = null;
    pending = null; J.closeDialog(aModal); changed();
  });

  /* ---------------- Clientes ---------------- */
  var cModal = doc.getElementById('customer-modal');
  function renderCustomer() {
    var c = state.customer;
    var pick = root.querySelector('[data-customer-open]');
    pick.classList.toggle('has-customer', !!c);
    root.querySelector('[data-customer-name]').textContent = c ? c.full_name : 'Cliente general';
    root.querySelector('[data-customer-sub]').textContent = c ? [c.document_number, c.phone].filter(Boolean).join(' · ') || 'Cliente asociado' : 'Asociar cliente (F4)';
    var av = root.querySelector('[data-customer-avatar]');
    if (c) { av.removeAttribute('style'); av.textContent = c.full_name.split(/\s+/).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join(''); }
    else { av.setAttribute('style', 'background:var(--surface-3);color:var(--muted);border-color:var(--line)'); av.innerHTML = icon('user-plus', 'icon-sm'); }
    persist();
  }
  function openCustomers() {
    if (!cfg.can_search_customers) { J.toast('No tiene permiso para consultar clientes.', 'warning'); return; }
    J.openDialog(cModal);
    var s = cModal.querySelector('[data-cust-search]');
    s.value = ''; searchCustomers('');
    setTimeout(function () { s.focus(); }, 40);
  }
  root.querySelector('[data-customer-open]').addEventListener('click', openCustomers);
  var custTimer;
  cModal.querySelector('[data-cust-search]').addEventListener('input', function (e) {
    clearTimeout(custTimer);
    custTimer = setTimeout(function () { searchCustomers(e.target.value); }, 200);
  });
  function searchCustomers(q) {
    J.api('/api/customers/search?q=' + encodeURIComponent(q)).then(function (d) {
      var box = cModal.querySelector('[data-cust-results]');
      box.innerHTML = d.items.length ? d.items.map(function (c) {
        return '<button type="button" class="customer-pick has-customer" data-cid="' + c.id + '"><span class="avatar">' + esc(c.full_name.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase()) + '</span>' +
          '<span class="meta"><strong>' + esc(c.full_name) + '</strong><small>' + esc([c.document_number, c.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto') + '</small></span>' +
          '<small class="muted">' + esc(c.purchases ? c.purchases + ' compras' : 'Nuevo') + '</small></button>';
      }).join('') : '<p class="muted" style="font-size:13px">' + (q ? 'Sin coincidencias. Puede registrarlo abajo.' : 'Escriba para buscar.') + '</p>';
      box.querySelectorAll('[data-cid]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.customer = d.items.find(function (c) { return c.id === Number(b.getAttribute('data-cid')); });
          renderCustomer(); J.closeDialog(cModal); search.focus();
        });
      });
    }).catch(function (e) { J.toast(e.message, 'error'); });
  }
  var custForm = cModal.querySelector('[data-cust-form]');
  if (custForm) custForm.addEventListener('submit', function (e) {
    e.preventDefault();
    J.api('/api/customers', { body: new FormData(custForm) }).then(function (d) {
      state.customer = d.customer; renderCustomer(); custForm.reset(); J.closeDialog(cModal);
      J.toast('Cliente registrado y asociado.', 'success');
    }).catch(function (err) { J.toast(err.message, 'error'); });
  });
  cModal.querySelector('[data-cust-clear]').addEventListener('click', function () { state.customer = null; renderCustomer(); J.closeDialog(cModal); });

  /* ---------------- Cobro ---------------- */
  var coModal = doc.getElementById('checkout-modal');
  var methodIcons = { cash: 'banknote', bank_transfer: 'bank', wallet: 'phone', card: 'card', other: 'wallet' };
  function total() { return state.quote ? n(state.quote.total) : 0; }
  function openCheckout() {
    if (!state.lines.length || state.busy) return;
    if (!cfg.session) { J.toast('Abra su caja antes de cobrar.', 'warning'); return; }
    var btn = root.querySelector('[data-checkout]');
    btn.classList.add('is-loading');
    refreshQuote().then(function (q) {
      if (!q) return;
      if (!q.stock_ok) { J.toast('Hay productos sin existencias suficientes. Revise el carrito.', 'error'); return; }
      if (q.requires_approval) { J.toast('Hay descuentos pendientes de autorización.', 'warning'); return; }
      if (!state.requestId) state.requestId = uuid();
      var cash = cfg.methods.find(function (m) { return m.type === 'cash'; }) || cfg.methods[0];
      state.payments = [{ method: cash, amount: '', reference: '' }];
      coModal.querySelector('[data-co-total]').textContent = money(q.total);
      coModal.querySelector('[data-co-subtotal]').textContent = money(q.subtotal);
      coModal.querySelector('[data-co-discounts]').textContent = n(q.discount_total) ? '− ' + money(q.discount_total) : money(0);
      coModal.querySelector('[data-co-items]').textContent = state.lines.length;
      coModal.querySelector('[data-co-customer]').textContent = state.customer ? state.customer.full_name : 'General';
      coModal.querySelector('[data-co-error]').classList.add('hidden');
      renderPayments();
      J.openDialog(coModal);
      setTimeout(function () { var a = coModal.querySelector('[data-amount]'); if (a) a.focus(); }, 60);
    }).catch(function () { /* mensaje ya mostrado */ }).finally(function () { btn.classList.remove('is-loading'); });
  }
  root.querySelector('[data-checkout]').addEventListener('click', openCheckout);

  function renderPayments() {
    var methodsEl = coModal.querySelector('[data-co-methods]');
    var used = state.payments.map(function (p) { return p.method.id; });
    methodsEl.innerHTML = cfg.methods.map(function (m) {
      return '<button type="button" class="method' + (used.indexOf(m.id) >= 0 ? ' is-active' : '') + '" data-mid="' + m.id + '">' + icon(methodIcons[m.type] || 'wallet') + '<span>' + esc(m.name) + '</span></button>';
    }).join('');
    var rows = coModal.querySelector('[data-co-rows]');
    rows.innerHTML = state.payments.map(function (p, i) {
      var isCash = p.method.type === 'cash';
      return '<div class="pay-row" data-row="' + i + '"><span class="pr-name">' + icon(methodIcons[p.method.type] || 'wallet', 'icon-sm') + esc(p.method.name) + '</span>' +
        '<input class="input amount-input" data-amount inputmode="decimal" placeholder="' + (isCash ? 'Recibido' : 'Valor') + '" value="' + esc(p.amount) + '" aria-label="Valor con ' + esc(p.method.name) + '">' +
        (p.method.requires_reference || !isCash ? '<input class="input" data-ref placeholder="Referencia' + (p.method.requires_reference ? ' (obligatoria)' : '') + '" value="' + esc(p.reference) + '" maxlength="80" aria-label="Referencia">' : '<span class="muted" style="font-size:12px">Entregue el cambio indicado</span>') +
        (state.payments.length > 1 ? '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-del aria-label="Quitar medio">' + icon('x', 'icon-sm') + '</button>' : '<span></span>') + '</div>';
    }).join('');
    var t = total();
    var cashRow = state.payments.some(function (p) { return p.method.type === 'cash'; });
    var quick = [];
    if (cashRow) {
      quick.push(['Exacto', t]);
      [10000, 20000, 50000, 100000].forEach(function (b) { var v = Math.ceil(t / b) * b; if (v > t && quick.every(function (x) { return x[1] !== v; })) quick.push([money(v), v]); });
    }
    coModal.querySelector('[data-co-quick]').innerHTML = quick.slice(0, 5).map(function (q) { return '<button type="button" class="btn btn-sm" data-quick="' + q[1] + '">' + esc(q[0]) + '</button>'; }).join('');
    updateChange();
  }
  function updateChange() {
    var t = total(), paid = 0, nonCash = 0;
    state.payments.forEach(function (p) { var a = n(p.amount); paid += a; if (p.method.type !== 'cash') nonCash += a; });
    var diff = round2(paid - t);
    var box = coModal.querySelector('[data-co-change-box]');
    var short = diff < 0;
    box.classList.toggle('is-short', short);
    coModal.querySelector('[data-co-change-label]').textContent = short ? 'Falta por pagar' : 'Cambio a entregar';
    coModal.querySelector('[data-co-change]').textContent = money(Math.abs(diff));
    var refsOk = state.payments.every(function (p) { return !p.method.requires_reference || p.reference.trim().length >= 3; });
    var ok = !short && nonCash <= t + 0.001 && refsOk && paid > 0;
    var err = '';
    if (nonCash > t + 0.001) err = 'Los pagos electrónicos no pueden superar el total.';
    else if (!refsOk) err = 'Escriba la referencia del pago electrónico.';
    else if (diff > 0 && !state.payments.some(function (p) { return p.method.type === 'cash'; })) { err = 'Solo el efectivo admite cambio.'; ok = false; }
    var errEl = coModal.querySelector('[data-co-error]');
    errEl.classList.toggle('hidden', !err || paid === 0);
    errEl.querySelector('span').textContent = err;
    coModal.querySelector('[data-co-confirm]').disabled = !ok || state.busy;
  }
  coModal.addEventListener('input', function (e) {
    var row = e.target.closest('[data-row]');
    if (!row) return;
    var p = state.payments[Number(row.getAttribute('data-row'))];
    if (e.target.matches('[data-amount]')) p.amount = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
    if (e.target.matches('[data-ref]')) p.reference = e.target.value;
    updateChange();
  });
  coModal.addEventListener('click', function (e) {
    var m = e.target.closest('[data-mid]');
    if (m) {
      var method = cfg.methods.find(function (x) { return x.id === Number(m.getAttribute('data-mid')); });
      var idx = state.payments.findIndex(function (p) { return p.method.id === method.id; });
      if (idx >= 0) { if (state.payments.length > 1) state.payments.splice(idx, 1); }
      else if (cfg.mixed_payments && state.payments.some(function (p) { return n(p.amount) > 0; })) {
        var paid = state.payments.reduce(function (a, p) { return a + n(p.amount); }, 0);
        state.payments.push({ method: method, amount: String(Math.max(0, round2(total() - paid)) || ''), reference: '' });
      } else {
        state.payments = [{ method: method, amount: method.type === 'cash' ? '' : String(total()), reference: '' }];
      }
      renderPayments();
      var inputs = coModal.querySelectorAll('[data-amount]');
      var last = state.payments[state.payments.length - 1];
      var focusEl = last.method.requires_reference ? coModal.querySelectorAll('[data-ref]')[coModal.querySelectorAll('[data-ref]').length - 1] : inputs[inputs.length - 1];
      if (focusEl) focusEl.focus();
      return;
    }
    var q = e.target.closest('[data-quick]');
    if (q) {
      var cashIdx = state.payments.findIndex(function (p) { return p.method.type === 'cash'; });
      var others = state.payments.reduce(function (a, p, i) { return i === cashIdx ? a : a + n(p.amount); }, 0);
      var v = Number(q.getAttribute('data-quick'));
      state.payments[cashIdx].amount = String(q.textContent === 'Exacto' ? round2(total() - others) : v);
      renderPayments();
      return;
    }
    var del = e.target.closest('[data-del]');
    if (del) { state.payments.splice(Number(del.closest('[data-row]').getAttribute('data-row')), 1); renderPayments(); return; }
    if (e.target.closest('[data-co-confirm]')) confirmSale();
  });
  coModal.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.target.matches('button')) { e.preventDefault(); if (!coModal.querySelector('[data-co-confirm]').disabled) confirmSale(); }
  });

  function confirmSale() {
    if (state.busy) return; // protección contra doble clic
    state.busy = true;
    var btn = coModal.querySelector('[data-co-confirm]');
    btn.disabled = true; btn.classList.add('is-loading');
    var body = {
      client_request_id: state.requestId,
      customer_id: state.customer ? state.customer.id : null,
      items: payloadItems(),
      payments: state.payments.filter(function (p) { return n(p.amount) > 0; }).map(function (p) { return { method_id: p.method.id, amount: p.amount, reference: p.reference }; })
    };
    J.api('/api/pos/sale', { body: body }).then(function (d) {
      J.closeDialog(coModal);
      var s = d.sale;
      var ok = doc.getElementById('success-modal');
      ok.querySelector('[data-ok-number]').textContent = 'Comprobante ' + s.number + (s.duplicate ? ' (ya registrado)' : '');
      ok.querySelector('[data-ok-total]').textContent = money(s.total);
      ok.querySelector('[data-ok-change]').textContent = money(s.change);
      ok.dataset.receipt = d.receipt_url;
      state.lines = []; state.selected = -1; state.customer = null; state.quote = null; state.requestId = null;
      try { localStorage.removeItem(cfg.storage_key); } catch (err) { /* */ }
      renderCustomer(); renderCart();
      setTimeout(function () { J.openDialog(ok); }, 160);
      loadCatalog();
    }).catch(function (e) {
      var errEl = coModal.querySelector('[data-co-error]');
      errEl.classList.remove('hidden');
      errEl.querySelector('span').textContent = e.message;
      if (e.status === 0) errEl.querySelector('span').textContent += ' Puede reintentar: la venta no se duplicará.';
      else state.requestId = null;
      if (e.data && e.data.errors && e.data.errors.stock) loadCatalog();
    }).finally(function () {
      state.busy = false; btn.classList.remove('is-loading'); updateChange();
    });
  }

  var okModal = doc.getElementById('success-modal');
  okModal.querySelector('[data-ok-new]').addEventListener('click', function () { J.closeDialog(okModal); setTimeout(function () { search.focus(); }, 160); });
  okModal.querySelector('[data-ok-print]').addEventListener('click', function () {
    var frame = doc.querySelector('[data-print-frame]');
    frame.onload = function () { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { window.open(okModal.dataset.receipt, '_blank'); } };
    frame.src = okModal.dataset.receipt + '?print=1';
  });

  /* ---------------- Carrito móvil ---------------- */
  root.querySelector('[data-cart-toggle]').addEventListener('click', function () { root.classList.add('is-cart-open'); });
  root.querySelector('[data-cart-close]').addEventListener('click', function () { root.classList.remove('is-cart-open'); });

  /* ---------------- Persistencia del carrito ---------------- */
  function persist() {
    try {
      localStorage.setItem(cfg.storage_key, JSON.stringify({
        lines: state.lines.map(function (l) { return { pid: l.product.id, vid: l.variant ? l.variant.id : null, qty: l.qty, discount: l.discount }; }),
        customer: state.customer
      }));
    } catch (e) { /* */ }
  }
  function restore() {
    try {
      var saved = JSON.parse(localStorage.getItem(cfg.storage_key) || 'null');
      if (!saved) return;
      saved.lines.forEach(function (s) {
        var p = state.catalog.find(function (x) { return x.id === s.pid; });
        if (!p) return;
        var v = s.vid ? p.variants.find(function (x) { return x.id === s.vid; }) : null;
        if (s.vid && !v) return;
        state.lines.push({ key: lineKey(p, v), product: p, variant: v, qty: s.qty, discount: s.discount });
      });
      state.customer = saved.customer || null;
      renderCustomer();
      if (state.lines.length) { J.toast('Se recuperó el carrito en curso.', 'info'); changed(); }
    } catch (e) { /* */ }
  }

  /* ---------------- Atajos de teclado ---------------- */
  doc.addEventListener('keydown', function (e) {
    var dialogOpen = doc.querySelector('dialog[open]');
    if (e.key === 'F2') { e.preventDefault(); if (!dialogOpen) { search.focus(); search.select(); } return; }
    if (dialogOpen) return;
    var typing = e.target.matches('input, textarea, select') && e.target !== search;
    if (e.key === 'F4') { e.preventDefault(); openCustomers(); return; }
    if (e.key === 'F9' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); openCheckout(); return; }
    if (e.key === 'F8' && state.selected >= 0) { e.preventDefault(); openDiscount(state.selected); return; }
    if (typing || (e.target === search && search.value)) return;
    if (!state.lines.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      state.selected = Math.max(0, Math.min(state.lines.length - 1, state.selected + (e.key === 'ArrowDown' ? 1 : -1)));
      renderCart();
    } else if ((e.key === '+' || e.key === 'Add') && state.selected >= 0) { e.preventDefault(); step(state.selected, 1); }
    else if ((e.key === '-' || e.key === 'Subtract') && state.selected >= 0) { e.preventDefault(); step(state.selected, -1); }
    else if (e.key === 'Delete' && state.selected >= 0) { e.preventDefault(); removeLine(state.selected); }
  });
  window.addEventListener('beforeunload', persist);

  loadCatalog().then(restore);
  renderCart();
})();

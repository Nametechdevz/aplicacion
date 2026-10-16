/* Formulario de producto: unidades, forma de venta, margen en vivo, presentaciones y carga de imágenes. */
(function () {
  'use strict';
  var J = window.JSP;
  var form = document.querySelector('[data-product-form]');
  if (!form) return;
  var unitSel = form.querySelector('[data-unit]');
  var price = form.querySelector('[data-price]');
  var cost = form.querySelector('[data-cost]');
  var precision = form.querySelector('#qty_precision');
  var unitNames = { und: 'unidad', ml: 'mililitro', l: 'litro', g: 'gramo', kg: 'kilogramo' };

  function unit() { var o = unitSel.selectedOptions[0]; return { code: o.dataset.code, decimal: o.dataset.decimal === '1', max: Number(o.dataset.max) }; }
  function mode() { var r = form.querySelector('input[name=sale_mode]:checked'); return r ? r.value : 'unit'; }

  function sync() {
    var u = unit();
    var fractionalRadio = form.querySelector('input[name=sale_mode][value=fractional]');
    fractionalRadio.disabled = !u.decimal;
    if (!u.decimal && mode() === 'fractional') form.querySelector('input[name=sale_mode][value=unit]').checked = true;
    var m = mode();
    form.querySelectorAll('[data-precision-field]').forEach(function (f) { f.classList.toggle('hidden', m !== 'fractional'); });
    form.querySelectorAll('[data-container-field]').forEach(function (f) { f.classList.toggle('hidden', !u.decimal); });
    Array.prototype.forEach.call(precision.options, function (o) { o.disabled = Number(o.value) > u.max; });
    if (Number(precision.value) > u.max) precision.value = String(u.max);
    if (m === 'unit') precision.value = '0';
    document.querySelectorAll('[data-unit-label]').forEach(function (l) { l.textContent = u.code; });
    form.querySelectorAll('[data-per-unit]').forEach(function (l) { l.textContent = '(por ' + (unitNames[u.code] || u.code) + ')'; });
    var ex = form.querySelector('[data-unit-explainer] span');
    if (m === 'fractional') {
      ex.textContent = 'Venta fraccionada: el precio es por ' + unitNames[u.code] + '. Si la sucursal tiene 1.000 ' + u.code + ' y vende 35 ' + u.code + ', la existencia queda en 965 ' + u.code + '.';
    } else if (u.decimal) {
      ex.textContent = 'Se vende por unidades completas de ' + unitNames[u.code] + '. Use “Fraccionable” para vender cantidades con decimales.';
    } else {
      ex.textContent = 'Producto por unidad (frasco, tarro, caja). Las cantidades siempre son enteras.';
    }
    margin();
    preview();
  }

  function margin() {
    var p = Number(String(price.value).replace(',', '.')), c = Number(String(cost.value || 0).replace(',', '.'));
    var el = form.ownerDocument.querySelector('[data-margin]');
    if (!p) { el.textContent = '—'; el.className = 'kpi-value'; return; }
    var m = ((p - c) / p) * 100;
    el.textContent = m.toFixed(1).replace('.', ',') + ' %';
    el.style.color = m < 15 ? 'var(--danger)' : 'var(--success)';
  }

  function preview() {
    var b = form.querySelector('#brand_id');
    document.querySelector('[data-preview-brand]').textContent = b.value ? b.selectedOptions[0].textContent : 'Sin marca';
    document.querySelector('[data-preview-name]').textContent = form.querySelector('#name').value || 'Nombre del producto';
    var p = Number(String(price.value).replace(',', '.'));
    document.querySelector('[data-preview-price]').textContent = p ? J.money(p) + (mode() === 'fractional' ? ' / ' + unit().code : '') : '—';
    document.querySelector('[data-preview-mode]').textContent = mode() === 'fractional' ? 'Fraccionable' : 'Por unidad';
  }

  // Subcategorías dependientes
  var cat = form.querySelector('[data-category]'), sub = form.querySelector('[data-subcategory]');
  function syncSub() {
    Array.prototype.forEach.call(sub.options, function (o) {
      if (!o.value) return;
      var show = !cat.value || o.dataset.parent === cat.value;
      o.hidden = !show; o.disabled = !show;
    });
    if (sub.selectedOptions[0] && sub.selectedOptions[0].disabled) sub.value = '';
  }
  cat.addEventListener('change', syncSub);
  syncSub();

  // Presentaciones
  var tbody = form.querySelector('[data-variants] tbody');
  var tpl = document.getElementById('variant-row');
  function renumber() {
    tbody.querySelectorAll('tr').forEach(function (tr, i) {
      tr.querySelectorAll('[data-n]').forEach(function (inp) { inp.name = 'variants[' + i + '][' + inp.dataset.n + ']'; });
      tr.querySelectorAll('input[name^="variants["]').forEach(function (inp) { inp.name = inp.name.replace(/variants\[\d+\]/, 'variants[' + i + ']'); });
    });
    form.querySelector('[data-variants-empty]').classList.toggle('hidden', tbody.children.length > 0);
  }
  form.querySelector('[data-add-variant]').addEventListener('click', function () {
    tbody.appendChild(tpl.content.cloneNode(true));
    renumber(); sync();
    tbody.lastElementChild.querySelector('[data-n=name]').focus();
  });
  tbody.addEventListener('click', function (e) {
    var b = e.target.closest('[data-remove-variant]');
    if (b) { b.closest('tr').remove(); renumber(); }
  });

  form.addEventListener('change', sync);
  form.addEventListener('input', function (e) { if (e.target === price || e.target === cost) margin(); preview(); });
  sync();

  // Carga inmediata de imágenes en la galería
  document.querySelectorAll('[data-image-upload] input[type=file]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.files[0]) return;
      var f = input.form;
      var data = new FormData(f); // antes de modificar el contenido del formulario
      var label = f.querySelector('.dropzone');
      label.querySelectorAll(':scope > :not(input)').forEach(function (n) { n.remove(); });
      label.insertAdjacentHTML('afterbegin', '<span class="spinner"></span><span>Optimizando…</span>');
      J.api(f.getAttribute('action'), { body: data })
        .then(function () { J.toast('Imagen cargada y optimizada.', 'success'); setTimeout(function () { location.reload(); }, 400); })
        .catch(function (err) { J.toast(err.message, 'error'); setTimeout(function () { location.reload(); }, 1500); });
    });
  });
  // Arrastrar y soltar
  document.querySelectorAll('.dropzone').forEach(function (z) {
    var input = z.querySelector('input[type=file]');
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('is-over'); }); });
    z.addEventListener('drop', function (e) {
      if (!e.dataTransfer.files.length) return;
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
})();

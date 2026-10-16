/* Matriz de distribución: valida que no se supere lo disponible y sugiere reposición. */
(function () {
  var form = document.querySelector('[data-distribute]');
  if (!form) return;
  var J = window.JSP;
  function n(v) { return Number(String(v || '').replace(',', '.')) || 0; }
  function recalc() {
    var lines = 0, branches = {}, bad = false;
    form.querySelectorAll('[data-row]').forEach(function (row) {
      var avail = n(row.getAttribute('data-available')), used = 0;
      row.querySelectorAll('input[name^="qty"]').forEach(function (i) {
        var v = n(i.value);
        var dec = (String(i.value).split(/[.,]/)[1] || '').length;
        var invalid = i.value !== '' && (v < 0 || isNaN(Number(String(i.value).replace(',', '.'))) || dec > Number(row.getAttribute('data-precision')));
        i.classList.toggle('is-invalid', invalid);
        if (invalid) bad = true;
        if (v > 0) { used += v; lines++; branches[i.name.match(/qty\[(\d+)\]/)[1]] = true; }
      });
      var rem = Math.round((avail - used) * 1000) / 1000;
      var cell = row.querySelector('[data-remaining]');
      cell.textContent = J.qty(rem);
      cell.classList.toggle('is-negative', rem < 0);
      if (rem < 0) bad = true;
    });
    var nb = Object.keys(branches).length;
    form.querySelector('[data-summary]').textContent = lines ? lines + ' envío(s) a ' + nb + ' sucursal(es)' + (bad ? ' · revise las cantidades en rojo' : '') : 'Sin cantidades';
    form.querySelector('[data-submit]').disabled = !lines || bad;
  }
  form.addEventListener('input', function (e) {
    if (e.target.matches('[data-filter]')) {
      var q = e.target.value.toLowerCase();
      form.querySelectorAll('[data-row]').forEach(function (r) { r.style.display = r.getAttribute('data-name').indexOf(q) >= 0 ? '' : 'none'; });
      return;
    }
    recalc();
  });
  form.querySelector('[data-suggest]').addEventListener('click', function () {
    form.querySelectorAll('[data-row]').forEach(function (row) {
      var left = n(row.getAttribute('data-available'));
      var prec = Number(row.getAttribute('data-precision'));
      row.querySelectorAll('input[name^="qty"]').forEach(function (i) {
        var min = n(i.getAttribute('data-min')), cur = n(i.getAttribute('data-current'));
        if (min <= 0) return;
        var need = Math.max(0, min * 2 - cur);
        need = prec ? Math.floor(need) : Math.floor(need);
        var give = Math.min(need, Math.floor(left));
        if (give > 0) { i.value = give; left -= give; }
      });
    });
    recalc();
    J.toast('Sugerencia aplicada: revise y ajuste antes de despachar.', 'info');
  });
  form.querySelector('[data-reset]').addEventListener('click', function () { form.querySelectorAll('input[name^="qty"]').forEach(function (i) { i.value = ''; }); recalc(); });
  var from = form.querySelector('[data-from]');
  if (from) from.addEventListener('change', function () { location.href = J.url('/inventory/distribute?from=' + from.value); });
  recalc();
})();

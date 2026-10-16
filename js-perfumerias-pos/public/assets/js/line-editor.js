/* Editor de líneas con búsqueda de productos (entradas, compras, transferencias). */
(function () {
  var J = window.JSP;
  document.querySelectorAll('[data-line-editor]').forEach(function (ed) {
    var input = ed.querySelector('[data-lookup]');
    var box = ed.querySelector('[data-lookup-results]');
    var tbody = ed.querySelector('[data-lines]');
    var tpl = ed.querySelector('template[data-line-template]');
    var empty = ed.querySelector('[data-lines-empty]');
    var branchSel = ed.getAttribute('data-branch-source') ? document.querySelector(ed.getAttribute('data-branch-source')) : null;
    var timer, idx = tbody.querySelectorAll('tr').length;
    function sync() { if (empty) empty.classList.toggle('hidden', tbody.children.length > 0); ed.dispatchEvent(new Event('lines:change', { bubbles: true })); }
    function add(p) {
      if (tbody.querySelector('[data-pid="' + p.id + '"]')) { J.toast('El producto ya está en la lista.', 'info'); return; }
      var html = tpl.innerHTML
        .replace(/__i__/g, idx++).replace(/__id__/g, p.id)
        .replace(/__name__/g, J.escapeHtml(p.name)).replace(/__code__/g, J.escapeHtml(p.code))
        .replace(/__unit__/g, J.escapeHtml(p.unit)).replace(/__cost__/g, p.cost != null ? Number(p.cost) : '')
        .replace(/__available__/g, p.available != null ? J.qty(p.available, p.unit) : '—')
        .replace(/__step__/g, p.precision ? (1 / Math.pow(10, p.precision)) : 1);
      tbody.insertAdjacentHTML('beforeend', html);
      var q = tbody.lastElementChild.querySelector('[data-focus]');
      if (q) q.focus();
      sync();
    }
    function search() {
      var q = input.value.trim();
      if (q.length < 2) { box.classList.add('hidden'); return; }
      var url = '/api/products/lookup?q=' + encodeURIComponent(q) + (branchSel && branchSel.value ? '&branch=' + branchSel.value : '');
      J.api(url).then(function (d) {
        box.innerHTML = d.items.length ? d.items.map(function (p, i) {
          return '<a href="#" data-k="' + i + '">' + (p.thumb ? '<img class="thumb" src="' + J.escapeHtml(p.thumb) + '" alt="">' : '<span class="thumb" style="display:grid;place-items:center">' + J.icon('bottle', 'icon-sm') + '</span>') +
            '<span class="s-main"><span class="s-title">' + J.escapeHtml(p.name) + '</span><br><span class="s-sub">' + J.escapeHtml(p.code + ' · ' + p.unit + (p.available != null ? ' · disponible ' + J.qty(p.available) : '')) + '</span></span></a>';
        }).join('') : '<div style="padding:14px" class="muted">Sin coincidencias</div>';
        box.classList.remove('hidden');
        box.querySelectorAll('[data-k]').forEach(function (a) {
          a.addEventListener('click', function (e) { e.preventDefault(); add(d.items[Number(a.getAttribute('data-k'))]); input.value = ''; box.classList.add('hidden'); });
        });
      }).catch(function (e) { J.toast(e.message, 'error'); });
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 200); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var first = box.querySelector('[data-k]'); if (first && !box.classList.contains('hidden')) first.click(); }
    });
    document.addEventListener('click', function (e) { if (!ed.contains(e.target)) box.classList.add('hidden'); });
    tbody.addEventListener('click', function (e) { var r = e.target.closest('[data-remove-line]'); if (r) { r.closest('tr').remove(); sync(); } });
    sync();
  });
})();

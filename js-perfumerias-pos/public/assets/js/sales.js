/* Historial de ventas: abre el detalle en un panel lateral sin salir de la lista. */
(function () {
  var J = window.JSP;
  var drawer = document.getElementById('sale-drawer');
  if (!drawer) return;
  var body = drawer.querySelector('[data-drawer-body]');
  function open(id) {
    body.innerHTML = '<div class="skeleton sk-line" style="width:60%"></div><div class="skeleton" style="height:120px;margin:16px 0"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:80%"></div>';
    drawer.querySelector('[data-drawer-title]').textContent = 'Cargando…';
    J.openDialog(drawer);
    J.api('/api/sales/' + id).then(function (d) {
      drawer.querySelector('[data-drawer-title]').textContent = d.number;
      body.innerHTML = d.html;
    }).catch(function (e) { body.innerHTML = '<div class="callout callout-danger">' + J.escapeHtml(e.message) + '</div>'; });
  }
  document.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-sale]');
    if (!tr || e.target.closest('a, button, form')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    open(tr.getAttribute('data-sale'));
  }, true);
  document.addEventListener('keydown', function (e) {
    var tr = e.target.closest && e.target.closest('tr[data-sale]');
    if (tr && e.key === 'Enter') open(tr.getAttribute('data-sale'));
  });
})();

/* Rellena el modal de ajuste con los datos de la fila seleccionada. */
(function () {
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-adjust]');
    if (!b) return;
    var d = JSON.parse(b.getAttribute('data-adjust'));
    var m = document.getElementById(b.getAttribute('data-open'));
    if (!m) return;
    m.querySelectorAll('[data-adj-id]').forEach(function (i) { i.value = d.id; });
    m.querySelectorAll('[data-adj-name]').forEach(function (i) { i.textContent = d.name; });
    m.querySelectorAll('[data-adj-current]').forEach(function (i) { i.textContent = window.JSP.qty(d.qty, d.unit); });
    m.querySelectorAll('[data-adj-unit]').forEach(function (i) { i.textContent = '(' + d.unit + (d.precision ? ', hasta ' + d.precision + ' decimales' : '') + ')'; });
    m.querySelectorAll('[data-adj-min]').forEach(function (i) { i.value = Number(d.min); });
    var q = m.querySelector('#adj-qty'); if (q) q.value = '';
    var r = m.querySelector('#adj-reason'); if (r) r.value = '';
  }, true);
})();

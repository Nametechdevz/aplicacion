/* Totales de la orden de compra en vivo. */
(function () {
  var f = document.querySelector('[data-purchase-form]');
  if (!f) return;
  function n(v) { return Number(String(v || '').replace(',', '.')) || 0; }
  function calc() {
    var total = 0;
    f.querySelectorAll('[data-po-line]').forEach(function (tr) {
      var s = Math.max(0, n(tr.querySelector('[data-q]').value) * n(tr.querySelector('[data-c]').value) - n(tr.querySelector('[data-d]').value));
      tr.querySelector('[data-sub]').textContent = window.JSP.money(s);
      total += s;
    });
    total += n(f.querySelector('[data-additional]').value);
    f.querySelector('[data-po-total]').textContent = window.JSP.money(total);
  }
  f.addEventListener('input', calc);
  f.addEventListener('lines:change', calc);
})();

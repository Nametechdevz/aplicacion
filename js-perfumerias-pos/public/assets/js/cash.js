/* Conteo de efectivo por denominación y diferencia frente a lo esperado. */
(function () {
  var f = document.querySelector('[data-cash-close]');
  if (!f) return;
  var expected = Number(f.querySelector('[data-expected]').getAttribute('data-expected'));
  var counted = f.querySelector('[data-counted]');
  var diffEl = f.querySelector('[data-diff]');
  function showDiff() {
    var c = Number(String(counted.value).replace(',', '.'));
    if (counted.value === '' || isNaN(c)) { diffEl.textContent = '—'; diffEl.style.color = ''; return; }
    var d = Math.round((c - expected) * 100) / 100;
    diffEl.textContent = (d > 0 ? '+' : '') + window.JSP.money(d);
    diffEl.style.color = d === 0 ? 'var(--success)' : 'var(--danger)';
  }
  f.addEventListener('input', function (e) {
    if (e.target.matches('[data-denom]')) {
      var total = 0;
      f.querySelectorAll('[data-denom]').forEach(function (i) { total += (parseInt(i.value, 10) || 0) * Number(i.getAttribute('data-denom')); });
      counted.value = String(total);
    }
    showDiff();
  });
})();

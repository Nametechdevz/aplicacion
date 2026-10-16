(function () {
  var s = document.currentScript;
  document.addEventListener('click', function (e) { if (e.target.closest('[data-print]')) window.print(); });
  if (s && s.hasAttribute('data-autoprint') && window.self === window.top) window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });
})();

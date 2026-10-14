/* Nailora Beauty — comportamiento del panel administrativo. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* almacenamiento no disponible */ } }
  };

  /* Barra lateral: cajón en móvil, contraíble en escritorio */
  var body = document.body;
  var sidebar = $('[data-sidebar]');
  var backdrop = $('.admin-backdrop');
  var toggle = $('[data-sidebar-toggle]');
  var desktop = window.matchMedia('(min-width: 1024px)');
  if (store.get('nb-sidebar') === 'collapsed') { body.classList.add('sidebar-collapsed'); }
  var closeMobile = function () {
    if (!sidebar) { return; }
    sidebar.classList.remove('is-open');
    if (backdrop) { backdrop.hidden = true; }
    if (toggle) { toggle.setAttribute('aria-expanded', 'false'); }
  };
  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      if (desktop.matches) {
        body.classList.toggle('sidebar-collapsed');
        store.set('nb-sidebar', body.classList.contains('sidebar-collapsed') ? 'collapsed' : 'open');
        return;
      }
      var open = !sidebar.classList.contains('is-open');
      sidebar.classList.toggle('is-open', open);
      if (backdrop) { backdrop.hidden = !open; }
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var first = $('a', sidebar); if (first) { first.focus(); } }
    });
    $$('[data-sidebar-close]').forEach(function (el) { el.addEventListener('click', closeMobile); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMobile(); } });
  }

  /* Filtro de periodo: muestra fechas solo con "Rango personalizado" */
  $$('[data-period-filter]').forEach(function (form) {
    var select = $('[data-period-select]', form);
    var range = $('[data-period-range]', form);
    select.addEventListener('change', function () {
      range.hidden = select.value !== 'rango';
      if (select.value !== 'rango') { form.submit(); }
    });
  });

  $$('[data-autosubmit-select]').forEach(function (s) {
    s.addEventListener('change', function () {
      if (s.name === 'producto') { var v = $('#variante'); if (v) { v.value = ''; } }
      s.form.submit();
    });
  });

  $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });

  /* Mostrar/ocultar campos dependientes de una casilla */
  $$('[data-toggle-target]').forEach(function (box) {
    var target = $(box.dataset.toggleTarget);
    if (!target) { return; }
    box.addEventListener('change', function () { target.hidden = box.checked; });
  });

  /* Promociones: panel según el alcance */
  $$('[data-scope]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      $$('[data-scope-panel]').forEach(function (p) { p.hidden = p.dataset.scopePanel !== radio.value; });
    });
  });

  /* Inventario: vista previa del resultado del movimiento */
  var typeSel = $('[data-movement-type]');
  var qty = $('[data-quantity]');
  var preview = $('[data-preview]');
  var currentEl = $('[data-current-stock]');
  if (typeSel && qty && preview && currentEl) {
    var current = parseInt(currentEl.dataset.currentStock, 10);
    var update = function () {
      var dir = typeSel.options[typeSel.selectedIndex].dataset.direction;
      var label = $('[data-quantity-label]');
      if (label) { label.textContent = dir === 'set' ? 'Cantidad contada (final)' : 'Cantidad de unidades'; }
      var n = parseInt(qty.value, 10);
      if (isNaN(n)) { preview.textContent = ''; return; }
      var after = dir === 'in' ? current + n : (dir === 'out' ? current - n : n);
      preview.textContent = 'Quedarán ' + after + ' unidades' + (after < 0 ? ' (no permitido: no puede quedar en negativo)' : '') + '.';
      preview.classList.toggle('text-error', after < 0);
    };
    typeSel.addEventListener('change', update);
    qty.addEventListener('input', update);
    update();
  }

  /* Tooltip de la gráfica (usa el <title> de cada barra) */
  var tip;
  var showTip = function (group, x, y) {
    var title = $('title', group);
    if (!title) { return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tooltip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = title.textContent;
    tip.hidden = false;
    var w = tip.offsetWidth;
    tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
    tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
  };
  var hideTip = function () { if (tip) { tip.hidden = true; } };
  $$('.chart__bar-group').forEach(function (g) {
    g.addEventListener('mousemove', function (e) { showTip(g, e.clientX, e.clientY); });
    g.addEventListener('mouseleave', hideTip);
    g.addEventListener('focus', function () { var r = g.getBoundingClientRect(); showTip(g, r.left + r.width / 2, r.top + 40); });
    g.addEventListener('blur', hideTip);
  });
})();

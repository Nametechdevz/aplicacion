/* Nailora Beauty — comportamiento común (tienda y panel). Sin dependencias. */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  window.Nailora = window.Nailora || {};

  /* ---------- Avisos flotantes (toast) ---------- */
  Nailora.toast = function (message, type, action) {
    var region = $('[data-toast-region]');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('data-toast-region', '');
      document.body.appendChild(region);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast--' + (type || 'info');
    var p = document.createElement('p');
    p.textContent = message;
    toast.appendChild(p);
    if (action && action.href) {
      var a = document.createElement('a');
      a.href = action.href;
      a.textContent = action.label;
      toast.appendChild(a);
    }
    region.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4500);
  };

  /* ---------- Modal de confirmación accesible ---------- */
  Nailora.confirm = function (message, confirmLabel) {
    return new Promise(function (resolve) {
      if (typeof HTMLDialogElement !== 'function') {
        resolve(window.confirm(message));
        return;
      }
      var dialog = document.createElement('dialog');
      dialog.className = 'confirm-dialog';
      dialog.setAttribute('aria-labelledby', 'confirm-dialog-text');
      dialog.innerHTML = '<p id="confirm-dialog-text"></p><div class="confirm-dialog__actions">' +
        '<button type="button" class="btn btn--ghost" value="cancel">Cancelar</button>' +
        '<button type="button" class="btn btn--primary" value="ok"></button></div>';
      dialog.querySelector('p').textContent = message;
      dialog.querySelector('[value="ok"]').textContent = confirmLabel || 'Confirmar';
      document.body.appendChild(dialog);
      var done = function (result) { dialog.close(); dialog.remove(); resolve(result); };
      dialog.addEventListener('cancel', function (e) { e.preventDefault(); done(false); });
      dialog.querySelector('[value="cancel"]').addEventListener('click', function () { done(false); });
      dialog.querySelector('[value="ok"]').addEventListener('click', function () { done(true); });
      dialog.showModal();
      dialog.querySelector('[value="cancel"]').focus();
    });
  };

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches('[data-confirm]') || form.dataset.confirmed === '1') { return; }
    e.preventDefault();
    Nailora.confirm(form.getAttribute('data-confirm'), form.getAttribute('data-confirm-label')).then(function (ok) {
      if (ok) {
        form.dataset.confirmed = '1';
        if (typeof form.requestSubmit === 'function') { form.requestSubmit(); } else { form.submit(); }
      }
    });
  }, true);

  /* ---------- Evitar doble envío ---------- */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches('[data-once-submit]') || e.defaultPrevented) { return; }
    if (form.dataset.submitting === '1') { e.preventDefault(); return; }
    form.dataset.submitting = '1';
    var btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      if (btn.dataset.loadingText) {
        btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + btn.dataset.loadingText;
      }
    }
    // Si el usuario vuelve con el botón "atrás", reactivar el formulario
    window.addEventListener('pageshow', function () { form.dataset.submitting = ''; if (btn) { btn.classList.remove('is-loading'); } }, { once: true });
  });

  /* ---------- Mensajes flash ---------- */
  document.addEventListener('click', function (e) {
    var close = e.target.closest('[data-flash-close]');
    if (close) { close.closest('[data-flash]').remove(); }
  });
  $$('.flash--success').forEach(function (el) { setTimeout(function () { el.remove(); }, 7000); });

  /* ---------- Menú móvil ---------- */
  var drawer = $('[data-drawer]');
  var opener = $('[data-drawer-open]');
  if (drawer && opener) {
    var openDrawer = function () {
      drawer.hidden = false;
      document.body.classList.add('no-scroll');
      opener.setAttribute('aria-expanded', 'true');
      var first = drawer.querySelector('input, a, button');
      if (first) { first.focus(); }
    };
    var closeDrawer = function () {
      drawer.hidden = true;
      document.body.classList.remove('no-scroll');
      opener.setAttribute('aria-expanded', 'false');
      opener.focus();
    };
    opener.addEventListener('click', openDrawer);
    $$('[data-drawer-close]', drawer).forEach(function (el) { el.addEventListener('click', closeDrawer); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) { closeDrawer(); } });
  }

  /* ---------- Ordenar catálogo al cambiar el select ---------- */
  $$('[data-autosubmit] select').forEach(function (select) {
    select.addEventListener('change', function () { select.form.submit(); });
  });

  /* ---------- Filtros plegados en móvil si no hay filtros activos ---------- */
  var filters = $('[data-filters]');
  if (filters && window.matchMedia('(max-width: 1023px)').matches && !document.querySelector('.chips')) {
    filters.removeAttribute('open');
  }

  /* ---------- Selector de cantidad ---------- */
  document.addEventListener('click', function (e) {
    var step = e.target.closest('[data-qty-step]');
    if (!step) { return; }
    var input = step.closest('[data-qty]').querySelector('[data-qty-input]');
    var min = parseInt(input.min || '0', 10);
    var max = parseInt(input.max || '999', 10);
    var value = (parseInt(input.value, 10) || 0) + parseInt(step.dataset.qtyStep, 10);
    input.value = Math.max(min, Math.min(max, value));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ---------- Galería de producto ---------- */
  var gallery = $('[data-gallery]');
  if (gallery) {
    var main = $('[data-gallery-main]', gallery);
    $$('[data-gallery-thumb]', gallery).forEach(function (thumb) {
      thumb.addEventListener('click', function (e) {
        e.preventDefault();
        main.src = thumb.href;
        main.alt = thumb.dataset.alt || main.alt;
        $$('[data-gallery-thumb]', gallery).forEach(function (t) { t.classList.remove('is-active'); });
        thumb.classList.add('is-active');
      });
    });
  }

  /* ---------- Variantes: actualiza precio, SKU y existencias mostrados ---------- */
  var buyBox = $('[data-buy-box]');
  if (buyBox) {
    var qtyInput = $('[data-qty-input]', buyBox);
    var maxCart = qtyInput ? parseInt(qtyInput.getAttribute('max'), 10) : 50;
    $$('[data-variant]', buyBox).forEach(function (radio) {
      radio.addEventListener('change', function () {
        var d = radio.dataset;
        var stock = parseInt(d.stock, 10);
        var set = function (sel, text) { var el = document.querySelector(sel); if (el) { el.textContent = text; } };
        set('[data-variant-name]', d.name);
        set('[data-variant-sku]', d.sku);
        set('[data-price-current]', d.price);
        var old = document.querySelector('[data-price-old]');
        if (old) { old.hidden = !d.old; set('[data-price-old-value]', d.old || ''); }
        var label = document.querySelector('[data-stock-label]');
        if (label) {
          label.className = 'stock-indicator ' + (stock > 0 ? 'is-in' : 'is-out');
          label.textContent = stock > 0 ? (stock <= 3 ? '¡Últimas ' + stock + ' unidades!' : 'Disponible (' + stock + ' unidades)') : 'Agotado';
        }
        if (qtyInput) {
          qtyInput.max = Math.max(1, Math.min(stock, maxCart || 50));
          if (parseInt(qtyInput.value, 10) > parseInt(qtyInput.max, 10)) { qtyInput.value = qtyInput.max; }
        }
      });
    });
  }
})();

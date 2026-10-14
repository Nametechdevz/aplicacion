/* Nailora Beauty — carrito con Fetch API (con respaldo de formularios normales). */
(function () {
  'use strict';

  var token = function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  };

  var updateCount = function (count) {
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = count;
      el.classList.toggle('is-empty', !count);
      el.classList.add('is-bumped');
      setTimeout(function () { el.classList.remove('is-bumped'); }, 200);
    });
  };

  /* Siempre al mismo origen de la página (evita bloqueos si APP_URL difiere en http/https o www) */
  var sameOrigin = function (action) {
    try {
      var u = new URL(action, window.location.href);
      return window.location.origin + u.pathname + u.search;
    } catch (e) {
      return action;
    }
  };

  var post = function (form) {
    return fetch(sameOrigin(form.getAttribute('action') || form.action), {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch', 'X-CSRF-Token': token() },
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, fallback: true }; });
    });
  };

  /* Si Fetch falla, se envía el formulario de forma tradicional (el servidor responde igual) */
  var fallbackSubmit = function (form) {
    form.dataset.nofetch = '1';
    HTMLFormElement.prototype.submit.call(form);
  };

  /* Añadir al carrito sin recargar la página */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches('[data-add-to-cart]') || form.dataset.nofetch === '1' || !window.fetch || !window.FormData) { return; }
    e.preventDefault();
    if (form.dataset.busy === '1') { return; }
    form.dataset.busy = '1';
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); }
    post(form).then(function (data) {
      if (data.fallback) {
        fallbackSubmit(form);
      } else if (data.ok) {
        updateCount(data.count);
        Nailora.toast(data.message, 'success', { href: (document.querySelector('.cart-btn') || {}).href, label: 'Ver carrito' });
      } else {
        Nailora.toast(data.message || 'No se pudo agregar el producto.', 'error');
      }
    }).catch(function () {
      fallbackSubmit(form);
    }).finally(function () {
      form.dataset.busy = '';
      if (btn) { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); }
    });
  });

  /* Cambiar cantidades en el carrito: se valida en el servidor y se recarga el resumen */
  document.querySelectorAll('[data-cart-update]').forEach(function (form) {
    var input = form.querySelector('[data-qty-input]');
    var timer;
    input.addEventListener('change', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var line = form.closest('[data-cart-line]');
        if (line) { line.classList.add('is-updating'); }
        if (!window.fetch) { form.submit(); return; }
        post(form).then(function (data) {
          if (data.fallback) { fallbackSubmit(form); return; }
          if (!data.ok) { Nailora.toast(data.message, 'error'); }
          window.location.reload();
        }).catch(function () { fallbackSubmit(form); });
      }, 450);
    });
  });
})();

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

  var post = function (form) {
    return fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch', 'X-CSRF-Token': token() },
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, message: 'No se pudo completar la acción. Recarga la página.' }; });
    });
  };

  /* Añadir al carrito sin recargar la página */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches('[data-add-to-cart]') || !window.fetch || !window.FormData) { return; }
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); }
    post(form).then(function (data) {
      if (data.ok) {
        updateCount(data.count);
        Nailora.toast(data.message, 'success', { href: (document.querySelector('.cart-btn') || {}).href, label: 'Ver carrito' });
      } else {
        Nailora.toast(data.message || 'No se pudo agregar el producto.', 'error');
      }
    }).catch(function () {
      Nailora.toast('Sin conexión. Inténtalo de nuevo.', 'error');
    }).finally(function () {
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
          if (!data.ok) { Nailora.toast(data.message, 'error'); }
          window.location.reload();
        }).catch(function () { form.submit(); });
      }, 450);
    });
  });
})();

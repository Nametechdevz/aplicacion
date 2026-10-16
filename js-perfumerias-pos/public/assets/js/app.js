/* ==========================================================================
   JS Perfumerías POS — comportamiento común de la interfaz
   Sin dependencias. Expone window.JSP con utilidades para otros módulos.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var meta = function (n) { var m = doc.querySelector('meta[name="' + n + '"]'); return m ? m.content : ''; };
  var BASE = meta('base-url');

  /* ---------------- Formato colombiano ---------------- */
  var moneyFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  function money(v) {
    var n = Number(v || 0);
    return (n < 0 ? '−' : '') + '$ ' + moneyFmt.format(Math.round(Math.abs(n)));
  }
  function qty(v, unit) {
    var n = Number(v || 0);
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(n) + (unit ? ' ' + unit : '');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function url(path) { return BASE + (path.charAt(0) === '/' ? path : '/' + path); }
  function icon(name, cls) { return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>'; }

  /* ---------------- Peticiones con CSRF ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': meta('csrf-token') };
    var body = opts.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    return fetch(url(path), { method: opts.method || (body ? 'POST' : 'GET'), headers: headers, body: body, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || data.ok === false) {
            var err = new Error(data.message || 'No fue posible completar la operación (' + res.status + ').');
            err.status = res.status; err.data = data;
            if (res.status === 401) { setTimeout(function () { location.href = url('/login'); }, 1200); }
            throw err;
          }
          return data;
        });
      }, function () {
        var err = new Error('Sin conexión con el servidor. Verifique la red e intente de nuevo.');
        err.status = 0; throw err;
      });
  }

  /* ---------------- Toasts ---------------- */
  var toastIcons = { success: 'check-circle', error: 'x-circle', warning: 'alert', info: 'info' };
  function toast(message, type, timeout) {
    type = type || 'info';
    var wrap = doc.querySelector('.toasts');
    if (!wrap) return;
    var el = doc.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = icon(toastIcons[type] || 'info') + '<div>' + escapeHtml(message) + '</div><button class="t-close" type="button" aria-label="Cerrar">' + icon('x', 'icon-sm') + '</button>';
    wrap.appendChild(el);
    var close = function () { el.classList.add('is-leaving'); setTimeout(function () { el.remove(); }, 220); };
    el.querySelector('.t-close').addEventListener('click', close);
    setTimeout(close, timeout || (type === 'error' ? 7000 : 4200));
  }

  /* ---------------- Diálogos ---------------- */
  function openDialog(d) {
    if (typeof d === 'string') d = doc.getElementById(d);
    if (!d) return;
    d.classList.remove('is-closing');
    if (!d.open) d.showModal();
    var f = d.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button.btn-primary');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeDialog(d) {
    if (typeof d === 'string') d = doc.getElementById(d);
    if (!d || !d.open) return;
    d.classList.add('is-closing');
    setTimeout(function () { d.classList.remove('is-closing'); d.close(); }, 150);
  }
  doc.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); openDialog(opener.getAttribute('data-open')); return; }
    var closer = e.target.closest('[data-close]');
    if (closer) { e.preventDefault(); closeDialog(closer.closest('dialog')); return; }
    // Clic en el fondo cierra el diálogo
    if (e.target.tagName === 'DIALOG' && (e.target.classList.contains('modal') || e.target.classList.contains('drawer')) && !e.target.hasAttribute('data-static')) {
      var r = e.target.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside || e.target.classList.contains('modal')) {
        var card = e.target.querySelector('.modal-card, .drawer-inner');
        if (card && !card.contains(e.target)) closeDialog(e.target);
      }
    }
  });

  /* Confirmación con motivo opcional: devuelve Promise<string|false> */
  function confirmAction(opts) {
    opts = opts || {};
    var d = doc.getElementById('confirm-dialog');
    if (!d) return Promise.resolve(window.confirm(opts.text || '¿Confirmar?') ? '' : false);
    d.querySelector('#confirm-title').textContent = opts.title || '¿Confirmar acción?';
    d.querySelector('[data-confirm-text]').textContent = opts.text || '';
    var ok = d.querySelector('[data-confirm-ok]');
    ok.textContent = opts.ok || 'Confirmar';
    ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    var reasonWrap = d.querySelector('[data-confirm-reason-wrap]');
    var reason = d.querySelector('[data-confirm-reason]');
    reason.value = '';
    reasonWrap.classList.toggle('hidden', !opts.reason);
    if (opts.reason) d.querySelector('[data-confirm-reason-label]').textContent = opts.reason;
    return new Promise(function (resolve) {
      var done = function () {
        d.removeEventListener('close', done);
        if (d.returnValue !== 'ok') return resolve(false);
        var min = opts.minLength != null ? opts.minLength : 4;
        if (opts.reason && reason.value.trim().length < min) {
          toast('Escriba el motivo (mínimo ' + min + ' caracteres).', 'warning');
          return resolve(false);
        }
        resolve(reason.value.trim());
      };
      d.returnValue = '';
      d.addEventListener('close', done);
      d.showModal();
      setTimeout(function () { (opts.reason ? reason : ok).focus(); }, 30);
    });
  }

  /* Formularios con data-confirm piden confirmación antes de enviarse */
  doc.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.method === 'dialog') return;
    if (form.hasAttribute('data-confirm') && !form.dataset.confirmed) {
      e.preventDefault();
      confirmAction({
        title: form.getAttribute('data-confirm'),
        text: form.getAttribute('data-confirm-text') || '',
        danger: form.hasAttribute('data-danger'),
        ok: form.getAttribute('data-confirm-ok') || 'Confirmar',
        reason: form.getAttribute('data-confirm-reason') || null,
        minLength: form.hasAttribute('data-confirm-min') ? Number(form.getAttribute('data-confirm-min')) : 4
      }).then(function (res) {
        if (res === false) return;
        if (form.getAttribute('data-confirm-reason')) {
          var h = form.querySelector('input[name="reason"]');
          if (!h) { h = doc.createElement('input'); h.type = 'hidden'; h.name = 'reason'; form.appendChild(h); }
          h.value = res;
        }
        form.dataset.confirmed = '1';
        if (form.requestSubmit) form.requestSubmit(); else form.submit();
      });
      return;
    }
    // Protección contra doble envío
    if (form.dataset.submitting) { e.preventDefault(); return; }
    if (!form.checkValidity()) return;
    form.dataset.submitting = '1';
    var btn = e.submitter || form.querySelector('[type=submit]');
    if (btn && btn.classList.contains('btn')) {
      btn.classList.add('is-loading');
      if (!btn.querySelector('.spinner')) btn.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
    }
    setTimeout(function () { delete form.dataset.submitting; delete form.dataset.confirmed; if (btn) btn.classList.remove('is-loading'); }, 8000);
  }, true);

  /* ---------------- Menús desplegables ---------------- */
  doc.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-dropdown-toggle]');
    doc.querySelectorAll('[data-dropdown].is-open').forEach(function (dd) {
      if (!toggle || !dd.contains(toggle)) { dd.classList.remove('is-open'); var t = dd.querySelector('[data-dropdown-toggle]'); if (t) t.setAttribute('aria-expanded', 'false'); }
    });
    if (toggle) {
      var dd = toggle.closest('[data-dropdown]');
      var open = !dd.classList.contains('is-open');
      dd.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) dd.dispatchEvent(new CustomEvent('dropdown:open'));
    }
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') doc.querySelectorAll('[data-dropdown].is-open').forEach(function (dd) { dd.classList.remove('is-open'); });
  });

  /* ---------------- Barra lateral ---------------- */
  var app = doc.getElementById('app');
  if (app) {
    if (root.classList.contains('sidebar-collapsed')) app.classList.add('is-collapsed');
    var isMobile = function () { return window.matchMedia('(max-width: 960px)').matches; };
    doc.querySelectorAll('[data-sidebar-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (isMobile()) { app.classList.toggle('is-mobile-open'); return; }
        var c = app.classList.toggle('is-collapsed');
        try { localStorage.setItem('jsp-sidebar', c ? 'collapsed' : 'expanded'); } catch (err) { /* */ }
      });
    });
    doc.querySelectorAll('[data-sidebar-close]').forEach(function (s) { s.addEventListener('click', function () { app.classList.remove('is-mobile-open'); }); });
  }

  /* ---------------- Tema claro / oscuro ---------------- */
  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncThemeIcons() {
    var dark = currentTheme() === 'dark';
    doc.querySelectorAll('.theme-icon-dark').forEach(function (i) { i.classList.toggle('hidden', dark); });
    doc.querySelectorAll('.theme-icon-light').forEach(function (i) { i.classList.toggle('hidden', !dark); });
  }
  doc.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('jsp-theme', next); } catch (err) { /* */ }
      syncThemeIcons();
      doc.dispatchEvent(new CustomEvent('theme:change'));
    });
  });
  syncThemeIcons();

  /* ---------------- Búsqueda global ---------------- */
  var gs = doc.querySelector('[data-global-search]');
  if (gs) {
    var gsInput = gs.querySelector('input');
    var gsBox = gs.querySelector('.search-results');
    var gsTimer, gsSeq = 0, gsFocus = -1;
    var renderGs = function (data) {
      var html = '';
      var groups = [['products', 'Productos', 'bottle'], ['sales', 'Ventas', 'receipt'], ['customers', 'Clientes', 'user'], ['transfers', 'Transferencias', 'transfer']];
      groups.forEach(function (g) {
        var items = data[g[0]] || [];
        if (!items.length) return;
        html += '<div class="group-title">' + g[1] + '</div>';
        items.forEach(function (it) {
          var media = it.thumb ? '<img class="thumb" src="' + escapeHtml(it.thumb) + '" alt="">' : '<span class="thumb" style="display:grid;place-items:center">' + icon(g[2], 'icon-sm') + '</span>';
          html += '<a href="' + escapeHtml(it.url) + '" role="option">' + media + '<span class="s-main"><span class="s-title">' + escapeHtml(it.title) + '</span><br><span class="s-sub">' + escapeHtml(it.sub || '') + '</span></span></a>';
        });
      });
      gsBox.innerHTML = html || '<div class="empty" style="padding:22px"><p>Sin resultados para «' + escapeHtml(gsInput.value) + '».</p></div>';
      gsBox.classList.remove('hidden');
      gsFocus = -1;
    };
    gsInput.addEventListener('input', function () {
      clearTimeout(gsTimer);
      var q = gsInput.value.trim();
      if (q.length < 2) { gsBox.classList.add('hidden'); return; }
      gsTimer = setTimeout(function () {
        var seq = ++gsSeq;
        api('/api/search?q=' + encodeURIComponent(q)).then(function (d) { if (seq === gsSeq) renderGs(d); }).catch(function () { /* silencioso */ });
      }, 180);
    });
    gsInput.addEventListener('keydown', function (e) {
      var links = gsBox.querySelectorAll('a');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        gsFocus = Math.max(0, Math.min(links.length - 1, gsFocus + (e.key === 'ArrowDown' ? 1 : -1)));
        links.forEach(function (l, i) { l.classList.toggle('is-focus', i === gsFocus); });
      } else if (e.key === 'Enter' && gsFocus >= 0 && links[gsFocus]) {
        e.preventDefault(); location.href = links[gsFocus].href;
      } else if (e.key === 'Escape') { gsBox.classList.add('hidden'); gsInput.blur(); }
    });
    doc.addEventListener('click', function (e) { if (!gs.contains(e.target)) gsBox.classList.add('hidden'); });
    doc.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); gsInput.focus(); gsInput.select(); }
    });
  }

  /* ---------------- Notificaciones ---------------- */
  var notif = doc.querySelector('[data-notifications]');
  if (notif) {
    var loadNotif = function () {
      api('/api/notifications').then(function (d) {
        var list = notif.querySelector('[data-notif-list]');
        var items = d.items || [];
        notif.querySelector('.dot').classList.toggle('hidden', !items.length);
        notif.querySelector('[data-notif-count]').textContent = items.length ? items.length + ' pendientes' : '';
        list.innerHTML = items.length ? items.map(function (n) {
          return '<a class="n-item" href="' + escapeHtml(n.url) + '"><span class="ico">' + icon(n.icon || 'info', 'icon-sm') + '</span><span><strong>' + escapeHtml(n.title) + '</strong><small>' + escapeHtml(n.sub || '') + '</small></span></a>';
        }).join('') : '<div class="empty" style="padding:28px 20px">' + icon('check-circle', 'icon-lg text-success') + '<p>Todo al día. No hay pendientes.</p></div>';
      }).catch(function () { /* */ });
    };
    loadNotif();
    notif.addEventListener('dropdown:open', loadNotif);
    setInterval(loadNotif, 90000);
  }

  /* ---------------- Mensajes flash del servidor ---------------- */
  var flash = doc.getElementById('flash-data');
  if (flash) {
    try { JSON.parse(flash.textContent || '[]').forEach(function (f) { toast(f.message, f.type === 'success' ? 'success' : (f.type === 'error' ? 'error' : f.type)); }); } catch (err) { /* */ }
  }

  /* ---------------- Formularios AJAX (data-ajax) ---------------- */
  doc.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.hasAttribute('data-ajax') || e.defaultPrevented) return;
    e.preventDefault();
    var btn = form.querySelector('[type=submit]');
    form.querySelectorAll('.is-invalid').forEach(function (el) { el.classList.remove('is-invalid'); });
    form.querySelectorAll('.field .error[data-js]').forEach(function (el) { el.remove(); });
    api(form.getAttribute('action'), { method: 'POST', body: new FormData(form) }).then(function (d) {
      if (d.message) toast(d.message, 'success');
      if (d.redirect) setTimeout(function () { location.href = d.redirect; }, 350);
      else if (form.hasAttribute('data-reload')) setTimeout(function () { location.reload(); }, 350);
      var dlg = form.closest('dialog'); if (dlg && !d.redirect) closeDialog(dlg);
      form.dispatchEvent(new CustomEvent('ajax:success', { detail: d }));
    }).catch(function (err) {
      toast(err.message, 'error');
      var errors = (err.data && err.data.errors) || {};
      Object.keys(errors).forEach(function (k) {
        var input = form.querySelector('[name="' + k + '"]');
        if (!input) return;
        input.classList.add('is-invalid');
        var field = input.closest('.field');
        if (field) field.insertAdjacentHTML('beforeend', '<span class="error" data-js>' + escapeHtml(errors[k]) + '</span>');
      });
    }).finally(function () {
      delete form.dataset.submitting;
      if (btn) btn.classList.remove('is-loading');
    });
  });

  /* Imprimir */
  doc.addEventListener('click', function (e) { if (e.target.closest('[data-print]')) { e.preventDefault(); window.print(); } });

  /* Filas clicables */
  doc.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a, button, input, select, form, label')) location.href = tr.getAttribute('data-href');
  });

  /* Filtros que se envían al cambiar */
  doc.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches('[data-autosubmit]') || (el.form && el.form.hasAttribute('data-autosubmit') && el.tagName === 'SELECT')) {
      el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
    }
  });

  /* Validación visible al salir de un campo */
  doc.addEventListener('blur', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('.input, .select, .textarea') || !el.form || el.form.hasAttribute('novalidate')) return;
    el.classList.toggle('is-invalid', !el.checkValidity());
  }, true);

  /* Vista previa de imágenes antes de subir */
  doc.addEventListener('change', function (e) {
    var input = e.target;
    if (!input.matches('input[type=file][data-preview]')) return;
    var target = doc.querySelector(input.getAttribute('data-preview'));
    if (!target || !input.files || !input.files[0]) return;
    var f = input.files[0];
    if (f.size > 5 * 1024 * 1024) { toast('La imagen supera 5 MB.', 'error'); input.value = ''; return; }
    var r = new FileReader();
    r.onload = function () { target.innerHTML = '<img src="' + r.result + '" alt="Vista previa">'; };
    r.readAsDataURL(f);
  });

  window.JSP = {
    api: api, toast: toast, money: money, qty: qty, escapeHtml: escapeHtml, url: url, icon: icon,
    openDialog: openDialog, closeDialog: closeDialog, confirm: confirmAction, theme: currentTheme
  };
})();

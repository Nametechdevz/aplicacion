/* Formulario de usuario: generador de contraseña y vista de permisos efectivos. */
(function () {
  var form = document.querySelector('[data-user-form]');
  if (!form) return;
  var rolePerms = JSON.parse(document.getElementById('role-perms').textContent || '{}');
  function syncRoles() {
    var roles = Array.prototype.map.call(form.querySelectorAll('[data-role]:checked'), function (r) { return r.value; });
    var set = {};
    roles.forEach(function (r) { (rolePerms[r] || []).forEach(function (p) { set[p] = true; }); });
    form.querySelectorAll('[data-by-role]').forEach(function (el) {
      var inc = !!set[el.getAttribute('data-by-role')];
      el.textContent = inc ? 'incluido en el rol' : 'no incluido en el rol';
      el.style.color = inc ? 'var(--success)' : '';
    });
    form.querySelectorAll('[data-role]').forEach(function (r) { r.closest('.method').classList.toggle('is-active', r.checked); });
  }
  function syncHidden() {
    var box = form.querySelector('[data-perm-hidden]');
    if (!box) return;
    box.innerHTML = '';
    form.querySelectorAll('[data-perm]').forEach(function (s) {
      if (!s.value) return;
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = (s.value === 'grant' ? 'grants' : 'denies') + '[]'; i.value = s.getAttribute('data-perm');
      box.appendChild(i);
    });
  }
  form.addEventListener('change', function () { syncRoles(); syncHidden(); });
  form.addEventListener('submit', syncHidden, true);
  syncRoles(); syncHidden();

  var gen = form.querySelector('[data-generate]');
  gen.addEventListener('click', function () {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var a = new Uint32Array(14); crypto.getRandomValues(a);
    var pw = Array.prototype.map.call(a, function (x) { return chars[x % chars.length]; }).join('');
    pw = pw.slice(0, 11) + String(2 + (a[0] % 8)) + pw.slice(12);
    form.querySelector('#u-pass').value = pw; form.querySelector('#u-pass2').value = pw;
    var c = form.querySelector('[data-generated]');
    c.classList.remove('hidden');
    c.querySelector('span').textContent = 'Contraseña generada: ' + pw + ' — compártala por un canal seguro; no se volverá a mostrar.';
  });
})();

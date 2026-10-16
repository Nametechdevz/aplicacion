(function () {
  var b = document.querySelector('[data-pw-toggle]');
  if (!b) return;
  b.addEventListener('click', function () {
    var i = document.getElementById('password');
    var show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    b.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    i.focus();
  });
})();

/* Aplica el tema guardado antes de pintar la página (evita parpadeo). */
(function () {
  try {
    var t = localStorage.getItem('jsp-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    if (localStorage.getItem('jsp-sidebar') === 'collapsed') document.documentElement.classList.add('sidebar-collapsed');
  } catch (e) { /* almacenamiento no disponible */ }
})();

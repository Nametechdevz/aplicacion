// Utilidades globales
window.fmt = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
window.api = async (path, opts = {}) => {
    const res = await fetch(APP.base + path, {
        credentials: 'same-origin',
        ...opts,
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': APP.csrf,
            ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
            ...(opts.headers || {}),
        },
    });
    let data = {};
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Respuesta inválida del servidor (' + res.status + ')' }; }
    if (!res.ok && data.ok !== false) data.ok = false;
    return data;
};

document.addEventListener('DOMContentLoaded', () => {
    // Confirmación genérica para formularios/botones con data-confirm
    document.querySelectorAll('[data-confirm]').forEach(el => {
        const ev = el.tagName === 'FORM' ? 'submit' : 'click';
        el.addEventListener(ev, e => { if (!confirm(el.dataset.confirm)) e.preventDefault(); });
    });
    // Calcular DV de NIT automáticamente
    document.querySelectorAll('[data-nit-source]').forEach(dv => {
        const src = document.querySelector(dv.dataset.nitSource);
        const typeSel = dv.dataset.docTypeSource ? document.querySelector(dv.dataset.docTypeSource) : null;
        const calc = () => {
            if (typeSel && typeSel.value !== '31') { dv.value = ''; return; }
            dv.value = nitDv(src.value);
        };
        src.addEventListener('input', calc);
        if (typeSel) typeSel.addEventListener('change', calc);
    });
});

window.nitDv = (nit) => {
    nit = String(nit).replace(/\D/g, '');
    if (!nit) return '';
    const primes = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let sum = 0;
    const d = nit.split('').reverse();
    for (let i = 0; i < d.length && i < primes.length; i++) sum += Number(d[i]) * primes[i];
    const r = sum % 11;
    return String(r > 1 ? 11 - r : r);
};

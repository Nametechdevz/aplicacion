/* Panel ejecutivo: pinta indicadores y gráficas; los filtros recargan datos vía Fetch. */
(function () {
  'use strict';
  var J = window.JSP, C = window.JSPCharts;
  var root = document.querySelector('[data-dashboard]');
  if (!root) return;
  var form = document.querySelector('[data-dashboard-filters]');
  var links = JSON.parse(document.getElementById('dashboard-links').textContent);
  var data = JSON.parse(document.getElementById('dashboard-data').textContent);
  var mode = 'sales';
  var esc = J.escapeHtml, money = J.money, icon = J.icon;
  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function shortDate(d) { var p = d.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1]; }
  function longDate(d) { var p = d.split('-'); return Number(p[2]) + ' de ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function num(v) { return new Intl.NumberFormat('es-CO').format(Number(v || 0)); }

  function emptyBlock(text) {
    return '<div class="empty" style="padding:28px 10px"><svg class="illus" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.2" style="color:var(--faint);width:70px;height:70px"><rect x="48" y="18" width="24" height="12" rx="2"/><path d="M40 36c0-3 2-5 5-5h30c3 0 5 2 5 5v58c0 6-4 10-10 10H50c-6 0-10-4-10-10z"/><path d="M40 60h40" stroke-dasharray="3 4"/></svg><p>' + esc(text) + '</p></div>';
  }

  function renderKpis(d) {
    var k = d.kpi;
    var fin = d.can_financial;
    var cells = [
      ['Ventas del periodo', 'receipt', money(k.sales), 'Hoy ' + money(k.today) + ' · Mes ' + money(k.month), true],
      ['Transacciones', 'cart', num(k.transactions), num(Number(k.units)) + ' artículos vendidos'],
      ['Ticket promedio', 'tag', money(k.avg_ticket), 'Descuentos ' + money(k.discounts)],
      fin
        ? ['Utilidad bruta estimada', 'trend-up', money(k.profit), 'Margen ' + String(k.margin_pct).replace('.', ',') + ' % · costo ' + money(k.cost)]
        : ['Devoluciones', 'undo', money(k.returns), k.return_count + ' devoluciones registradas']
    ];
    root.querySelector('[data-kpis]').innerHTML = cells.map(function (c) {
      return '<div class="kpi' + (c[4] ? ' is-hero' : '') + '"><div class="kpi-label">' + icon(c[1]) + esc(c[0]) + '</div>' +
        '<div class="kpi-value" title="' + esc(c[2]) + '">' + esc(c[2]) + '</div><div class="kpi-foot">' + esc(c[3]) + '</div></div>';
    }).join('');
    var mini = [
      ['Ventas netas', money(k.net_sales)],
      ['Descuentos concedidos (' + num(k.discount_count) + ')', money(k.discounts)],
      ['Devoluciones (' + num(k.return_count) + ')', money(k.returns)],
      ['Ventas anuladas', num(k.voids)],
      ['Existencias bajas', num(k.low_stock), links.can_inventory ? links.inventory_low : null],
      ['Productos agotados', num(k.out_of_stock), links.can_inventory ? links.inventory_out : null]
    ];
    root.querySelector('[data-mini]').innerHTML = mini.map(function (m) {
      var val = m[2] ? '<a class="value" href="' + esc(m[2]) + '">' + esc(m[1]) + '</a>' : '<div class="value">' + esc(m[1]) + '</div>';
      return '<div class="mini-stat"><div class="label">' + esc(m[0]) + '</div>' + val + '</div>';
    }).join('');
  }

  function renderEvolution(d) {
    var el = root.querySelector('[data-chart-evolution]');
    var labels = d.series.map(function (s) { return s.date; });
    var hasData = d.series.some(function (s) { return Number(s.total) > 0; });
    if (!hasData) { el.innerHTML = emptyBlock('No hay ventas registradas en el periodo seleccionado.'); root.querySelector('[data-evo-legend]').innerHTML = ''; return; }
    var series = [{ name: 'Ventas', values: d.series.map(function (s) { return Number(s.total); }) }];
    if (mode === 'profit' && d.can_financial) {
      series.push({ name: 'Utilidad bruta', values: d.series.map(function (s) { return Number(s.profit); }) });
      series.push({ name: 'Costo', values: d.series.map(function (s) { return Number(s.cost); }), dashed: true });
    }
    C.area(el, { labels: labels, series: series, labelFormat: shortDate, tooltipTitle: longDate, label: 'Evolución de las ventas' });
    var colors = ['#C5A46D', J.theme() === 'dark' ? '#EEEAE2' : '#151515', J.theme() === 'dark' ? '#6F6A62' : '#B9B2A5'];
    root.querySelector('[data-evo-legend]').innerHTML = series.map(function (s, i) {
      return '<span><i style="background:' + colors[i] + '"></i>' + esc(s.name) + '</span>';
    }).join('');
  }

  function renderBranches(d) {
    var el = root.querySelector('[data-branches]');
    var max = Math.max.apply(null, d.branches.map(function (b) { return Number(b.total); }).concat([0]));
    if (!d.branches.length) { el.innerHTML = emptyBlock('Aún no hay sucursales de venta.'); return; }
    el.innerHTML = d.branches.map(function (b) {
      var w = max > 0 ? Math.max(2, (Number(b.total) / max) * 100) : 0;
      return '<div class="hbar"><div class="hb-top"><span>' + esc(b.name) + '</span><span>' + money(b.total) + '</span></div>' +
        '<div class="hb-track"><div class="hb-fill" style="width:' + w + '%"></div></div>' +
        '<div class="muted" style="font-size:11.5px;margin-top:4px">' + num(b.tx) + ' transacciones</div></div>';
    }).join('');
  }

  function renderTop(d) {
    var el = root.querySelector('[data-top]');
    if (!d.top_products.length) { el.innerHTML = '<li style="display:block">' + emptyBlock('Sin ventas en el periodo.') + '</li>'; return; }
    var max = Number(d.top_products[0].total) || 1;
    el.innerHTML = d.top_products.map(function (p, i) {
      var media = p.thumb_url ? '<img class="thumb" src="' + esc(p.thumb_url) + '" alt="" loading="lazy">' : '<span class="thumb" style="display:grid;place-items:center;color:var(--faint)">' + icon('bottle', 'icon-sm') + '</span>';
      var q = J.qty(p.qty, p.unit === 'und' ? 'und' : p.unit);
      return '<li><span class="rank-pos">' + (i + 1) + '</span>' + media + '<div class="info"><strong>' + esc(p.name) + '</strong><small>' + esc((p.brand ? p.brand + ' · ' : '') + q) + '</small>' +
        '<div class="bar"><span style="width:' + Math.max(3, (Number(p.total) / max) * 100) + '%"></span></div></div><span class="amount">' + money(p.total) + '</span></li>';
    }).join('');
  }

  function renderDonut(sel, legendSel, rows, label) {
    var el = root.querySelector(sel), lg = root.querySelector(legendSel);
    if (!rows.length) { el.parentElement.style.display = 'block'; el.innerHTML = emptyBlock('Sin datos en el periodo.'); lg.innerHTML = ''; return; }
    el.parentElement.style.display = '';
    var top = rows.slice(0, 6);
    if (rows.length > 6) {
      var rest = rows.slice(6).reduce(function (a, r) { return a + Number(r.total); }, 0);
      top.push({ name: 'Otros', total: rest });
    }
    var total = rows.reduce(function (a, r) { return a + Number(r.total); }, 0);
    C.donut(el, { labels: top.map(function (r) { return r.name; }), values: top.map(function (r) { return Number(r.total); }), centerLabel: label, centerValue: C.compact(total) }, lg);
  }

  function renderSellers(d) {
    var tb = root.querySelector('[data-sellers] tbody');
    if (!d.sellers.length) { tb.innerHTML = '<tr><td colspan="5">' + emptyBlock('Sin ventas de vendedores en el periodo.') + '</td></tr>'; return; }
    tb.innerHTML = d.sellers.map(function (s) {
      var initials = s.name.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
      var avg = Number(s.tx) ? Number(s.total) / Number(s.tx) : 0;
      return '<tr><td class="cell-main"><div class="row"><span class="avatar">' + esc(initials) + '</span><strong>' + esc(s.name) + '</strong></div></td>' +
        '<td class="num" data-label="Ventas">' + num(s.tx) + '</td><td class="num" data-label="Ticket prom.">' + money(Math.round(avg)) + '</td>' +
        '<td class="num" data-label="Descuentos">' + money(s.discounts) + '</td><td class="num" data-label="Facturado"><strong>' + money(s.total) + '</strong></td></tr>';
    }).join('');
  }

  function renderAlerts(d) {
    var k = d.kpi, items = [];
    if (links.can_inventory) {
      items.push([links.inventory_out, 'danger', 'alert', 'Productos agotados', 'Sin existencias disponibles', k.out_of_stock]);
      items.push([links.inventory_low, 'warning', 'boxes', 'Existencias bajas', 'En o por debajo del mínimo', k.low_stock]);
    }
    items.push([links.transfers, 'info', 'transfer', 'Transferencias pendientes', 'Por aprobar, despachar o recibir', k.pending_transfers]);
    if (links.can_purchases) items.push([links.purchases, 'gold', 'truck', 'Compras por recibir', 'Órdenes enviadas o parciales', k.pending_purchases]);
    if (links.can_approvals) items.push([links.approvals, 'gold', 'percent', 'Descuentos por autorizar', 'Solicitudes de caja', k.pending_approvals]);
    root.querySelector('[data-alerts]').innerHTML = items.map(function (a) {
      return '<li><a href="' + esc(a[0]) + '"><span class="ico ' + a[1] + '">' + icon(a[2], 'icon-sm') + '</span><span class="txt">' + esc(a[3]) + '<small>' + esc(a[4]) + '</small></span><span class="val">' + num(a[5]) + '</span>' + icon('chevron-right', 'icon-sm faint') + '</a></li>';
    }).join('');
  }

  function renderActivity(d) {
    var el = root.querySelector('[data-activity]');
    if (!d.activity.length) { el.innerHTML = '<li style="padding:0">' + emptyBlock('Todavía no hay actividad registrada.') + '</li>'; return; }
    el.innerHTML = d.activity.map(function (a) {
      return '<li><div class="t-main">' + esc(a.description || a.action) + '</div><div class="t-meta">' + esc((a.user_name || 'Sistema') + (a.branch_name ? ' · ' + a.branch_name : '') + ' · ' + a.ago) + '</div></li>';
    }).join('');
  }

  function render(d) {
    data = d;
    renderKpis(d); renderEvolution(d); renderBranches(d); renderTop(d);
    renderDonut('[data-chart-categories]', '[data-categories-legend]', d.categories, 'Total');
    renderDonut('[data-chart-methods]', '[data-methods-legend]', d.methods, 'Cobrado');
    renderSellers(d); renderAlerts(d); renderActivity(d);
  }

  function load() {
    var params = new URLSearchParams(new FormData(form));
    if (params.get('range') !== 'custom') { params.delete('from'); params.delete('to'); }
    ['branch', 'user'].forEach(function (k) { if (!params.get(k)) params.delete(k); });
    history.replaceState(null, '', location.pathname + '?' + params.toString());
    root.style.opacity = '.55';
    root.style.transition = 'opacity .15s';
    J.api('/api/dashboard?' + params.toString()).then(function (d) {
      render(d);
      var lbl = document.querySelector('[data-range-label]');
      var f = d.filters;
      if (lbl) lbl.textContent = f.from.split('-').reverse().join('/') + ' — ' + f.to.split('-').reverse().join('/');
    }).catch(function (e) { J.toast(e.message, 'error'); }).finally(function () { root.style.opacity = ''; });
  }

  form.addEventListener('change', function (e) {
    if (e.target.name === 'range') {
      form.querySelector('[data-custom-range]').classList.toggle('hidden', e.target.value !== 'custom');
      if (e.target.value === 'custom') return;
    }
    load();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); load(); });

  root.querySelectorAll('[data-evo-mode] button').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      root.querySelectorAll('[data-evo-mode] button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      root.querySelector('[data-evo-sub]').textContent = mode === 'profit' ? 'Facturación, costo de lo vendido y utilidad bruta estimada' : 'Facturación diaria del periodo';
      renderEvolution(data);
    });
  });

  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { render(data); }, 200); });
  document.addEventListener('theme:change', function () { render(data); });
  render(data);
})();

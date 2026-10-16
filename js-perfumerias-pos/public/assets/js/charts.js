/* ==========================================================================
   Gráficas SVG ligeras (sin dependencias) con la paleta de la marca.
   JSPCharts.area(el, {labels, series:[{name, values, key}], format})
   JSPCharts.bars(el, {labels, values, format})
   JSPCharts.donut(el, {labels, values, format}, legendEl)
   ========================================================================== */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var J = window.JSP || {};

  function isDark() { return J.theme ? J.theme() === 'dark' : false; }
  function palette() {
    var dark = isDark();
    return {
      ink: dark ? '#EEEAE2' : '#151515',
      gold: '#C5A46D',
      grey: dark ? '#6F6A62' : '#B9B2A5',
      grid: dark ? '#2B2A27' : '#E7E1D6',
      text: dark ? '#7B766E' : '#9C968D',
      surface: dark ? '#181817' : '#FFFFFF',
      cats: dark
        ? ['#C5A46D', '#EEEAE2', '#8C7B62', '#6F6A62', '#DCCBA8', '#A29C92', '#4A4743']
        : ['#C5A46D', '#151515', '#8C7B62', '#B9B2A5', '#5E5A54', '#DCCBA8', '#3E3A35']
    };
  }
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / exp;
    var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * exp;
  }
  function compact(v) {
    var n = Math.abs(v);
    if (n >= 1e9) return (v / 1e9).toFixed(1).replace('.0', '') + ' MM';
    if (n >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + ' M';
    if (n >= 1e3) return Math.round(v / 1e3) + ' mil';
    return String(Math.round(v));
  }
  function tooltip(container) {
    var t = container.querySelector('.tooltip');
    if (!t) { t = document.createElement('div'); t.className = 'tooltip'; container.appendChild(t); }
    return t;
  }
  function fmt(opts) { return opts.format || (J.money || String); }

  /* ---------------- Área / líneas ---------------- */
  function area(container, opts) {
    container.innerHTML = '';
    var p = palette();
    var W = Math.max(container.clientWidth, 280), H = opts.height || 260;
    var pad = { t: 14, r: 12, b: 28, l: 54 };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'Gráfica' }, container);
    var labels = opts.labels || [];
    var series = opts.series || [];
    var n = labels.length;
    var max = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { max = Math.max(max, Number(v) || 0); }); });
    max = niceMax(max * 1.08);
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var x = function (i) { return pad.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1)); };
    var y = function (v) { return pad.t + ih - (Number(v) / max) * ih; };

    var axis = el('g', { class: 'axis' }, svg);
    for (var g = 0; g <= 4; g++) {
      var gv = (max / 4) * g, gy = y(gv);
      el('line', { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: 'grid-line' }, axis);
      var tl = el('text', { x: pad.l - 10, y: gy + 4, 'text-anchor': 'end' }, axis);
      tl.textContent = compact(gv);
    }
    var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
    labels.forEach(function (l, i) {
      if (i % step !== 0 && i !== n - 1) return;
      if (i !== n - 1 && i % step === 0 && n - 1 - i < step * .6) return;
      var t = el('text', { x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle') }, axis);
      t.textContent = opts.labelFormat ? opts.labelFormat(l) : l;
    });

    var defs = el('defs', {}, svg);
    series.forEach(function (s, si) {
      var color = s.color || (si === 0 ? p.gold : si === 1 ? p.ink : p.grey);
      var id = 'grad-' + Math.random().toString(36).slice(2);
      var lg = el('linearGradient', { id: id, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': si === 0 ? .28 : .06 }, lg);
      el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, lg);
      var d = '';
      s.values.forEach(function (v, i) { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; });
      if (n > 1 && si === 0) {
        el('path', { d: d + 'L' + x(n - 1) + ' ' + (pad.t + ih) + ' L' + x(0) + ' ' + (pad.t + ih) + ' Z', fill: 'url(#' + id + ')' }, svg);
      }
      var path = el('path', { d: d, fill: 'none', stroke: color, 'stroke-width': si === 0 ? 2.4 : 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '4 4' : '' }, svg);
      if (path.getTotalLength && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var len = path.getTotalLength();
        path.style.strokeDasharray = s.dashed ? '4 4' : len;
        if (!s.dashed) {
          path.style.strokeDashoffset = len;
          path.getBoundingClientRect();
          path.style.transition = 'stroke-dashoffset .9s cubic-bezier(.2,.7,.2,1)';
          path.style.strokeDashoffset = 0;
        }
      }
      s._color = color;
    });

    // Interacción
    var guide = el('line', { y1: pad.t, y2: pad.t + ih, stroke: p.text, 'stroke-dasharray': '3 3', opacity: 0 }, svg);
    var dots = series.map(function (s) { return el('circle', { r: 4.5, fill: p.surface, stroke: s._color, 'stroke-width': 2, opacity: 0 }, svg); });
    var tip = tooltip(container);
    var overlay = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' }, svg);
    var move = function (evt) {
      var rect = svg.getBoundingClientRect();
      var px = ((evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left) * (W / rect.width);
      var i = n <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', .6);
      var html = '<div class="tt-title">' + J.escapeHtml(opts.tooltipTitle ? opts.tooltipTitle(labels[i]) : labels[i]) + '</div>';
      series.forEach(function (s, si) {
        dots[si].setAttribute('cx', x(i)); dots[si].setAttribute('cy', y(s.values[i])); dots[si].setAttribute('opacity', 1);
        html += '<div class="tt-row"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + s._color + ';margin-right:6px"></i>' + J.escapeHtml(s.name) + '</span><b>' + fmt(opts)(s.values[i]) + '</b></div>';
      });
      tip.innerHTML = html;
      var left = (x(i) / W) * rect.width;
      tip.style.left = Math.min(Math.max(0, left - 80), rect.width - 170) + 'px';
      tip.style.top = '-6px';
      tip.classList.add('is-visible');
    };
    var leave = function () { tip.classList.remove('is-visible'); guide.setAttribute('opacity', 0); dots.forEach(function (d) { d.setAttribute('opacity', 0); }); };
    overlay.addEventListener('mousemove', move);
    overlay.addEventListener('touchstart', move, { passive: true });
    overlay.addEventListener('mouseleave', leave);
  }

  /* ---------------- Barras verticales ---------------- */
  function bars(container, opts) {
    container.innerHTML = '';
    var p = palette();
    var W = Math.max(container.clientWidth, 260), H = opts.height || 240;
    var pad = { t: 12, r: 8, b: 34, l: 50 };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'Gráfica de barras' }, container);
    var vals = (opts.values || []).map(Number);
    var n = vals.length;
    var max = niceMax(Math.max.apply(null, vals.concat([0])) * 1.1);
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var axis = el('g', { class: 'axis' }, svg);
    for (var g = 0; g <= 4; g++) {
      var gv = (max / 4) * g, gy = pad.t + ih - (gv / max) * ih;
      el('line', { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: 'grid-line' }, axis);
      var tl = el('text', { x: pad.l - 8, y: gy + 4, 'text-anchor': 'end' }, axis);
      tl.textContent = compact(gv);
    }
    var bw = Math.min(46, (iw / Math.max(n, 1)) * .56);
    var tip = tooltip(container);
    vals.forEach(function (v, i) {
      var cx = pad.l + (iw / n) * (i + .5);
      var h = (v / max) * ih;
      var r = el('rect', { x: cx - bw / 2, y: pad.t + ih - h, width: bw, height: Math.max(h, 0), rx: 6, fill: i === 0 ? p.gold : p.ink, opacity: i === 0 ? 1 : .86 }, svg);
      r.style.transformOrigin = cx + 'px ' + (pad.t + ih) + 'px';
      r.style.animation = 'grow-y .6s cubic-bezier(.2,.7,.2,1)';
      var lbl = (opts.labels || [])[i] || '';
      var t = el('text', { x: cx, y: H - 12, 'text-anchor': 'middle' }, axis);
      t.textContent = lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl;
      r.addEventListener('mouseenter', function () {
        tip.innerHTML = '<div class="tt-title">' + J.escapeHtml(lbl) + '</div><div class="tt-row"><span>Total</span><b>' + fmt(opts)(v) + '</b></div>';
        var rect = svg.getBoundingClientRect();
        tip.style.left = Math.min(Math.max(0, (cx / W) * rect.width - 80), rect.width - 170) + 'px';
        tip.style.top = Math.max(0, ((pad.t + ih - h) / H) * rect.height - 60) + 'px';
        tip.classList.add('is-visible');
      });
      r.addEventListener('mouseleave', function () { tip.classList.remove('is-visible'); });
    });
  }

  /* ---------------- Dona ---------------- */
  function donut(container, opts, legendEl) {
    container.innerHTML = '';
    var p = palette();
    var vals = (opts.values || []).map(Number);
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var S = 150, R = 66, r = 46, C = S / 2;
    var svg = el('svg', { viewBox: '0 0 ' + S + ' ' + S, role: 'img', 'aria-label': opts.label || 'Distribución' }, container);
    if (total <= 0) {
      el('circle', { cx: C, cy: C, r: (R + r) / 2, fill: 'none', stroke: p.grid, 'stroke-width': R - r }, svg);
    }
    var a0 = -Math.PI / 2;
    var tip = tooltip(container);
    vals.forEach(function (v, i) {
      if (v <= 0) return;
      var a1 = a0 + (v / total) * Math.PI * 2;
      var large = a1 - a0 > Math.PI ? 1 : 0;
      var gap = vals.length > 1 ? .012 : 0;
      var s0 = a0 + gap, s1 = a1 - gap;
      if (s1 <= s0) { a0 = a1; return; }
      var d = 'M' + (C + R * Math.cos(s0)) + ' ' + (C + R * Math.sin(s0)) +
        ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + (C + R * Math.cos(s1)) + ' ' + (C + R * Math.sin(s1)) +
        ' L' + (C + r * Math.cos(s1)) + ' ' + (C + r * Math.sin(s1)) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + (C + r * Math.cos(s0)) + ' ' + (C + r * Math.sin(s0)) + ' Z';
      if (vals.filter(function (x) { return x > 0; }).length === 1) {
        el('circle', { cx: C, cy: C, r: (R + r) / 2, fill: 'none', stroke: p.cats[i % p.cats.length], 'stroke-width': R - r }, svg);
      } else {
        var path = el('path', { d: d, fill: p.cats[i % p.cats.length] }, svg);
        path.addEventListener('mouseenter', function () {
          tip.innerHTML = '<div class="tt-title">' + J.escapeHtml(opts.labels[i]) + '</div><div class="tt-row"><span>' + Math.round((v / total) * 100) + ' %</span><b>' + fmt(opts)(v) + '</b></div>';
          tip.style.left = '0px'; tip.style.top = '-10px'; tip.classList.add('is-visible');
        });
        path.addEventListener('mouseleave', function () { tip.classList.remove('is-visible'); });
      }
      a0 = a1;
    });
    var t1 = el('text', { x: C, y: C - 2, 'text-anchor': 'middle', 'font-size': 10, fill: p.text, 'font-family': 'Manrope, sans-serif', 'letter-spacing': '.08em' }, svg);
    t1.textContent = (opts.centerLabel || 'TOTAL').toUpperCase();
    var t2 = el('text', { x: C, y: C + 15, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: p.ink, 'font-family': 'Manrope, sans-serif' }, svg);
    t2.textContent = opts.centerValue || compact(total);
    if (legendEl) {
      legendEl.innerHTML = (opts.labels || []).map(function (l, i) {
        var pctv = total > 0 ? Math.round((vals[i] / total) * 100) : 0;
        return '<li><i style="background:' + p.cats[i % p.cats.length] + '"></i><span class="lbl">' + J.escapeHtml(l) + '</span><span class="v">' + fmt(opts)(vals[i]) + '</span><span class="p">' + pctv + ' %</span></li>';
      }).join('');
    }
  }

  var style = document.createElement('style');
  style.textContent = '@keyframes grow-y{from{transform:scaleY(0)}}@media (prefers-reduced-motion: reduce){svg rect{animation:none!important}}';
  document.head.appendChild(style);

  window.JSPCharts = { area: area, bars: bars, donut: donut, compact: compact };
})();

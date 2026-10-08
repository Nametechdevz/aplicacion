import { useEffect, useMemo, useRef, useState } from 'react';

export interface ColumnDatum {
  key: string;
  label: string;
  /** Texto largo para el tooltip y la tabla accesible. */
  fullLabel: string;
  value: number;
  extra?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Gráfica de columnas de una sola serie: barras finas con la punta redondeada, rejilla discreta,
 * etiqueta solo en el máximo y tooltip al pasar el ratón o tocar. Incluye una tabla para lectores de pantalla.
 */
export function ColumnChart({
  data,
  format,
  formatAxis,
  height = 240,
  title,
}: {
  data: ColumnDatum[];
  format: (v: number) => string;
  formatAxis?: (v: number) => string;
  height?: number;
  title: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 22, right: 8, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(4, band * 0.62));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const maxIdx = useMemo(() => {
    let idx = -1;
    data.forEach((d, i) => {
      if (d.value > 0 && (idx < 0 || d.value > data[idx].value)) idx = i;
    });
    return idx;
  }, [data]);
  // Etiquetas del eje X sin solaparse.
  const every = Math.max(1, Math.ceil(data.length / Math.floor(innerW / 46)));
  const axis = formatAxis ?? format;
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t === 0 ? '0' : axis(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.left + band * i + band / 2;
          const top = y(d.value);
          const hgt = pad.top + innerH - top;
          const r = Math.min(4, hgt / 2, barW / 2);
          const x0 = cx - barW / 2;
          const path =
            hgt <= 0
              ? ''
              : `M${x0},${pad.top + innerH} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${pad.top + innerH} Z`;
          return (
            <g key={d.key}>
              {hover === i && <rect className="chart-hover-band" x={pad.left + band * i} y={pad.top} width={band} height={innerH} rx={6} />}
              {path && <path className={`chart-bar ${hover !== null && hover !== i ? 'dim' : ''}`} d={path} />}
              {i === maxIdx && hover === null && (
                <text className="chart-value" x={cx} y={top - 7} textAnchor="middle">
                  {axis(d.value)}
                </text>
              )}
              {i % every === 0 && (
                <text className="chart-axis" x={cx} y={height - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
              {/* Zona sensible: toda la columna, más grande que la barra. */}
              <rect
                x={pad.left + band * i}
                y={pad.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          );
        })}
        <line className="chart-baseline" x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} />
      </svg>
      {h && hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(width - 170, Math.max(0, pad.left + band * hover + band / 2 - 85)),
            top: Math.max(0, y(h.value) - 70),
          }}
        >
          <div className="chart-tooltip-title">{h.fullLabel}</div>
          <div className="chart-tooltip-value">{format(h.value)}</div>
          {h.extra && <div className="chart-tooltip-extra">{h.extra}</div>}
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.fullLabel}</th>
              <td>{format(d.value)}</td>
              {d.extra && <td>{d.extra}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista de barras horizontales (magnitud por categoría, un solo tono). */
export function BarList({ items, total }: { items: { label: string; value: number; hint?: string }[]; total: number }) {
  return (
    <ul className="barlist">
      {items.map((it) => {
        const pct = total > 0 ? (it.value / total) * 100 : 0;
        return (
          <li key={it.label}>
            <div className="barlist-row">
              <span>{it.label}</span>
              <span className="barlist-num">
                <strong>{it.value}</strong> <span className="muted">· {Math.round(pct)}%</span>
              </span>
            </div>
            <div className="barlist-track" aria-hidden="true">
              <div className="barlist-fill" style={{ width: `${pct}%` }} />
            </div>
            {it.hint && <div className="muted small">{it.hint}</div>}
          </li>
        );
      })}
    </ul>
  );
}

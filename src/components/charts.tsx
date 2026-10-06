"use client";

// Gráficas del perfil en SVG propio. Una serie por gráfica (color de acento),
// marcas finas, rejilla de 1px, etiqueta solo en el punto clave y dato al
// pasar el dedo o el foco. Cada gráfica tiene su tabla en «Ver datos».
import { useState } from "react";

const W = 320;

function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

/** Columna con el extremo de datos redondeado (4px) y la base recta. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  // x, y en porcentaje del contenedor para que siga al SVG escalado.
  const alignRight = x > 60;
  return (
    <div
      className="chart-tooltip"
      style={{
        left: alignRight ? undefined : `${x}%`,
        right: alignRight ? `${100 - x}%` : undefined,
        top: `${y}%`,
      }}
    >
      {children}
    </div>
  );
}

export function WeeklyColumns({
  data,
  label,
}: {
  data: { key: string; short: string; long: string; value: number; detail: string }[];
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const H = 150;
  const top = 18;
  const bottom = 124;
  const left = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max, 2);
  const yMax = Math.ceil(max / step) * step;
  const slot = (W - left * 2) / data.length;
  const barW = Math.min(24, slot * 0.55);
  const y = (v: number) => bottom - (v / yMax) * (bottom - top);
  const last = data.length - 1;

  return (
    <div className="chart" onMouseLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <line x1={left} x2={W - left} y1={y(yMax)} y2={y(yMax)} className="chart-grid" />
        <text x={W - left} y={y(yMax) - 5} textAnchor="end" className="chart-tick">
          {fmt(yMax)}
        </text>
        <line x1={left} x2={W - left} y1={bottom} y2={bottom} className="chart-axis" />
        {data.map((d, i) => {
          const cx = left + slot * i + slot / 2;
          const h = bottom - y(d.value);
          return (
            <g key={d.key}>
              {d.value > 0 && (
                <path
                  d={columnPath(cx - barW / 2, y(d.value), barW, h)}
                  className={`chart-mark ${active !== null && active !== i ? "chart-dim" : ""}`}
                />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="chart-tick">
                {d.short}
              </text>
              {i === last && d.value > 0 && (
                <text x={cx} y={y(d.value) - 6} textAnchor="middle" className="chart-value">
                  {fmt(d.value)}
                </text>
              )}
              {/* zona táctil: toda la franja de la semana */}
              <rect
                x={left + slot * i}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.long}: ${d.detail}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
              />
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <Tooltip x={((left + slot * active + slot / 2) / W) * 100} y={4}>
          <strong>{data[active].long}</strong>
          <span>{data[active].detail}</span>
        </Tooltip>
      )}
      <details className="chart-table">
        <summary>Ver datos</summary>
        <table>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.long}</th>
                <td>{d.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function ProgressLine({
  points,
  unit,
  label,
}: {
  points: { key: string; short: string; long: string; value: number; detail: string }[];
  unit: string;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const H = 170;
  const top = 20;
  const bottom = 140;
  const left = 34;
  const right = 44;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = niceStep(Math.max(hi - lo, hi * 0.1, 1), 3);
  const yMin = Math.max(0, Math.floor((lo - step / 2) / step) * step);
  const yMax = Math.ceil((hi + step / 2) / step) * step;
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + 1e-9; t += step) ticks.push(t);
  const x = (i: number) => (points.length === 1 ? (left + W - right) / 2 : left + (i * (W - left - right)) / (points.length - 1));
  const y = (v: number) => bottom - ((v - yMin) / (yMax - yMin)) * (bottom - top);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${bottom} L${x(0)},${bottom} Z`;
  const end = points.length - 1;

  function nearest(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const vx = ((event.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - vx) < Math.abs(x(best) - vx)) best = i;
    setActive(best);
  }

  return (
    <div className="chart" onMouseLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerMove={nearest}
        onPointerDown={nearest}
        onFocus={() => setActive(end)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? end) - 1));
          if (e.key === "ArrowRight") setActive((a) => Math.min(end, (a ?? end) + 1));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="chart-tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        {points.length > 1 && <path d={area} className="chart-area" />}
        {points.length > 1 && <path d={line} className="chart-line" />}
        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} className="chart-crosshair" />
        )}
        <circle cx={x(end)} cy={y(points[end].value)} r={4} className="chart-dot" />
        {active !== null && active !== end && (
          <circle cx={x(active)} cy={y(points[active].value)} r={4} className="chart-dot" />
        )}
        <text x={x(end) + 8} y={y(points[end].value) + 4} className="chart-value">
          {fmt(points[end].value)} {unit}
        </text>
        <text x={x(0)} y={H - 8} textAnchor={points.length === 1 ? "middle" : "start"} className="chart-tick">
          {points[0].short}
        </text>
        {points.length > 1 && (
          <text x={x(end)} y={H - 8} textAnchor="end" className="chart-tick">
            {points[end].short}
          </text>
        )}
      </svg>
      {active !== null && (
        <Tooltip x={(x(active) / W) * 100} y={2}>
          <strong>{points[active].long}</strong>
          <span>{points[active].detail}</span>
        </Tooltip>
      )}
      <details className="chart-table">
        <summary>Ver datos</summary>
        <table>
          <tbody>
            {points.map((p) => (
              <tr key={p.key}>
                <th scope="row">{p.long}</th>
                <td>{p.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Barras horizontales (HTML): una por categoría, valor en la punta. */
export function HorizontalBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars">
      {data.map((d) => (
        <div className="hbar-row" key={d.label}>
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `calc((100% - 36px) * ${d.value / max})` }} />
            <span className="hbar-value">{d.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

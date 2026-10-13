/** Hafif SVG grafikler (kütüphanesiz, tema-renkli). */
import { useState } from "react";

/** Cumulative Flow Diagram: alt bant = tamamlanan, üst bant = WIP. */
export function CFDChart({ data }: { data: { week: string; created: number; done: number; wip: number }[] }) {
  const W = 760, H = 300, pad = { l: 44, r: 12, t: 12, b: 28 };
  if (data.length < 2) return <div className="empty">yeterli veri yok</div>;
  const max = Math.max(...data.map((d) => d.created), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const areaDone = `M${x(0)},${y(0)} ` + data.map((d, i) => `L${x(i)},${y(d.done)}`).join(" ") + ` L${x(data.length - 1)},${y(0)} Z`;
  const areaWip = data.map((d, i) => `${x(i)},${y(d.created)}`).join(" ") + " " + [...data].reverse().map((d, i) => `${x(data.length - 1 - i)},${y(d.done)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{t}</text>
        </g>
      ))}
      <polygon points={areaWip} fill="var(--amber)" opacity="0.28" />
      <path d={areaDone} fill="var(--teal)" opacity="0.5" />
      <polyline points={data.map((d, i) => `${x(i)},${y(d.created)}`).join(" ")} fill="none" stroke="var(--amber)" strokeWidth="1.5" />
      <polyline points={data.map((d, i) => `${x(i)},${y(d.done)}`).join(" ")} fill="none" stroke="var(--teal)" strokeWidth="1.5" />
      <text x={pad.l} y={H - 8} fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{data[0].week}</text>
      <text x={W - pad.r} y={H - 8} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{data[data.length - 1].week}</text>
    </svg>
  );
}

/** SVG içinde değer balonu (hover). */
function Tip({ x, y, W, lines }: { x: number; y: number; W: number; lines: string[] }) {
  const w = Math.max(...lines.map((l) => l.length)) * 6 + 14, h = lines.length * 13 + 8;
  let bx = x + 8; if (bx + w > W) bx = x - w - 8; if (bx < 0) bx = 2;
  let by = y - h - 6; if (by < 0) by = y + 10;
  return (
    <g pointerEvents="none">
      <rect x={bx} y={by} width={w} height={h} fill="#0a0d12" stroke="var(--line-2)" rx="2" />
      {lines.map((l, i) => <text key={i} x={bx + 7} y={by + 15 + i * 13} fontSize="10" fontFamily="var(--mono)" fill={i === 0 ? "var(--bone)" : "var(--dim)"}>{l}</text>)}
    </g>
  );
}

/** Çizgi grafiği + hareketli ortalama + hover crosshair. */
export function LineChart({ data, roll = 4 }: { data: { label: string; value: number }[]; roll?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 760, H = 240, pad = { l: 36, r: 12, t: 12, b: 30 };
  if (data.length < 2) return <div className="empty">yeterli veri yok</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ma = data.map((_, i) => { const a = Math.max(0, i - roll + 1), seg = data.slice(a, i + 1); return seg.reduce((s, d) => s + d.value, 0) / seg.length; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setHi(null)}>
      {[0, 0.5, 1].map((f) => { const yy = pad.t + ih - f * ih; return <g key={f}><line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="var(--line)" /><text x={pad.l - 5} y={yy + 3} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{Math.round(max * f)}</text></g>; })}
      <polyline points={data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ")} fill="none" stroke="var(--teal)" strokeWidth="1.2" opacity="0.6" />
      <polyline points={ma.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--amber)" strokeWidth="2" />
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r={hi === i ? 4 : 1.8} fill={hi === i ? "var(--amber)" : "var(--teal)"} opacity="0.9" />)}
      {hi != null && <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + ih} stroke="rgba(214,221,210,0.2)" strokeDasharray="3 3" />}
      {data.map((d, i) => <rect key={"h" + i} x={x(i) - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHi(i)} />)}
      {hi != null && <Tip x={x(hi)} y={y(data[hi].value)} W={W} lines={[data[hi].label, `değer: ${data[hi].value}`, `ort: ${ma[hi].toFixed(1)}`]} />}
      <text x={pad.l} y={H - 8} fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{data[0].label}</text>
      <text x={W - pad.r} y={H - 8} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{data[data.length - 1].label}</text>
    </svg>
  );
}

/** Kategorik palet — temayla uyumlu, kağıtta da okunur donuk tonlar. */
export const CAT = ["#c99a3b", "#5a9e92", "#8a7fb5", "#b5705a", "#6d93c4", "#9aae5f", "#b58aa0", "#7fa89b", "#c2a86a", "#9c8f7a"];

/** Donut / halka — dağılım (durum, tür, öncelik). Sağda açıklama + yüzde. */
export function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const items = data.filter((d) => d.value > 0).slice(0, 10);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="empty">veri yok</div>;
  const R = 70, r = 42, cx = 92, cy = 92;
  let acc = 0;
  const arcs = items.map((d, i) => {
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2; acc += d.value;
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const dPath = `M${p(a0, R)} A${R},${R} 0 ${big} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${big} 0 ${p(a0, r)} Z`;
    return { d: dPath, color: CAT[i % CAT.length], label: d.label, value: d.value, pct: Math.round((d.value / total) * 100) };
  });
  return (
    <div className="rp-donut">
      <svg viewBox="0 0 184 184" width="184" height="184" style={{ flexShrink: 0 }} onMouseLeave={() => setHi(null)}>
        {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} opacity={hi == null || hi === i ? 1 : 0.35} stroke="var(--paper, #fff)" strokeWidth="1" onMouseEnter={() => setHi(i)} />)}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontFamily="var(--mono)" fontWeight="700" fill="currentColor">{total.toLocaleString("tr-TR")}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">TOPLAM</text>
      </svg>
      <div className="rp-legend">
        {arcs.map((a, i) => (
          <div className={`rp-leg ${hi === i ? "on" : ""}`} key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
            <span className="rp-leg-sw" style={{ background: a.color }} />
            <span className="rp-leg-l">{a.label}</span>
            <span className="rp-leg-v num">{a.value.toLocaleString("tr-TR")}</span>
            <span className="rp-leg-p num">%{a.pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Yatay bar — top-N sıralı (kişi, repo). Uzun etiketler için ideal. */
export function HBarChart({ data, color = "var(--amber)", unit = "" }: { data: { label: string; value: number }[]; color?: string; unit?: string }) {
  const items = data.slice(0, 14);
  if (!items.length) return <div className="empty">veri yok</div>;
  const max = Math.max(...items.map((d) => d.value), 1);
  const rowH = 22, labelW = 130, W = 760, barW = W - labelW - 54;
  const H = items.length * rowH + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {items.map((d, i) => {
        const y = i * rowH + 4, w = (d.value / max) * barW;
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + rowH * 0.62} textAnchor="end" fontSize="10" fill="currentColor">{d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label}</text>
            <rect x={labelW} y={y + 3} width={barW} height={rowH - 9} fill="var(--line)" opacity="0.4" />
            <rect x={labelW} y={y + 3} width={Math.max(1, w)} height={rowH - 9} fill={color} opacity="0.85" />
            <text x={labelW + w + 5} y={y + rowH * 0.62} fontSize="10" fontFamily="var(--mono)" fill="var(--dim)">{d.value.toLocaleString("tr-TR")}{unit}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Yığılmış bar — satır boyutu × sütun kırılımı (crosstab cells). Açıklamalı. */
export function StackedBar({ cells }: { cells: { row: string; col: string; value: number | null }[] }) {
  const rows: string[] = []; const cols: string[] = []; const map = new Map<string, number>();
  for (const c of cells) {
    if (!rows.includes(c.row)) rows.push(c.row);
    if (!cols.includes(c.col)) cols.push(c.col);
    map.set(`${c.row}\u0000${c.col}`, Number(c.value ?? 0));
  }
  const shown = rows.slice(0, 16);
  if (!shown.length || !cols.length) return <div className="empty">veri yok</div>;
  const totals = shown.map((r) => cols.reduce((s, c) => s + (map.get(`${r}\u0000${c}`) ?? 0), 0));
  const max = Math.max(...totals, 1);
  const W = 760, pad = { l: 36, r: 12, t: 12, b: 52 }, ih = 200;
  const iw = W - pad.l - pad.r, bw = iw / shown.length, H = ih + pad.t + pad.b + 22;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {[0, 0.5, 1].map((f) => { const yy = pad.t + ih - f * ih; return <g key={f}><line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="var(--line)" /><text x={pad.l - 5} y={yy + 3} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{Math.round(max * f)}</text></g>; })}
      {shown.map((rk, i) => {
        let yAcc = pad.t + ih;
        return (
          <g key={rk}>
            {cols.map((ck, ci) => {
              const v = map.get(`${rk}\u0000${ck}`) ?? 0; if (!v) return null;
              const h = (v / max) * ih; yAcc -= h;
              return <rect key={ck} x={pad.l + i * bw + bw * 0.16} y={yAcc} width={bw * 0.68} height={h} fill={CAT[ci % CAT.length]} opacity="0.88" />;
            })}
            <text x={pad.l + i * bw + bw / 2} y={pad.t + ih + 14} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)" transform={`rotate(-40 ${pad.l + i * bw + bw / 2} ${pad.t + ih + 14})`}>{rk.length > 16 ? rk.slice(0, 15) + "…" : rk}</text>
          </g>
        );
      })}
      {cols.slice(0, 6).map((ck, ci) => (
        <g key={ck} transform={`translate(${pad.l + ci * 120}, ${H - 8})`}>
          <rect width="9" height="9" y="-8" fill={CAT[ci % CAT.length]} />
          <text x="13" fontSize="9" fill="currentColor">{ck.length > 14 ? ck.slice(0, 13) + "…" : ck}</text>
        </g>
      ))}
    </svg>
  );
}

/** Teslim akışı: biriken backlog (alan) + oluşturulan/çözülen (çizgi). */
export function TrendChart({ data }: { data: { period: string; created: number; resolved: number; backlog: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 760, H = 260, pad = { l: 40, r: 12, t: 14, b: 42 };
  if (data.length < 2) return <div className="empty">yeterli veri yok</div>;
  const max = Math.max(...data.map((d) => Math.max(d.created, d.resolved, d.backlog)), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const area = `M${x(0)},${y(0)} ` + data.map((d, i) => `L${x(i)},${y(d.backlog)}`).join(" ") + ` L${x(data.length - 1)},${y(0)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setHi(null)}>
      {[0, 0.5, 1].map((f) => { const yy = pad.t + ih - f * ih; return <g key={f}><line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="var(--line)" /><text x={pad.l - 5} y={yy + 3} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{Math.round(max * f)}</text></g>; })}
      <path d={area} fill="#6d93c4" opacity="0.14" />
      <polyline points={data.map((d, i) => `${x(i)},${y(d.backlog)}`).join(" ")} fill="none" stroke="#6d93c4" strokeWidth="1.3" strokeDasharray="4 3" opacity="0.8" />
      <polyline points={data.map((d, i) => `${x(i)},${y(d.created)}`).join(" ")} fill="none" stroke="var(--amber)" strokeWidth="2" />
      <polyline points={data.map((d, i) => `${x(i)},${y(d.resolved)}`).join(" ")} fill="none" stroke="var(--teal)" strokeWidth="2" />
      {data.map((d, i) => <rect key={i} x={x(i) - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHi(i)} />)}
      {hi != null && <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + ih} stroke="rgba(150,150,150,0.3)" strokeDasharray="3 3" />}
      {data.filter((_, i) => i % Math.ceil(data.length / 8) === 0).map((d) => { const i = data.indexOf(d); return <text key={i} x={x(i)} y={H - 24} textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill="var(--dim)">{d.period}</text>; })}
      {hi != null && <Tip x={x(hi)} y={y(data[hi].backlog)} W={W} lines={[data[hi].period, `açılan: ${data[hi].created}`, `çözülen: ${data[hi].resolved}`, `backlog: ${data[hi].backlog}`]} />}
      {[["Açılan", "var(--amber)"], ["Çözülen", "var(--teal)"], ["Backlog", "#6d93c4"]].map(([l, c], i) => (
        <g key={l} transform={`translate(${pad.l + i * 110}, ${H - 8})`}><rect width="12" height="3" y="-3" fill={c} /><text x="16" fontSize="9" fill="currentColor">{l}</text></g>
      ))}
    </svg>
  );
}

/** Dikey bar grafiği + hover. */
export function BarChart({ data, color = "var(--amber)", unit = "" }: { data: { label: string; value: number }[]; color?: string; unit?: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 760, H = 260, pad = { l: 36, r: 12, t: 12, b: 48 };
  if (data.length === 0) return <div className="empty">veri yok</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setHi(null)}>
      {[0, 0.5, 1].map((f) => {
        const v = Math.round(max * f), yy = pad.t + ih - f * ih;
        return <g key={f}><line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="var(--line)" /><text x={pad.l - 5} y={yy + 3} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{v}</text></g>;
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * ih, bx = pad.l + i * bw + bw * 0.18, by = pad.t + ih - h;
        return (
          <g key={d.label} onMouseEnter={() => setHi(i)}>
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
            <rect x={bx} y={by} width={bw * 0.64} height={Math.max(0, h)} fill={color} opacity={hi === i ? 1 : 0.8} />
            <text x={bx + bw * 0.32} y={by - 4} textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="var(--bone)">{d.value}{unit}</text>
            <text x={bx + bw * 0.32} y={H - pad.b + 14} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)" transform={`rotate(-40 ${bx + bw * 0.32} ${H - pad.b + 14})`}>{d.label}</text>
          </g>
        );
      })}
      {hi != null && <Tip x={pad.l + hi * bw + bw / 2} y={pad.t + ih - (data[hi].value / max) * ih} W={W} lines={[data[hi].label, `${data[hi].value}${unit}`]} />}
    </svg>
  );
}

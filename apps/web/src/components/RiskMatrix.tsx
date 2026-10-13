import { useState } from "react";

export interface RiskItem { key: string; summary: string; days: number; impact: number; risk: string; score: number; reasons: string[]; kind: string }

const COLOR: Record<string, string> = { "yüksek": "#ff5c6c", "orta": "#f3a82b", "düşük": "#57c98a" };

/**
 * Risk Matrisi: X = bekleme (gün), Y = etki (kaç işi etkiliyor).
 * Sağ-üst köşe = hem uzun bekleyen hem çok şeyi etkileyen = ÖNCE buna bak.
 * Balon rengi risk seviyesi, boyutu composite skor. Hover detay, tıkla seç.
 */
export function RiskMatrix({ items, onPick, ageThreshold = 14 }: { items: RiskItem[]; onPick?: (key: string) => void; ageThreshold?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 760, H = 230, pad = { l: 40, r: 14, t: 12, b: 32 };
  if (items.length === 0) return <div className="empty">kayıt yok</div>;
  const maxDays = Math.max(10, ...items.map((d) => d.days));
  const maxImpact = Math.max(3, ...items.map((d) => d.impact));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (v: number) => pad.l + (v / maxDays) * iw;
  const y = (v: number) => pad.t + ih - (v / maxImpact) * ih;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setHi(null)}>
      {/* tehlike bölgesi (sağ-üst) */}
      <rect x={x(ageThreshold)} y={pad.t} width={W - pad.r - x(ageThreshold)} height={y(1) - pad.t} fill="#ff5c6c" opacity="0.06" />
      {/* eksen çizgileri */}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ih} stroke="var(--line-2)" />
      <line x1={pad.l} y1={pad.t + ih} x2={W - pad.r} y2={pad.t + ih} stroke="var(--line-2)" />
      <line x1={x(ageThreshold)} y1={pad.t} x2={x(ageThreshold)} y2={pad.t + ih} stroke="var(--bad)" strokeDasharray="4 4" opacity="0.4" />
      {/* eksen etiketleri */}
      <text x={pad.l + iw / 2} y={H - 8} textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="var(--dim)">bekleme (gün) →</text>
      <text x={14} y={pad.t + ih / 2} textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="var(--dim)" transform={`rotate(-90 14 ${pad.t + ih / 2})`}>etki (iş) →</text>
      {[0, 0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={y(maxImpact * f) + 3} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{Math.round(maxImpact * f)}</text>)}
      {[0, 0.5, 1].map((f) => <text key={f} x={x(maxDays * f)} y={pad.t + ih + 14} textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="var(--dim)">{Math.round(maxDays * f)}</text>)}
      {/* balonlar */}
      {items.map((d, i) => (
        <circle key={d.key} cx={x(d.days)} cy={y(d.impact)} r={4 + Math.min(10, d.score * 1.4)}
          fill={COLOR[d.risk]} opacity={hi === null || hi === i ? 0.8 : 0.25} stroke={hi === i ? "#fff" : COLOR[d.risk]} strokeWidth={hi === i ? 2 : 1}
          style={{ cursor: "pointer" }} onMouseEnter={() => setHi(i)} onClick={() => onPick?.(d.key)} />
      ))}
      {hi != null && (() => {
        const d = items[hi]; const lines = [d.key, `bekleme: ${d.days}g · etki: ${d.impact}`, ...d.reasons.slice(0, 3)];
        const w = Math.max(...lines.map((l) => l.length)) * 6 + 14, bh = lines.length * 13 + 8;
        let bx = x(d.days) + 10; if (bx + w > W) bx = x(d.days) - w - 10;
        let by = y(d.impact) - bh - 6; if (by < pad.t) by = y(d.impact) + 10;
        return <g pointerEvents="none"><rect x={bx} y={by} width={w} height={bh} fill="#0a0d12" stroke="var(--line-2)" rx="2" />
          {lines.map((l, k) => <text key={k} x={bx + 7} y={by + 15 + k * 13} fontSize="10" fontFamily="var(--mono)" fill={k === 0 ? "var(--amber)" : "var(--dim)"}>{l}</text>)}</g>;
      })()}
    </svg>
  );
}

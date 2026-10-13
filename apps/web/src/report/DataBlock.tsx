import { useEffect, useState } from "react";
import { api, type Catalog, type MetricFilters } from "../api";
import { BarChart, LineChart } from "../components/Charts";
import type { Block } from "./types";

const fmt = (v: unknown) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("tr-TR") : String(v ?? "—");
};

/** Rapor veri bloğu — mevcut Metrics/Signals motorlarından canlı veri çeker. */
export function DataBlock({ block, filters, nonce, cat }: { block: Block; filters: MetricFilters; nonce: number; cat?: Catalog | null }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify([block.type, block.measure, block.measures, block.dimension, block.col, block.columns, block.signalId, filters, nonce]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      let d: any = null;
      if (block.type === "kpi") {
        const ms = block.measures?.length ? block.measures : block.measure ? [block.measure] : ["total"];
        d = await Promise.all(ms.map((m) => api.metricData(m, undefined, filters).then((r) => ({ id: m, value: r[0]?.value ?? 0 }))));
      } else if (block.type === "chart") d = await api.metricData(block.measure ?? "total", block.dimension, filters);
      else if (block.type === "table") d = block.columns?.length ? await api.metricTable(block.dimension ?? "assignee", filters) : null;
      else if (block.type === "pivot") d = await api.metricCrosstab(block.measure ?? "total", block.dimension ?? "assignee", block.col ?? "type", filters);
      else if (block.type === "signal") d = await api.insight(block.signalId ?? "aging", filters.project);
      if (alive) { setData(d); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="rp-data">{block.caption ? <div className="rp-cap">{block.caption}</div> : null}{loading ? <div className="rp-skel">yükleniyor…</div> : <Body block={block} data={data} cat={cat} />}</div>;
}

function Body({ block, data, cat }: { block: Block; data: any; cat?: Catalog | null }) {
  const mTitle = (id: string) => cat?.measures.find((m) => m.id === id)?.title ?? id;
  if (block.type === "kpi") {
    const tiles: { id: string; value: number }[] = Array.isArray(data) ? data : [];
    if (!tiles.length) return <div className="rp-skel">ölçü seç</div>;
    return (
      <div className="rp-kpirow">
        {tiles.map((t) => (
          <div className="rp-kpi" key={t.id}><div className="rp-kpi-v num">{fmt(t.value)}</div><div className="rp-kpi-l">{mTitle(t.id)}</div></div>
        ))}
      </div>
    );
  }
  if (block.type === "chart") {
    const rows = (data ?? []).map((r: any) => ({ label: String(r.group), value: Number(r.value ?? 0) })).slice(0, 14);
    if (!rows.length) return <div className="rp-skel">veri yok</div>;
    return block.chartType === "line" ? <LineChart data={rows} /> : <BarChart data={rows} color="var(--amber)" />;
  }
  if (block.type === "table") {
    if (!block.columns?.length) return <div className="rp-skel">Bu tablo <b>custom</b> — sağ panelden sütun (ölçü) seç.</div>;
    const all = data?.measures ?? []; const rows = data?.rows ?? [];
    const measures = all.filter((m: any) => block.columns!.includes(m.id));
    if (!rows.length) return <div className="rp-skel">veri yok</div>;
    return (
      <table className="rp-tbl">
        <thead><tr><th>{block.dimension}</th>{measures.map((m: any) => <th key={m.id}>{m.title}</th>)}</tr></thead>
        <tbody>{rows.map((r: any, i: number) => <tr key={i}><td className="k">{String(r.group)}</td>{measures.map((m: any) => <td key={m.id} className="num">{r[m.id] ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (block.type === "pivot") {
    const cells = (data ?? []) as { row: string; col: string; value: number | null }[];
    if (!cells.length) return <div className="rp-skel">veri yok</div>;
    const rowKeys: string[] = []; const colKeys: string[] = [];
    const map = new Map<string, number>();
    for (const c of cells) { if (!rowKeys.includes(c.row)) rowKeys.push(c.row); if (!colKeys.includes(c.col)) colKeys.push(c.col); map.set(`${c.row}\u0000${c.col}`, Number(c.value ?? 0)); }
    return (
      <table className="rp-tbl">
        <thead><tr><th>{block.dimension} ╲ {block.col}</th>{colKeys.map((c) => <th key={c} style={{ textAlign: "right" }}>{c}</th>)}</tr></thead>
        <tbody>{rowKeys.map((rk) => <tr key={rk}><td className="k">{rk}</td>{colKeys.map((ck) => <td key={ck} className="num" style={{ textAlign: "right" }}>{map.get(`${rk}\u0000${ck}`) || "·"}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (block.type === "signal") {
    const rows = (data ?? []) as Record<string, unknown>[];
    if (!rows.length) return <div className="rp-skel">temiz ✓</div>;
    const cols = Object.keys(rows[0]).filter((c) => c !== "summary");
    return (
      <table className="rp-tbl">
        <thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={c === "key" || c === "repo" ? "k" : ""}>{String(r[c] ?? "—")}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  return null;
}

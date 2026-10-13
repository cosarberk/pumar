import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Catalog, MetricFilters } from "../api";
import { BarChart, LineChart, DonutChart, HBarChart, StackedBar, TrendChart } from "../components/Charts";
import { blockSig, fetchBlock } from "./fetchBlock";
import { YETEN_LOGO } from "./logo";
import { applyTokens, isData, isSplittable, PAGE_MM, type Block, type ReportDoc } from "./types";

const PX = 96 / 25.4;
const GAP = 8;
const fmt = (v: unknown) => { const n = Number(v); return isFinite(n) ? n.toLocaleString("tr-TR") : String(v ?? "—"); };
const FONTS: Record<string, string | undefined> = { serif: "Georgia, 'Times New Roman', serif", mono: "var(--mono)", sans: undefined };

type Dim = { h: number; cap: number; thead: number; row: number; rows?: number[] };
type Seg = { id: string; rowStart?: number; rowEnd?: number; first?: boolean; pairId?: string };
type TocEntry = { text: string; level: number; page?: number };

function RenderBlock({ block: b, data, cat, slice, showCap = true, toc }: { block: Block; data: any; cat?: Catalog | null; slice?: [number, number]; showCap?: boolean; toc?: TocEntry[] }) {
  const mTitle = (id: string) => cat?.measures.find((m) => m.id === id)?.title ?? id;
  if (b.type === "heading") return <div style={{ fontWeight: 700, textAlign: b.align, fontSize: b.size ?? (b.level === 1 ? 26 : b.level === 2 ? 20 : 16), fontFamily: "var(--disp)" }}>{b.text}</div>;
  if (b.type === "text") return <div style={{ textAlign: b.align, fontSize: b.size ?? 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{b.text}</div>;
  if (b.type === "spacer") return <div style={{ height: `${b.height}mm` }} />;
  if (b.type === "image") return (
    <div className="rp-img" style={{ textAlign: b.align ?? "center" }}>
      {b.src
        ? <img src={b.src} alt={b.caption ?? ""} style={{ maxWidth: "100%", display: "inline-block", verticalAlign: "top" }} />
        : <div className="rp-skel">görsel seç — sağ panelden yükle</div>}
      {b.caption ? <div className="rp-img-cap">{b.caption}</div> : null}
    </div>
  );
  if (b.type === "divider") return (
    <div className={`rp-divider tone-${b.tone ?? "info"}`}>
      {b.caption ? <div className="rp-divider-eyebrow">{b.caption}</div> : null}
      <div className="rp-divider-title">{b.text}</div>
    </div>
  );
  if (b.type === "toc") return (
    <div className="rp-data">{showCap && b.caption ? <div className="rp-cap">{b.caption}</div> : null}
      <div className="rp-toc">
        {(toc ?? []).map((e, i) => (
          <div className="rp-toc-row" key={i} style={{ paddingLeft: (e.level - 1) * 14 }}>
            <span className="rp-toc-t">{e.text}</span><span className="rp-toc-dots" /><span className="rp-toc-p num">{e.page ?? ""}</span>
          </div>
        ))}
        {!(toc ?? []).length && <div className="rp-skel">başlık yok</div>}
      </div>
    </div>
  );

  const cap = showCap && (b.caption || b.note) ? (
    <div className="rp-caphead">
      {b.caption ? <div className="rp-cap">{b.caption}</div> : null}
      {b.note ? <div className="rp-note">{b.note}</div> : null}
    </div>
  ) : null;
  if (data === undefined) return <div className="rp-data">{cap}<div className="rp-skel">yükleniyor…</div></div>;

  if (b.type === "callout") {
    const vals = (data ?? {}) as Record<string, number>;
    const txt = (b.text ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, id) => fmt(vals[id] ?? 0));
    return <div className={`rp-callout tone-${b.tone ?? "info"}`}><div className="rp-callout-bar" /><div className="rp-callout-txt">{txt}</div></div>;
  }
  if (b.type === "kpi") {
    const tiles: { id: string; value: number }[] = Array.isArray(data) ? data : [];
    return <div className="rp-data">{cap}{tiles.length ? <div className="rp-kpirow">{tiles.map((t) => <div className="rp-kpi" key={t.id}><div className="rp-kpi-v num">{fmt(t.value)}</div><div className="rp-kpi-l">{mTitle(t.id)}</div></div>)}</div> : <div className="rp-skel">ölçü seç</div>}</div>;
  }
  if (b.type === "chart") {
    const kind = b.chartType ?? "bar";
    if (kind === "trend" || kind === "area") {
      const pts = (data ?? []) as { period: string; created: number; resolved: number; backlog: number }[];
      return <div className="rp-data">{cap}{pts.length ? <TrendChart data={pts} /> : <div className="rp-skel">veri yok</div>}</div>;
    }
    if (kind === "stacked") {
      const cells = (data ?? []) as { row: string; col: string; value: number | null }[];
      return <div className="rp-data">{cap}{cells.length ? <StackedBar cells={cells} /> : <div className="rp-skel">veri yok</div>}</div>;
    }
    const rows = (data ?? []).map((r: any) => ({ label: String(r.group), value: Number(r.value ?? 0) }));
    if (!rows.length) return <div className="rp-data">{cap}<div className="rp-skel">veri yok</div></div>;
    const chart =
      kind === "line" ? <LineChart data={rows} />
      : kind === "donut" ? <DonutChart data={rows} />
      : kind === "hbar" ? <HBarChart data={rows} />
      : <BarChart data={rows.slice(0, 14)} color="var(--amber)" />;
    return <div className="rp-data">{cap}{chart}</div>;
  }
  if (b.type === "pivot") {
    const cells = (data ?? []) as { row: string; col: string; value: number | null }[];
    if (!cells.length) return <div className="rp-data">{cap}<div className="rp-skel">veri yok</div></div>;
    const rowKeys: string[] = []; const colKeys: string[] = []; const map = new Map<string, number>();
    for (const c of cells) { if (!rowKeys.includes(c.row)) rowKeys.push(c.row); if (!colKeys.includes(c.col)) colKeys.push(c.col); map.set(`${c.row}\u0000${c.col}`, Number(c.value ?? 0)); }
    return <div className="rp-data">{cap}<table className="rp-tbl"><thead><tr><th>{b.dimension} ╲ {b.col}</th>{colKeys.map((c) => <th key={c} style={{ textAlign: "right" }}>{c}</th>)}</tr></thead>
      <tbody>{rowKeys.map((rk) => <tr key={rk}><td className="k">{rk}</td>{colKeys.map((ck) => <td key={ck} className="num" style={{ textAlign: "right" }}>{map.get(`${rk}\u0000${ck}`) || "·"}</td>)}</tr>)}</tbody></table></div>;
  }
  if (b.type === "table") {
    if (!b.columns?.length) return <div className="rp-data">{cap}<div className="rp-skel">Bu tablo <b>custom</b> — sağ panelden sütun seç.</div></div>;
    const all = data?.measures ?? []; let rows = data?.rows ?? [];
    const measures = all.filter((m: any) => b.columns!.includes(m.id));
    if (!rows.length) return <div className="rp-data">{cap}<div className="rp-skel">veri yok</div></div>;
    if (slice) rows = rows.slice(slice[0], slice[1]);
    return <div className="rp-data">{cap}<table className="rp-tbl"><thead><tr><th>{b.dimension}</th>{measures.map((m: any) => <th key={m.id}>{m.title}</th>)}</tr></thead>
      <tbody>{rows.map((r: any, i: number) => <tr key={i}><td className="k">{String(r.group)}</td>{measures.map((m: any) => <td key={m.id} className="num">{r[m.id] ?? "—"}</td>)}</tr>)}</tbody></table></div>;
  }
  if (b.type === "signal") {
    let rows = (data ?? []) as Record<string, unknown>[];
    if (!rows.length) return <div className="rp-data">{cap}<div className="rp-sig-clean">Temiz ✓ — bu sinyalde kayıt yok.</div></div>;

    // ── ham tablo modu (opsiyonel) ──
    if (b.signalView === "table") {
      const cols = Object.keys(rows[0]).filter((c) => c !== "summary");
      if (slice) rows = rows.slice(slice[0], slice[1]);
      return <div className="rp-data">{cap}<table className="rp-tbl"><thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={c === "key" || c === "repo" ? "k" : ""}>{String(r[c] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
    }

    // ── özet mod (varsayılan) ──
    const keys = Object.keys(rows[0]);
    const isRawItems = keys.includes("key"); // ham Jira kartı listesi mi?

    // Zaten özet olan sinyaller (unlinked_code / bus_factor / review_bottleneck): kompakt tablo (tek tek kart değil, birkaç satır)
    if (!isRawItems) {
      const cols = keys.filter((c) => c !== "summary");
      if (slice) rows = rows.slice(slice[0], slice[1]);
      const isLabel = (c: string) => c === "repo" || c === "kind" || c === "durum" || c === "geçiş" || c === "gösterge";
      return <div className="rp-data">{cap}<table className="rp-tbl"><thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={isLabel(c) ? "k" : "num"}>{isLabel(c) ? String(r[c] ?? "—") : fmt(r[c])}</td>)}</tr>)}</tbody></table></div>;
    }

    // Ham kart listeleri (aging, done_without_mr): toplam + KİŞİ bazında sayım grafiği (tek tek YOK)
    const labelKey = keys.includes("assignee") ? "assignee" : keys.includes("reporter") ? "reporter" : "key";
    const agg = new Map<string, number>();
    for (const r of rows) { const lbl = String(r[labelKey] ?? "— atanmamış —"); agg.set(lbl, (agg.get(lbl) ?? 0) + 1); }
    const series = [...agg.entries()].map(([label, value]) => ({ label, value })).sort((a, b2) => b2.value - a.value);
    const top = series[0];
    return (
      <div className="rp-data">{cap}
        <div className="rp-sig-sum">
          <div className="rp-sig-stat"><div className="rp-sig-n num">{fmt(rows.length)}</div><div className="rp-sig-l">kart</div></div>
          <div className="rp-sig-stat"><div className="rp-sig-n num">{series.length}</div><div className="rp-sig-l">kişi</div></div>
          {top && <div className="rp-sig-stat"><div className="rp-sig-top">{top.label}</div><div className="rp-sig-l">en çok ({fmt(top.value)})</div></div>}
        </div>
        <HBarChart data={series} color="var(--amber)" />
      </div>
    );
  }
  return null;
}

/** Serbest konumlu blok — sürükle-taşı + köşeden boyutlandır (mm, snap'li). */
function FreeBox({ pos, zoom, snap, selected, onSelect, onChange, children, locked }: {
  pos: NonNullable<Block["pos"]>; zoom: number; snap: number; selected: boolean; onSelect: () => void;
  onChange: (p: NonNullable<Block["pos"]>) => void; children: React.ReactNode; locked?: boolean;
}) {
  if (locked) return <div className="rp-free" style={{ left: `${pos.x}mm`, top: `${pos.y}mm`, width: `${pos.w}mm`, height: `${pos.h}mm`, zIndex: (pos.z ?? 1) + 2, cursor: "default", border: "none" }}><div className="rp-free-in">{children}</div></div>;
  const snapv = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : Math.round(v * 10) / 10);
  function onDown(e: React.MouseEvent, mode: "move" | "resize") {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, p0 = { ...pos };
    const mv = (ev: MouseEvent) => {
      const dx = (ev.clientX - sx) / (PX * zoom), dy = (ev.clientY - sy) / (PX * zoom);
      if (mode === "move") onChange({ ...p0, x: Math.max(0, snapv(p0.x + dx)), y: Math.max(0, snapv(p0.y + dy)) });
      else onChange({ ...p0, w: Math.max(12, snapv(p0.w + dx)), h: Math.max(8, snapv(p0.h + dy)) });
    };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = mode === "move" ? "grabbing" : "nwse-resize";
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  }
  return (
    <div className={`rp-free ${selected ? "sel" : ""}`} style={{ left: `${pos.x}mm`, top: `${pos.y}mm`, width: `${pos.w}mm`, height: `${pos.h}mm`, zIndex: (pos.z ?? 1) + 2 }}
      onMouseDown={(e) => onDown(e, "move")} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <div className="rp-free-in">{children}</div>
      {selected && <div className="rp-free-rz" onMouseDown={(e) => onDown(e, "resize")} title="boyutlandır" />}
    </div>
  );
}

export function ReportCanvas({ doc, filters, nonce, cat, zoom, selId, onSelect, onBlank, onReorder, onZoom, onPages, grid, snap = 0, ruler, onPosChange, readOnly }: {
  doc: ReportDoc; filters: MetricFilters; nonce: number; cat?: Catalog | null; zoom: number;
  selId?: string; onSelect: (id: string) => void; onBlank: () => void;
  onReorder?: (srcId: string | null, destId: string) => void; onZoom?: (delta: number) => void; onPages?: (n: number) => void;
  grid?: boolean; snap?: number; ruler?: boolean; onPosChange?: (id: string, pos: NonNullable<Block["pos"]>) => void;
  readOnly?: boolean;
}) {
  const [data, setData] = useState<Record<string, any>>({});
  const [dim, setDim] = useState<Record<string, Dim>>({});
  const [over, setOver] = useState<string | null>(null);
  const measRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = canvasRef.current; if (!el || !onZoom) return;
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey) { e.preventDefault(); onZoom(e.deltaY < 0 ? 0.1 : -0.1); } };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoom]);

  const dims = doc.orientation === "landscape" ? { w: PAGE_MM[doc.pageSize].h, h: PAGE_MM[doc.pageSize].w } : PAGE_MM[doc.pageSize];
  const contentWpx = (dims.w - 2 * doc.margin) * PX;
  const headH = doc.header ? 9 * PX : 0;
  const footH = doc.footer || doc.showPageNumbers ? 9 * PX : 0;
  const usableHpx = (dims.h - 2 * doc.margin) * PX - headH - footH;

  const themeStyle: React.CSSProperties = {
    ...(doc.theme?.accent ? ({ ["--amber" as any]: doc.theme.accent }) : {}),
    ...(doc.theme?.paper ? { background: doc.theme.paper } : {}),
    ...(doc.theme?.font && FONTS[doc.theme.font] ? { fontFamily: FONTS[doc.theme.font] } : {}),
  };

  const effFilters = (b: Block): MetricFilters => {
    const o = b.filter; if (!o) return filters;
    const f: MetricFilters = { ...filters };
    if (o.sprint) f.sprint = o.sprint;
    if (o.type) f.type = o.type;
    if (o.from) f.from = o.from;
    if (o.to) f.to = o.to;
    return f;
  };
  const isEmpty = (b: Block): boolean => {
    const d = data[b.id];
    if (d === undefined) return false; // yükleniyor
    switch (b.type) {
      case "table": return !b.columns?.length || !((d?.rows ?? []).length);
      case "signal": case "chart": case "pivot": return !((d ?? []).length);
      case "kpi": return !(Array.isArray(d) && d.length);
      default: return false;
    }
  };

  const vis = doc.blocks.filter((b) => !b.hidden);
  const flowBlocks = vis.filter((b) => !b.pos);
  const freeBlocks = vis.filter((b) => b.pos);
  const dataBlocks = vis.filter((b) => isData(b.type));
  const dataSig = dataBlocks.map((b) => b.id + blockSig(b)).join("|");

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(dataBlocks.map(async (b) => [b.id, await fetchBlock(b, effFilters(b))] as const));
      if (alive) setData((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { alive = false; };
  }, [dataSig, JSON.stringify(filters), nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  function measure() {
    const el = measRef.current; if (!el) return;
    const m: Record<string, Dim> = {};
    el.querySelectorAll<HTMLElement>("[data-mid]").forEach((node) => {
      const id = node.dataset.mid!;
      const head = node.querySelector<HTMLElement>(".rp-caphead");
      const cap = head ? head.offsetHeight + 6 : 0; // başlık + açıklama (not) bloğu
      const thead = node.querySelector<HTMLElement>("thead")?.offsetHeight ?? 0;
      const trEls = node.querySelectorAll<HTMLElement>("tbody tr");
      const rows = Array.from(trEls).map((r) => r.offsetHeight);
      const row = rows[0] ?? 0;
      m[id] = { h: node.offsetHeight, cap, thead, row, rows };
    });
    setDim(m);
  }
  useLayoutEffect(() => { measure(); }, [data, dataSig, contentWpx, doc.blocks]);
  useEffect(() => {
    const el = measRef.current; if (!el || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el); return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries(doc.blocks.map((b) => [b.id, b])), [doc.blocks]);
  const rowsOf = (b: Block): any[] | null => {
    if (b.type === "table") return b.columns?.length ? (data[b.id]?.rows ?? []) : null;
    if (b.type === "signal") {
      const rows = (data[b.id] as any[]) ?? [];
      if (b.signalView === "table") return rows;                 // ham tablo → böl
      if (!rows.length) return null;
      // özet mod: ham kart listesi (aging/done_without_mr) stats+grafik → tek blok;
      // toplulaştırılmış sinyal (review/bus-factor/unlinked) tablo → böl, kırpma.
      return Object.keys(rows[0]).includes("key") ? null : rows;
    }
    return null;
  };

  const pages = useMemo(() => {
    const out: Seg[][] = [[]];
    let rem = usableHpx;
    const nl = () => { out.push([]); rem = usableHpx; };
    const cur = () => out[out.length - 1];
    const skip = (x: Block) => x.hideIfEmpty && isData(x.type) && isEmpty(x);
    const pairable = (x?: Block) => !!x && x.span === "half" && !isSplittable(x.type) && x.type !== "pagebreak" && !skip(x);
    for (let bi = 0; bi < flowBlocks.length; bi++) {
      const b = flowBlocks[bi];
      if (b.type === "pagebreak") { if (cur().length) nl(); continue; }
      if (skip(b)) continue; // koşullu gizleme
      if (b.breakBefore && cur().length) nl(); // bu bloktan önce elle sayfa sonu
      // yan-yana: iki ardışık yarım blok → tek satır (yükseklik = max)
      if (pairable(b) && pairable(flowBlocks[bi + 1])) {
        const nb = flowBlocks[bi + 1];
        const h = Math.max(dim[b.id]?.h ?? 60, dim[nb.id]?.h ?? 60);
        if (h + GAP > rem && cur().length) nl();
        cur().push({ id: b.id, pairId: nb.id, first: true });
        rem -= h + GAP;
        bi++; // çifti tüket
        continue;
      }
      const d = dim[b.id];
      if (!d) { cur().push({ id: b.id, first: true }); rem -= 60; continue; }
      const rows = isSplittable(b.type) ? rowsOf(b) : null;
      if (rows && rows.length) {
        const rowH = d.row || 18, thead = d.thead, cap = d.cap;
        const rh = (i: number) => d.rows?.[i] || rowH; // ÖLÇÜLEN satır yüksekliği (çok satırlı isimler için)
        // blok "chrome"u: .rp-block padding + .rp-data margin vb. — tam blok yüks. eksi (başlık+thead+satırlar).
        // bütçeye katılmazsa her parça ~10px daha uzun basılır ve son satır kırpılır.
        const sumRows = (d.rows ?? []).reduce((a, r) => a + r, 0);
        const chrome = Math.max(0, d.h - (cap + thead + sumRows));
        const PAD = 8; // ek güvenlik payı (alt satır borderı / yuvarlama)
        let start = 0, first = true;
        while (start < rows.length) {
          const overhead = chrome + (first ? cap : 0) + thead;
          if (rem < overhead + rh(start) + PAD && cur().length) nl();
          // gerçek yüksekliklerle sığdığı kadar satır al (en az 1) — taşma/kırpma yok
          let used = overhead, end = start;
          while (end < rows.length && (end === start || used + rh(end) <= rem - PAD)) { used += rh(end); end++; }
          cur().push({ id: b.id, rowStart: start, rowEnd: end, first });
          rem -= used + GAP;
          start = end; first = false;
          if (start < rows.length) nl();
        }
      } else {
        // bölüm ayracı / başlık sayfa dibinde yalnız kalmasın: ardından içerik için yer yoksa yeni sayfa
        const isHdr = b.type === "divider" || b.type === "heading";
        const needed = isHdr ? d.h + 120 : d.h;
        if (needed > rem && cur().length) nl();
        cur().push({ id: b.id, first: true });
        rem -= d.h + GAP;
      }
    }
    return out;
  }, [flowBlocks, dim, data, usableHpx]); // eslint-disable-line react-hooks/exhaustive-deps

  // bölüm başlığı → sayfa no haritası (TOC). divider = bölüm (seviye 1), heading = kendi seviyesi.
  const tocEntries: TocEntry[] = useMemo(() => {
    const tocable = (t?: string) => t === "heading" || t === "divider";
    const pageOf = new Map<string, number>();
    pages.forEach((segs, pi) => segs.forEach((s) => { const b = byId[s.id]; if (tocable(b?.type) && !pageOf.has(s.id)) pageOf.set(s.id, pi + 1); }));
    return doc.blocks
      .filter((b) => tocable(b.type) && !b.hidden)
      .map((b) => ({ text: b.text ?? "", level: b.type === "divider" ? 1 : (b.level ?? 1), page: pageOf.get(b.id) }));
  }, [pages, byId, doc.blocks]);

  const nPages = useMemo(() => { const mx = freeBlocks.reduce((m, b) => Math.max(m, b.pos!.page ?? 0), -1); return Math.max(pages.length, mx + 1); }, [pages.length, freeBlocks]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onPages?.((doc.cover ? 1 : 0) + nPages); }, [nPages, doc.cover]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = (page: number) => ({ project: filters.project ?? "", name: doc.name, page, pages: pages.length });

  const pageInner = (segs: Seg[], pi: number, thumb = false) => (
    <>
      {doc.header && <div className="rp-head">{applyTokens(doc.header, ctx(pi + 1))}</div>}
      <div className="rp-pbody" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {segs.map((seg, i) => {
          const render = (id: string, seg2?: Seg) => {
            const b = byId[id]; if (!b) return null;
            const s = seg2 ?? seg;
            const inner = <RenderBlock block={b} data={isData(b.type) ? data[b.id] : null} cat={cat} slice={s.rowStart != null ? [s.rowStart, s.rowEnd!] : undefined} showCap={s.first !== false} toc={tocEntries} />;
            if (thumb || readOnly) return <div className="rp-block">{inner}</div>;
            return (
              <div
                className={`rp-block ${selId === id ? "sel" : ""} ${over === id ? "drag-over" : ""}`}
                draggable
                onClick={(e) => { e.stopPropagation(); onSelect(id); }}
                onDragStart={(e) => { e.stopPropagation(); dragRef.current = id; }}
                onDragOver={(e) => { e.preventDefault(); if (over !== id) setOver(id); }}
                onDragLeave={() => setOver((o) => (o === id ? null : o))}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onReorder?.(dragRef.current, id); dragRef.current = null; setOver(null); }}
                onDragEnd={() => { dragRef.current = null; setOver(null); }}
              >{inner}</div>
            );
          };
          if (seg.pairId) return <div key={i} className="rp-row2"><div className="rp-pcol">{render(seg.id)}</div><div className="rp-pcol">{render(seg.pairId)}</div></div>;
          return <div key={i}>{render(seg.id)}</div>;
        })}
      </div>
      {(doc.footer || doc.showPageNumbers) && (
        <div className="rp-foot">
          <span>{doc.footer ? applyTokens(doc.footer, ctx(pi + 1)) : ""}</span>
          {doc.showPageNumbers && <span>{pi + 1} / {pages.length}</span>}
        </div>
      )}
    </>
  );

  const coverInner = (
    <div className="rp-cover">
      <div className="rp-cover-top">
        <span className="rp-cover-kicker">SSB · YETEN</span>
        <span className="rp-cover-kicker rp-dim">{new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}</span>
      </div>

      <div className="rp-cover-hero">
        <div className="rp-cover-logo-wrap"><img className="rp-cover-logo" src={YETEN_LOGO} alt="YETEN" /></div>
        <div className="rp-cover-eyebrow">{filters.project} · PROJE DURUM RAPORU</div>
        <div className="rp-cover-title">{doc.name}</div>
        {doc.coverSubtitle && <div className="rp-cover-desc">{doc.coverSubtitle}</div>}
      </div>

      <div className="rp-cover-foot">
        <div className="rp-cover-rule" />
        <div className="rp-cover-meta">
          <span className="rp-cover-wm">Pumar<em> Analytics</em></span>
          <span className="rp-cover-tag">GitLab × Jira · birleşik proje analitiği</span>
        </div>
      </div>
    </div>
  );

  const step = snap > 0 ? snap : 5;
  const gridBg: React.CSSProperties = grid ? {
    backgroundImage: "linear-gradient(rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.06) 1px, transparent 1px)",
    backgroundSize: `${step}mm ${step}mm`, backgroundPosition: `${doc.margin}mm ${doc.margin}mm`,
  } : {};
  const pageEl = (key: any, z: number, children: React.ReactNode, ref?: (el: HTMLDivElement | null) => void, chrome = false) => (
    <div key={key} ref={ref} className="rp-page-wrap" style={{ width: dims.w * PX * z, height: dims.h * PX * z }}>
      <div className="rp-page" style={{ width: `${dims.w}mm`, height: `${dims.h}mm`, padding: `${doc.margin}mm`, transform: `scale(${z})`, transformOrigin: "top left", display: "flex", flexDirection: "column", ...themeStyle, ...(chrome ? gridBg : {}) }}>
        {doc.watermark && <div className="rp-wm">{doc.watermark}</div>}
        {chrome && ruler && <><div className="rp-ruler-t" /><div className="rp-ruler-l" /></>}
        {children}
      </div>
    </div>
  );

  const freeOn = (pi: number) => freeBlocks.filter((b) => (b.pos!.page ?? 0) === pi);
  const freeBoxes = (pi: number) => freeOn(pi).map((b) => (
    <FreeBox key={b.id} pos={b.pos!} zoom={zoom} snap={snap} locked={readOnly} selected={selId === b.id} onSelect={() => onSelect(b.id)} onChange={(p) => onPosChange?.(b.id, p)}>
      <RenderBlock block={b} data={isData(b.type) ? data[b.id] : null} cat={cat} toc={tocEntries} />
    </FreeBox>
  ));

  const total = (doc.cover ? 1 : 0) + nPages;
  const thumbZ = Math.min(0.16, 140 / (dims.w * PX));
  const scrollTo = (i: number) => pageRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="ws-viewport rp-stage">
      {total > 1 && (
        <div className="rp-thumbs">
          {doc.cover && <div className="rp-thumb" onClick={() => scrollTo(0)}><div className="rp-thumb-box">{pageEl("tc", thumbZ, coverInner)}</div><span>K</span></div>}
          {Array.from({ length: nPages }).map((_, pi) => {
            const idx = (doc.cover ? 1 : 0) + pi;
            return <div className="rp-thumb" key={pi} onClick={() => scrollTo(idx)}><div className="rp-thumb-box">{pageEl(`t${pi}`, thumbZ, pageInner(pages[pi] ?? [], pi, true))}</div><span>{pi + 1}</span></div>;
          })}
        </div>
      )}

      <div className="rp-canvas" ref={canvasRef} onClick={onBlank}>
        <div ref={measRef} className="rp-meas" style={{ width: contentWpx }} aria-hidden>
          {flowBlocks.filter((b) => b.type !== "pagebreak").map((b) => (
            <div key={b.id} data-mid={b.id} className="rp-block" style={b.span === "half" && !isSplittable(b.type) ? { width: (contentWpx - GAP) / 2 } : undefined}><RenderBlock block={b} data={isData(b.type) ? data[b.id] : null} cat={cat} toc={tocEntries} /></div>
          ))}
        </div>

        {!vis.length && !doc.cover && <div className="rp-empty-doc">Boş rapor · soldaki araç çubuğundan blok ekle</div>}

        {doc.cover && pageEl("cover", zoom, coverInner, (el) => { pageRefs.current[0] = el; }, true)}
        {Array.from({ length: nPages }).map((_, pi) => pageEl(pi, zoom, <>{pageInner(pages[pi] ?? [], pi)}{freeBoxes(pi)}</>, (el) => { pageRefs.current[(doc.cover ? 1 : 0) + pi] = el; }, true))}
      </div>
    </div>
  );
}

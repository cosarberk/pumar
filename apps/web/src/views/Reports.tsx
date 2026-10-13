import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ReportTemplateMeta, type Catalog, type MetricFilters } from "../api";
import { ReportCanvas } from "../report/ReportCanvas";
import { TEMPLATES, getTemplate } from "../report/templates";
import { fetchBlock } from "../report/fetchBlock";
import { emptyDoc, isData, newBlock, SIGNAL_LABELS, type Block, type BlockType, type ReportDoc } from "../report/types";

/* ---------- SVG ikonlar ---------- */
function Icon({ n, size = 15 }: { n: string; size?: number }) {
  const c = { viewBox: "0 0 16 16", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (n) {
    case "new": return <svg {...c}><path d="M4 2h5l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" /><path d="M9 2v4h4" /></svg>;
    case "open": return <svg {...c}><path d="M2 4.5h4L7.5 6.5H14V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z" /></svg>;
    case "save": return <svg {...c}><path d="M8 2v7m0 0 3-3M8 9 5 6" /><path d="M3 11v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V11" /></svg>;
    case "saveAs": return <svg {...c}><rect x="2.5" y="2.5" width="8" height="8" rx="1" /><path d="M6 13.5h7a1 1 0 0 0 1-1v-7" /></svg>;
    case "trash": return <svg {...c}><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5l.5 8.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" /></svg>;
    case "undo": return <svg {...c}><path d="M6 4 3 7l3 3" /><path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H8" /></svg>;
    case "redo": return <svg {...c}><path d="m10 4 3 3-3 3" /><path d="M13 7H6.5a3.5 3.5 0 0 0 0 7H8" /></svg>;
    case "refresh": return <svg {...c}><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" /></svg>;
    case "zoomout": return <svg {...c}><circle cx="7" cy="7" r="4.3" /><path d="m10.3 10.3 3.2 3.2M5 7h4" /></svg>;
    case "zoomin": return <svg {...c}><circle cx="7" cy="7" r="4.3" /><path d="m10.3 10.3 3.2 3.2M7 5v4M5 7h4" /></svg>;
    case "fit": return <svg {...c}><path d="M2 5.5V2.5h3M14 5.5V2.5h-3M2 10.5v3h3M14 10.5v3h-3" /></svg>;
    case "blank": return <svg {...c}><path d="M4 2h5l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" /><path d="M9 2v4h4" /><path d="M6.5 11h3" /></svg>;
    case "kpi": return <svg {...c}><path d="M2 5h3v6H2zM6.5 5h3v6h-3zM11 5h3v6h-3z" /></svg>;
    case "table": return <svg {...c}><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6.3h12M2 9.6h12M6.3 3v10M10 3v10" /></svg>;
    case "pivot": return <svg {...c}><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6.3h12M6.3 3v10" /></svg>;
    case "chart": return <svg {...c}><path d="M2 13h12" /><path d="M4 13V9M7.5 13V4.5M11 13V7" /></svg>;
    case "signal": return <svg {...c}><path d="M8 2.5 14.5 13.5h-13z" /><path d="M8 6.5v3.5" /><path d="M8 11.8v.4" /></svg>;
    case "heading": return <svg {...c}><path d="M4 3v10M11 3v10M4 8h7" /></svg>;
    case "text": return <svg {...c}><path d="M3 4h10M3 7.5h10M3 11h7" /></svg>;
    case "spacer": return <svg {...c}><path d="M3 8h2.2M7 8h2M11 8h2" /></svg>;
    case "pbreak": return <svg {...c}><path d="M2 8h12" strokeDasharray="2 1.6" /><path d="M4 4.5 2 8l2 3.5M12 4.5 14 8l-2 3.5" /></svg>;
    case "toc": return <svg {...c}><path d="M3 4h7M3 8h7M3 12h5" /><path d="M12.5 4h1M12.5 8h1M12.5 12h1" /></svg>;
    case "dup": return <svg {...c}><rect x="5" y="2.5" width="8" height="8" rx="1" /><path d="M3 5.5v6.5a1 1 0 0 0 1 1h6.5" /></svg>;
    case "grid": return <svg {...c}><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M6 2v12M10 2v12M2 6h12M2 10h12" /></svg>;
    case "ruler": return <svg {...c}><path d="M2 10 10 2l4 4-8 8z" /><path d="M5.5 5.5 7 7M7.5 7.5 9 9M9.5 9.5 11 11" /></svg>;
    case "magnet": return <svg {...c}><path d="M4 3v5a4 4 0 0 0 8 0V3" /><path d="M4 3h2.5v2.5H4zM9.5 3H12v2.5H9.5z" /></svg>;
    case "move": return <svg {...c}><path d="M8 2v12M2 8h12M8 2 6.3 3.7M8 2l1.7 1.7M8 14l-1.7-1.7M8 14l1.7-1.7M2 8l1.7-1.7M2 8l1.7 1.7M14 8l-1.7-1.7M14 8l-1.7 1.7" /></svg>;
    case "pdf": return <svg {...c}><path d="M4 2h5l4 4v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" /><path d="M9 2v4h4" /><path d="M8 8v4m0 0-1.6-1.6M8 12l1.6-1.6" /></svg>;
    case "csv": return <svg {...c}><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M3 6h10M3 10h10M7 2v12" /></svg>;
    case "share": return <svg {...c}><circle cx="4" cy="8" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="12" cy="12" r="2" /><path d="M5.7 7 10.3 4.8M5.7 9l4.6 2.2" /></svg>;
    case "report": return <svg {...c}><path d="M4 2h5l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" /><path d="M9 2v4h4" /><path d="M5.5 9h5M5.5 11.3h5M5.5 6.7h2.5" /></svg>;
    case "divider": return <svg {...c}><path d="M2 8h12" /><path d="M3 4h10M3 12h7" opacity="0.5" /></svg>;
    case "callout": return <svg {...c}><rect x="2.5" y="3.5" width="11" height="9" rx="1" /><path d="M4.5 3.5V12" /><path d="M6.5 6.5h5M6.5 9.5h3" /></svg>;
    case "image": return <svg {...c}><rect x="2" y="3" width="12" height="10" rx="1" /><circle cx="5.8" cy="6.3" r="1.1" /><path d="m2.5 12 3.5-3.4L8.5 11l2-2 3 3" /></svg>;
    default: return null;
  }
}

/* ---------- geçmiş (undo/redo) ---------- */
function useHistory(initial: ReportDoc) {
  const [s, setS] = useState({ past: [] as ReportDoc[], present: initial, future: [] as ReportDoc[] });
  const set = (next: ReportDoc | ((p: ReportDoc) => ReportDoc)) =>
    setS((st) => {
      const n = typeof next === "function" ? (next as (p: ReportDoc) => ReportDoc)(st.present) : next;
      if (n === st.present) return st;
      return { past: [...st.past, st.present], present: n, future: [] };
    });
  const undo = () => setS((st) => (st.past.length ? { past: st.past.slice(0, -1), present: st.past[st.past.length - 1], future: [st.present, ...st.future] } : st));
  const redo = () => setS((st) => (st.future.length ? { past: [...st.past, st.present], present: st.future[0], future: st.future.slice(1) } : st));
  const reset = (v: ReportDoc) => setS({ past: [], present: v, future: [] });
  return { doc: s.present, set, undo, redo, canUndo: s.past.length > 0, canRedo: s.future.length > 0, reset };
}

type Sel = { kind: "doc" } | { kind: "block"; blockId: string };
const BLOCK_TITLE: Record<BlockType, string> = { heading: "Başlık", text: "Metin", spacer: "Boşluk", pagebreak: "Sayfa sonu", toc: "İçindekiler", divider: "Bölüm ayracı", callout: "Vurgu kutusu", image: "Görsel", kpi: "KPI", table: "Tablo", pivot: "Çapraz pivot", chart: "Grafik", signal: "Sinyal" };

function outLabel(b: Block): string {
  switch (b.type) {
    case "heading": return `H${b.level} ${b.text}`;
    case "text": return `¶ ${b.text}`;
    case "spacer": return "␣ boşluk";
    case "pagebreak": return "— sayfa sonu —";
    case "divider": return `▬ Bölüm · ${b.text ?? "—"}`;
    case "callout": return `❝ ${(b.text ?? "").replace(/\{\{.*?\}\}/g, "").replace(/\s+/g, " ").trim().slice(0, 24) || "vurgu"}`;
    case "image": return `▣ Görsel${b.src ? "" : " (boş)"}`;
    case "toc": return `☰ ${b.caption ?? "İçindekiler"}`;
    case "kpi": return `# KPI (${b.measures?.length ?? 0})`;
    case "table": return `▦ Tablo · ${b.dimension} (${b.columns?.length ?? 0})`;
    case "pivot": return `▦ Pivot · ${b.dimension}×${b.col}`;
    case "chart": return `▧ Grafik · ${b.measure}`;
    case "signal": return `◆ ${SIGNAL_LABELS[b.signalId ?? ""] ?? b.signalId}`;
    default: return b.type;
  }
}

export function Reports({ project }: { project: string }) {
  const { doc, set, undo, redo, canUndo, canRedo, reset } = useHistory(emptyDoc());
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ReportTemplateMeta[]>([]);
  const [openList, setOpenList] = useState(false);
  const [sel, setSel] = useState<Sel>({ kind: "doc" });
  const [zoom, setZoom] = useState(0.8);
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState<Catalog | null>(null);
  const [opts, setOpts] = useState<{ sprints: string[]; types: string[] }>({ sprints: [], types: [] });
  const [gf, setGf] = useState({ sprint: "", type: "", from: "", to: "" });
  const [nonce, setNonce] = useState(0);
  const [leftW, setLeftW] = useState(238);
  const [inspW, setInspW] = useState(258);
  const [pageCount, setPageCount] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [showNew, setShowNew] = useState(false);

  function dragX(side: "left" | "insp") {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      const sx = e.clientX, lw = leftW, iw = inspW;
      const mv = (ev: MouseEvent) => {
        if (side === "left") setLeftW(Math.min(420, Math.max(180, lw + (ev.clientX - sx))));
        else setInspW(Math.min(560, Math.max(190, iw - (ev.clientX - sx))));
      };
      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    };
  }

  const booted = useRef(false);
  const refreshList = () => api.reportTemplates().then(setTemplates);
  useEffect(() => { refreshList(); }, []);
  useEffect(() => { api.catalog().then(setCat); }, []);
  useEffect(() => { api.metricOptions(project).then(setOpts); }, [project]);
  useEffect(() => { if (!booted.current && cat) { booted.current = true; reset(getTemplate("full")!.build(project, cat)); } }, [cat, project]); // eslint-disable-line react-hooks/exhaustive-deps
  const flash = (m: string) => { setStatus(m); setTimeout(() => setStatus(""), 2000); };
  const filters: MetricFilters = useMemo(() => ({ project, sprint: gf.sprint || undefined, type: gf.type || undefined, from: gf.from || undefined, to: gf.to || undefined }), [project, gf]);

  /* ---------- blok mutasyonları (düz liste) ---------- */
  function addBlock(type: BlockType, over?: Partial<Block>) {
    const b = { ...newBlock(type), ...over } as Block;
    set((d) => {
      const i = sel.kind === "block" ? d.blocks.findIndex((x) => x.id === sel.blockId) : -1;
      const blocks = [...d.blocks];
      if (i >= 0) blocks.splice(i + 1, 0, b); else blocks.push(b);
      return { ...d, blocks };
    });
    setSel({ kind: "block", blockId: b.id });
  }
  const patchBlock = (id: string, patch: Partial<Block>) => set((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  function deleteBlock(id: string) { set((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) })); setSel({ kind: "doc" }); }
  function moveBlock(id: string, dir: -1 | 1) {
    set((d) => {
      const i = d.blocks.findIndex((b) => b.id === id); const j = i + dir;
      if (i < 0 || j < 0 || j >= d.blocks.length) return d;
      const blocks = [...d.blocks]; [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...d, blocks };
    });
  }
  const patchDoc = (patch: Partial<ReportDoc>) => set((d) => ({ ...d, ...patch }));

  /* ---------- sürükle-bırak sıralama ---------- */
  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  function reorder(srcId: string | null, destId: string) {
    if (!srcId || srcId === destId) return;
    set((d) => {
      const blocks = [...d.blocks];
      const si = blocks.findIndex((b) => b.id === srcId); if (si < 0) return d;
      const [m] = blocks.splice(si, 1);
      const di = blocks.findIndex((b) => b.id === destId);
      blocks.splice(di < 0 ? blocks.length : di, 0, m);
      return { ...d, blocks };
    });
  }
  const bumpZoom = (delta: number) => setZoom((z) => Math.min(2, Math.max(0.25, +(z + delta).toFixed(2))));

  /* ---------- klavye kısayolları ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel.kind === "block") { e.preventDefault(); deleteBlock(sel.blockId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // her render'da güncel sel/undo/redo kapanışı

  /* ---------- şablon ---------- */
  async function doSave(asNew = false) {
    const r = await api.saveReportTemplate({ id: asNew ? undefined : templateId ?? undefined, name: doc.name, description: doc.description, config: doc });
    if (r) { setTemplateId(r.id); refreshList(); flash("kaydedildi ✓"); }
  }
  async function doOpen(id: string) {
    const t = await api.reportTemplate(id);
    setOpenList(false);
    if (t && t.config) { reset(t.config as ReportDoc); setTemplateId(t.id); setSel({ kind: "doc" }); flash("açıldı"); }
  }
  function doNew() { setShowNew(true); }
  function applyTemplate(id: string) {
    const t = getTemplate(id); if (!t) return;
    reset(t.build(project, cat)); setTemplateId(null); setSel({ kind: "doc" }); setShowNew(false); flash(`${t.name} yüklendi`);
  }
  function doBlank() { reset(emptyDoc()); setTemplateId(null); setSel({ kind: "doc" }); setShowNew(false); }
  async function doDelete() { if (!templateId) return; await api.deleteReportTemplate(templateId); refreshList(); doNew(); flash("silindi"); }
  async function doDup() { const r = await api.saveReportTemplate({ name: `${doc.name} (kopya)`, description: doc.description, config: doc }); if (r) { setTemplateId(r.id); patchDoc({ name: r.name }); refreshList(); flash("çoğaltıldı ✓"); } }
  const themePatch = (p: Partial<NonNullable<ReportDoc["theme"]>>) => patchDoc({ theme: { ...(doc.theme ?? {}), ...p } });

  /* ---------- çıktı: PDF (yazdır) · CSV · paylaş ---------- */
  function doPdf() { window.print(); }
  function downloadText(text: string, name: string, type: string) {
    const blob = new Blob(["﻿" + text], { type });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvE = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  async function doCsv() {
    const out: string[] = [];
    for (const b of doc.blocks) {
      if (b.hidden || !isData(b.type)) continue;
      const ef: MetricFilters = { ...filters, ...(b.filter?.sprint ? { sprint: b.filter.sprint } : {}), ...(b.filter?.type ? { type: b.filter.type } : {}) };
      const d: any = await fetchBlock(b, ef);
      const title = b.caption || b.type;
      if (b.type === "table" && b.columns?.length && d) {
        const ms = (d.measures ?? []).filter((m: any) => b.columns!.includes(m.id));
        out.push(`# ${title}`, [b.dimension, ...ms.map((m: any) => m.title)].map(csvE).join(","));
        for (const r of d.rows ?? []) out.push([r.group, ...ms.map((m: any) => r[m.id] ?? "")].map(csvE).join(","));
      } else if (b.type === "signal" && Array.isArray(d) && d.length) {
        const cols = Object.keys(d[0]).filter((c) => c !== "summary");
        out.push(`# ${title}`, cols.map(csvE).join(","));
        for (const r of d) out.push(cols.map((c) => csvE(r[c])).join(","));
      } else if (b.type === "pivot" && Array.isArray(d) && d.length) {
        const rk: string[] = [], ck: string[] = [], mp = new Map<string, any>();
        for (const c of d) { if (!rk.includes(c.row)) rk.push(c.row); if (!ck.includes(c.col)) ck.push(c.col); mp.set(`${c.row}|${c.col}`, c.value ?? 0); }
        out.push(`# ${title}`, [`${b.dimension}\\${b.col}`, ...ck].map(csvE).join(","));
        for (const r of rk) out.push([r, ...ck.map((c) => mp.get(`${r}|${c}`) ?? "")].map(csvE).join(","));
      } else if (b.type === "kpi" && Array.isArray(d) && d.length) {
        out.push(`# ${title}`, d.map((t: any) => t.id).map(csvE).join(","), d.map((t: any) => t.value).map(csvE).join(","));
      }
      out.push("");
    }
    downloadText(out.join("\n"), `${doc.name}.csv`, "text/csv;charset=utf-8");
    flash("CSV indirildi");
  }
  async function doShare() {
    let id = templateId;
    if (!id) { const r = await api.saveReportTemplate({ name: doc.name, description: doc.description, config: doc }); if (r) { id = r.id; setTemplateId(r.id); refreshList(); } }
    if (!id) return;
    const url = `${location.origin}${location.pathname}#rapor=${id}&proje=${encodeURIComponent(project)}`;
    try { await navigator.clipboard.writeText(url); flash("paylaşım linki kopyalandı"); } catch { flash(url); }
  }

  const selBlock = sel.kind === "block" ? doc.blocks.find((b) => b.id === sel.blockId) : undefined;

  return (
    <div className="ws">
      {showNew && (
        <div className="rp-modal-bg" onClick={() => setShowNew(false)}>
          <div className="rp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-head">
              <div><div className="rp-modal-title">Yeni rapor</div><div className="rp-modal-sub">Hazır bir şablonla başla veya boş bir belge aç</div></div>
              <button className="wt wt-ic" onClick={() => setShowNew(false)} title="Kapat"><Icon n="blank" /></button>
            </div>
            <div className="rp-modal-grid">
              {TEMPLATES.map((t) => (
                <button className="rp-tpl" key={t.id} onClick={() => applyTemplate(t.id)}>
                  <div className="rp-tpl-ic"><Icon n={t.icon} size={22} /></div>
                  <div className="rp-tpl-body">
                    <div className="rp-tpl-name">{t.name}<span className="rp-tpl-pages">{t.pages}</span></div>
                    <div className="rp-tpl-desc">{t.desc}</div>
                  </div>
                </button>
              ))}
              <button className="rp-tpl rp-tpl-blank" onClick={doBlank}>
                <div className="rp-tpl-ic"><Icon n="blank" size={22} /></div>
                <div className="rp-tpl-body">
                  <div className="rp-tpl-name">Boş belge</div>
                  <div className="rp-tpl-desc">Sıfırdan başla — blokları kendin ekle (custom rapor).</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ---------- toolbar ---------- */}
      <div className="ws-toolbar">
        <span className="wt-title">Studio</span>
        <input className="rp-name" value={doc.name} onChange={(e) => patchDoc({ name: e.target.value })} title="rapor adı" />
        <button className="wt wt-ic" onClick={doNew} title="Yeni — dolu rapor"><Icon n="new" /></button>
        <button className="wt wt-ic" onClick={doBlank} title="Boş başla (custom)"><Icon n="blank" /></button>
        <div className="rp-open">
          <button className="wt wt-ic" onClick={() => { setOpenList((o) => !o); refreshList(); }} title="Aç"><Icon n="open" /></button>
          {openList && (
            <div className="rp-menu">
              {templates.length === 0 && <div className="rp-menu-empty">kayıtlı şablon yok</div>}
              {templates.map((t) => (
                <div key={t.id} className={`rp-menu-row ${t.id === templateId ? "on" : ""}`} onClick={() => doOpen(t.id)}>
                  <span>{t.name}</span><i>{new Date(t.updated_at).toLocaleDateString("tr-TR")}</i>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="wt wt-ic" onClick={() => doSave(false)} title="Kaydet"><Icon n="save" /></button>
        <button className="wt wt-ic" onClick={() => doSave(true)} title="Farklı kaydet"><Icon n="saveAs" /></button>
        <button className="wt wt-ic" onClick={doDup} title="Çoğalt"><Icon n="dup" /></button>
        {templateId && <button className="wt wt-ic" onClick={doDelete} title="Şablonu sil"><Icon n="trash" /></button>}
        <span className="wt-sep" />
        <button className="wt wt-ic" onClick={doPdf} title="PDF indir (yazdır → PDF kaydet)"><Icon n="pdf" /></button>
        <button className="wt wt-ic" onClick={doCsv} title="Veri (CSV) indir"><Icon n="csv" /></button>
        <button className="wt wt-ic" onClick={doShare} title="Paylaşım linki kopyala"><Icon n="share" /></button>
        <span className="sep" />
        <button className="wt wt-ic" onClick={undo} disabled={!canUndo} title="Geri al"><Icon n="undo" /></button>
        <button className="wt wt-ic" onClick={redo} disabled={!canRedo} title="İleri al"><Icon n="redo" /></button>
        <span className="grow" />
        {status && <span className="rp-status">{status}</span>}
        <button className="wt wt-ic" onClick={() => setNonce((n) => n + 1)} title="Verileri tazele"><Icon n="refresh" /></button>
        <span className="wt-sep" />
        <button className="wt wt-ic" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))} title="Uzaklaş"><Icon n="zoomout" /></button>
        <span className="wt-kpi"><b>{Math.round(zoom * 100)}%</b></span>
        <button className="wt wt-ic" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} title="Yakınlaş"><Icon n="zoomin" /></button>
        <button className="wt wt-ic" onClick={() => setZoom(0.8)} title="Sığdır"><Icon n="fit" /></button>
        <span className="wt-sep" />
        <button className={`wt wt-ic ${showGrid ? "on" : ""}`} onClick={() => setShowGrid((v) => !v)} title="Izgara"><Icon n="grid" /></button>
        <button className={`wt wt-ic ${showRuler ? "on" : ""}`} onClick={() => setShowRuler((v) => !v)} title="Cetvel"><Icon n="ruler" /></button>
        <button className={`wt wt-ic ${snapOn ? "on" : ""}`} onClick={() => setSnapOn((v) => !v)} title="Snap (5mm)"><Icon n="magnet" /></button>
      </div>

      <div className="ws-body">
        {/* ---------- EN SOL: dikey araç rayı ---------- */}
        <div className="rp-rail">
          <button className="rp-tool" title="KPI ekle" onClick={() => addBlock("kpi")}><Icon n="kpi" /></button>
          <button className="rp-tool" title="Tablo ekle (custom)" onClick={() => addBlock("table")}><Icon n="table" /></button>
          <button className="rp-tool" title="Çapraz pivot ekle" onClick={() => addBlock("pivot")}><Icon n="pivot" /></button>
          <button className="rp-tool" title="Grafik ekle" onClick={() => addBlock("chart")}><Icon n="chart" /></button>
          <button className="rp-tool" title="Sinyal ekle" onClick={() => addBlock("signal")}><Icon n="signal" /></button>
          <span className="rp-rail-sep" />
          <button className="rp-tool" title="Bölüm ayracı ekle" onClick={() => addBlock("divider")}><Icon n="divider" /></button>
          <button className="rp-tool" title="Vurgu kutusu ekle" onClick={() => addBlock("callout")}><Icon n="callout" /></button>
          <button className="rp-tool" title="Görsel ekle" onClick={() => addBlock("image")}><Icon n="image" /></button>
          <button className="rp-tool" title="Başlık ekle" onClick={() => addBlock("heading")}><Icon n="heading" /></button>
          <button className="rp-tool" title="Metin ekle" onClick={() => addBlock("text")}><Icon n="text" /></button>
          <button className="rp-tool" title="Boşluk ekle" onClick={() => addBlock("spacer")}><Icon n="spacer" /></button>
          <button className="rp-tool" title="İçindekiler (TOC) ekle" onClick={() => addBlock("toc")}><Icon n="toc" /></button>
          <button className="rp-tool" title="Sayfa sonu ekle" onClick={() => addBlock("pagebreak")}><Icon n="pbreak" /></button>
        </div>

        {/* ---------- SOL PANEL: filtre + belge yapısı ---------- */}
        <div className="rp-left" style={{ width: leftW }}>
          <div className="insp-sec">
            <h4>Global filtre</h4>
            <div className="insp-row"><span>proje</span><b>{project}</b></div>
            <label className="set-row"><span>sprint</span>
              <select className="set-in" value={gf.sprint} onChange={(e) => setGf((g) => ({ ...g, sprint: e.target.value }))}>
                <option value="">tümü</option>{opts.sprints.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="set-row"><span>tür</span>
              <select className="set-in" value={gf.type} onChange={(e) => setGf((g) => ({ ...g, type: e.target.value }))}>
                <option value="">tümü</option>{opts.types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <div className="set-row set-col"><span>tarih aralığı</span>
              <label className="rp-date-row"><i>≥</i><input className="set-in" type="date" value={gf.from} onChange={(e) => setGf((g) => ({ ...g, from: e.target.value }))} /></label>
              <label className="rp-date-row"><i>≤</i><input className="set-in" type="date" value={gf.to} onChange={(e) => setGf((g) => ({ ...g, to: e.target.value }))} /></label>
            </div>
            <div className="insp-hint">Tüm veri bloklarına uygulanır.</div>
          </div>
          <div className="insp-sec">
            <h4>Veri kaynağı</h4>
            <div className="rp-tree-grp">Ölçüler → grafik</div>
            {cat?.measures.map((m) => <div key={m.id} className="rp-tree-item" title="Grafik olarak ekle" onClick={() => addBlock("chart", { measure: m.id, caption: m.title })}>▧ {m.title}</div>)}
            <div className="rp-tree-grp">Sinyaller</div>
            {Object.entries(SIGNAL_LABELS).map(([k, v]) => <div key={k} className="rp-tree-item" title="Sinyal ekle" onClick={() => addBlock("signal", { signalId: k, caption: v })}>◆ {v}</div>)}
          </div>
          <div className="insp-sec">
            <h4>Belge yapısı <i className="rp-count">{doc.blocks.length}</i></h4>
            {doc.blocks.length === 0 && <div className="insp-hint">Boş · soldan blok ekle.</div>}
            {doc.blocks.map((b) => {
              const dnd = {
                draggable: true as const,
                onDragStart: () => { dragId.current = b.id; },
                onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragOver !== b.id) setDragOver(b.id); },
                onDragLeave: () => setDragOver((o) => (o === b.id ? null : o)),
                onDrop: (e: React.DragEvent) => { e.preventDefault(); reorder(dragId.current, b.id); setDragOver(null); dragId.current = null; },
                onDragEnd: () => { setDragOver(null); dragId.current = null; },
              };
              const over = dragOver === b.id ? "drag-over" : "";
              return b.type === "pagebreak"
                ? <div key={b.id} {...dnd} className={`rp-out rp-out-br ${over} ${sel.kind === "block" && sel.blockId === b.id ? "on" : ""}`} onClick={() => setSel({ kind: "block", blockId: b.id })}>⠿ — sayfa sonu —</div>
                : <div key={b.id} {...dnd} className={`rp-out rp-out-block ${over} ${sel.kind === "block" && sel.blockId === b.id ? "on" : ""} ${b.hidden ? "hid" : ""}`} onClick={() => setSel({ kind: "block", blockId: b.id })}>
                    <span className="rp-grip" title="sürükle">⠿</span>
                    <span className="rp-eye" onClick={(e) => { e.stopPropagation(); patchBlock(b.id, { hidden: !b.hidden }); }} title="göster/gizle">{b.hidden ? "◌" : "◉"}</span>
                    <span className="rp-out-lbl">{outLabel(b)}</span>
                  </div>;
            })}
          </div>
        </div>

        <div className="ws-resize-x" onMouseDown={dragX("left")} title="Sürükle: panel genişliği" />

        {/* ---------- ORTA: otomatik sayfalanan A4 tuval ---------- */}
        <ReportCanvas doc={doc} filters={filters} nonce={nonce} cat={cat} zoom={zoom} selId={sel.kind === "block" ? sel.blockId : undefined} onSelect={(id) => setSel({ kind: "block", blockId: id })} onBlank={() => setSel({ kind: "doc" })} onReorder={reorder} onZoom={bumpZoom} onPages={setPageCount} grid={showGrid} ruler={showRuler} snap={snapOn ? 5 : 0} onPosChange={(id, pos) => patchBlock(id, { pos })} />

        {/* ---------- SAĞ: ince ayar ---------- */}
        <div className="ws-resize-x" onMouseDown={dragX("insp")} title="Sürükle: panel genişliği" />
        <div className="ws-inspector" style={{ width: inspW }}>
          {sel.kind === "doc" && (
            <>
              <div className="insp-sec"><h4>Belge</h4>
                <label className="set-row"><span>Ad</span><input className="set-in" value={doc.name} onChange={(e) => patchDoc({ name: e.target.value })} /></label>
                <label className="set-row"><span>Açıklama</span><input className="set-in" value={doc.description} onChange={(e) => patchDoc({ description: e.target.value })} /></label>
              </div>
              <div className="insp-sec"><h4>Sayfa düzeni</h4>
                <label className="set-row"><span>Boyut</span>
                  <select className="set-in" value={doc.pageSize} onChange={(e) => patchDoc({ pageSize: e.target.value as ReportDoc["pageSize"] })}>
                    <option value="A4">A4</option><option value="A3">A3</option><option value="Letter">Letter</option>
                  </select>
                </label>
                <label className="set-row"><span>Yön</span>
                  <select className="set-in" value={doc.orientation} onChange={(e) => patchDoc({ orientation: e.target.value as ReportDoc["orientation"] })}>
                    <option value="portrait">Dikey</option><option value="landscape">Yatay</option>
                  </select>
                </label>
                <label className="set-row"><span>Kenar boşluğu (mm)</span><input className="set-in" type="number" value={doc.margin} onChange={(e) => patchDoc({ margin: Math.max(0, Number(e.target.value)) })} /></label>
                <label className="insp-row" style={{ cursor: "pointer" }}><span>Sayfa numarası</span><input type="checkbox" checked={doc.showPageNumbers} onChange={(e) => patchDoc({ showPageNumbers: e.target.checked })} /></label>
              </div>
              <div className="insp-sec"><h4>Kapak & kimlik</h4>
                <label className="insp-row" style={{ cursor: "pointer" }}><span>Kapak sayfası</span><input type="checkbox" checked={!!doc.cover} onChange={(e) => patchDoc({ cover: e.target.checked })} /></label>
                {doc.cover && <label className="set-row"><span>Kapak alt başlığı</span><input className="set-in" value={doc.coverSubtitle ?? ""} onChange={(e) => patchDoc({ coverSubtitle: e.target.value })} /></label>}
                <label className="set-row"><span>Üst bilgi (header)</span><input className="set-in" value={doc.header ?? ""} onChange={(e) => patchDoc({ header: e.target.value })} placeholder="{{proje}} · {{tarih}}" /></label>
                <label className="set-row"><span>Alt bilgi (footer)</span><input className="set-in" value={doc.footer ?? ""} onChange={(e) => patchDoc({ footer: e.target.value })} placeholder="{{raporAdı}}" /></label>
                <div className="insp-hint">Token: {"{{proje}} {{tarih}} {{sayfa}} {{toplamSayfa}} {{raporAdı}}"}</div>
              </div>
              <div className="insp-sec"><h4>Tema</h4>
                <label className="insp-row"><span>Vurgu rengi</span><input type="color" value={doc.theme?.accent ?? "#f3a82b"} onChange={(e) => themePatch({ accent: e.target.value })} /></label>
                <label className="insp-row"><span>Kağıt rengi</span><input type="color" value={doc.theme?.paper ?? "#ffffff"} onChange={(e) => themePatch({ paper: e.target.value })} /></label>
                <label className="set-row"><span>Yazı tipi</span>
                  <select className="set-in" value={doc.theme?.font ?? "sans"} onChange={(e) => themePatch({ font: e.target.value as "sans" | "serif" | "mono" })}>
                    <option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
                  </select>
                </label>
                <label className="set-row"><span>Filigran (TASLAK vb.)</span><input className="set-in" value={doc.watermark ?? ""} onChange={(e) => patchDoc({ watermark: e.target.value })} placeholder="boş = yok" /></label>
              </div>
            </>
          )}

          {sel.kind === "block" && selBlock && (
            <div className="insp-sec"><h4>{BLOCK_TITLE[selBlock.type]}</h4>
              {selBlock.type === "pagebreak" && <div className="insp-hint">Buradan sonrası yeni sayfadan başlar.</div>}
              {selBlock.type !== "pagebreak" && (
                <>
                  {!selBlock.pos && (
                    <label className="insp-row" style={{ cursor: "pointer" }}><span>Yeni sayfada başlat</span><input type="checkbox" checked={!!selBlock.breakBefore} onChange={(e) => patchBlock(selBlock.id, { breakBefore: e.target.checked || undefined })} /></label>
                  )}
                  <label className="insp-row" style={{ cursor: "pointer" }}><span>Serbest yerleştir</span><input type="checkbox" checked={!!selBlock.pos} onChange={(e) => patchBlock(selBlock.id, { pos: e.target.checked ? { page: 0, x: 20, y: 20, w: 90, h: 45, z: 1 } : undefined })} /></label>
                  {selBlock.pos && (
                    <>
                      <div className="rp-pos-grid">
                        <label><span>sayfa</span><input className="set-in" type="number" value={selBlock.pos.page} onChange={(e) => patchBlock(selBlock.id, { pos: { ...selBlock.pos!, page: Math.max(0, Number(e.target.value)) } })} /></label>
                        <label><span>z</span><input className="set-in" type="number" value={selBlock.pos.z ?? 1} onChange={(e) => patchBlock(selBlock.id, { pos: { ...selBlock.pos!, z: Number(e.target.value) } })} /></label>
                        <label><span>x</span><input className="set-in" type="number" value={selBlock.pos.x} onChange={(e) => patchBlock(selBlock.id, { pos: { ...selBlock.pos!, x: Number(e.target.value) } })} /></label>
                        <label><span>y</span><input className="set-in" type="number" value={selBlock.pos.y} onChange={(e) => patchBlock(selBlock.id, { pos: { ...selBlock.pos!, y: Number(e.target.value) } })} /></label>
                        <label><span>en</span><input className="set-in" type="number" value={selBlock.pos.w} onChange={(e) => patchBlock(selBlock.id, { pos: { ...selBlock.pos!, w: Number(e.target.value) } })} /></label>
                        <label><span>boy</span><input className="set-in" type="number" value={selBlock.pos.h} onChange={(e) => patchBlock(selBlock.id, { pos: { ...selBlock.pos!, h: Number(e.target.value) } })} /></label>
                      </div>
                      <div className="insp-hint">Tuvalde sürükle-taşı, köşeden boyutlandır (mm). {snapOn ? "Snap 5mm." : "Snap kapalı."}</div>
                    </>
                  )}
                </>
              )}
              {(selBlock.type === "heading" || selBlock.type === "text") && (
                <>
                  <label className="set-row"><span>İçerik</span>
                    {selBlock.type === "heading"
                      ? <input className="set-in" value={selBlock.text ?? ""} onChange={(e) => patchBlock(selBlock.id, { text: e.target.value })} />
                      : <textarea className="set-in" rows={5} value={selBlock.text ?? ""} onChange={(e) => patchBlock(selBlock.id, { text: e.target.value })} />}
                  </label>
                  {selBlock.type === "heading" && (
                    <label className="set-row"><span>Seviye</span>
                      <select className="set-in" value={selBlock.level} onChange={(e) => patchBlock(selBlock.id, { level: Number(e.target.value) as 1 | 2 | 3 })}>
                        <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
                      </select>
                    </label>
                  )}
                  <label className="set-row"><span>Hizalama</span>
                    <select className="set-in" value={selBlock.align} onChange={(e) => patchBlock(selBlock.id, { align: e.target.value as Block["align"] })}>
                      <option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option>
                    </select>
                  </label>
                  <label className="set-row"><span>Yazı boyutu (px, boş=oto)</span><input className="set-in" type="number" value={selBlock.size ?? ""} onChange={(e) => patchBlock(selBlock.id, { size: e.target.value ? Number(e.target.value) : undefined })} /></label>
                </>
              )}
              {selBlock.type === "spacer" && (
                <label className="set-row"><span>Yükseklik (mm)</span><input className="set-in" type="number" value={selBlock.height ?? 12} onChange={(e) => patchBlock(selBlock.id, { height: Math.max(1, Number(e.target.value)) })} /></label>
              )}
              {selBlock.type === "divider" && (
                <>
                  <label className="set-row"><span>Üst etiket (eyebrow)</span><input className="set-in" value={selBlock.caption ?? ""} onChange={(e) => patchBlock(selBlock.id, { caption: e.target.value })} placeholder="ör. 01 · GENEL DURUM" /></label>
                  <label className="set-row"><span>Başlık</span><input className="set-in" value={selBlock.text ?? ""} onChange={(e) => patchBlock(selBlock.id, { text: e.target.value })} placeholder="Bölüm adı" /></label>
                  <label className="set-row"><span>Renk (tone)</span>
                    <select className="set-in" value={selBlock.tone ?? "info"} onChange={(e) => patchBlock(selBlock.id, { tone: e.target.value as Block["tone"] })}>
                      <option value="info">info — nötr (mavi)</option><option value="good">good — iyi (yeşil)</option><option value="warn">warn — uyarı (sarı)</option><option value="bad">bad — risk (kırmızı)</option>
                    </select>
                  </label>
                </>
              )}
              {selBlock.type === "callout" && (
                <>
                  <label className="set-row"><span>Metin — <code>{"{{ölçü}}"}</code> token destekli</span><textarea className="set-in" rows={4} value={selBlock.text ?? ""} onChange={(e) => patchBlock(selBlock.id, { text: e.target.value })} placeholder="Toplam {{total}} iş kaydı var." /></label>
                  <div className="set-row"><span>Token ölçüleri (metinde kullanılacak)</span>
                    <div className="rp-cols">
                      {cat?.measures.map((m) => {
                        const on = selBlock.measures?.includes(m.id) ?? false;
                        return <label key={m.id} className={`rp-col ${on ? "on" : ""}`}><input type="checkbox" checked={on} onChange={() => { const cur = selBlock.measures ?? []; patchBlock(selBlock.id, { measures: on ? cur.filter((x) => x !== m.id) : [...cur, m.id] }); }} />{m.id}</label>;
                      })}
                    </div>
                  </div>
                  <label className="set-row"><span>Renk (tone)</span>
                    <select className="set-in" value={selBlock.tone ?? "info"} onChange={(e) => patchBlock(selBlock.id, { tone: e.target.value as Block["tone"] })}>
                      <option value="info">info — nötr (mavi)</option><option value="good">good — iyi (yeşil)</option><option value="warn">warn — uyarı (sarı)</option><option value="bad">bad — risk (kırmızı)</option>
                    </select>
                  </label>
                </>
              )}
              {selBlock.type === "image" && (
                <>
                  <label className="set-row"><span>Dosyadan yükle</span>
                    <input className="set-in" type="file" accept="image/*" onChange={(e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const r = new FileReader();
                      r.onload = () => patchBlock(selBlock.id, { src: String(r.result) });
                      r.readAsDataURL(f);
                      e.target.value = "";
                    }} />
                  </label>
                  {selBlock.src?.startsWith("data:")
                    ? <div className="insp-row"><span>✓ gömülü (~{Math.round((selBlock.src.length * 0.75) / 1024)} KB)</span><button className="rp-mini-btn" onClick={() => patchBlock(selBlock.id, { src: undefined })}>kaldır</button></div>
                    : <label className="set-row"><span>veya URL</span><input className="set-in" value={selBlock.src ?? ""} onChange={(e) => patchBlock(selBlock.id, { src: e.target.value || undefined })} placeholder="https://… / data:image/…" /></label>}
                  <label className="set-row"><span>Altyazı</span><input className="set-in" value={selBlock.caption ?? ""} onChange={(e) => patchBlock(selBlock.id, { caption: e.target.value })} placeholder="opsiyonel" /></label>
                  <label className="set-row"><span>Hizalama</span>
                    <select className="set-in" value={selBlock.align ?? "center"} onChange={(e) => patchBlock(selBlock.id, { align: e.target.value as Block["align"] })}>
                      <option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option>
                    </select>
                  </label>
                  <div className="insp-hint">Boyut/konum için yukarıdaki <b>Serbest yerleştir</b>'i aç — görseli tuvalde sürükle-taşı, köşeden boyutlandır.</div>
                </>
              )}
              {(["kpi", "table", "pivot", "chart", "signal"] as BlockType[]).includes(selBlock.type) && (
                <>
                  <label className="set-row"><span>Başlık (caption)</span><input className="set-in" value={selBlock.caption ?? ""} onChange={(e) => patchBlock(selBlock.id, { caption: e.target.value })} placeholder="opsiyonel" /></label>
                  {selBlock.type === "kpi" && (
                    <div className="set-row"><span>Göstergeler (ölçüler)</span>
                      <div className="rp-cols">
                        {cat?.measures.map((m) => {
                          const on = selBlock.measures?.includes(m.id) ?? false;
                          return <label key={m.id} className={`rp-col ${on ? "on" : ""}`}><input type="checkbox" checked={on} onChange={() => { const cur = selBlock.measures ?? []; patchBlock(selBlock.id, { measures: on ? cur.filter((x) => x !== m.id) : [...cur, m.id] }); }} />{m.title}</label>;
                        })}
                      </div>
                    </div>
                  )}
                  {(selBlock.type === "pivot" || selBlock.type === "chart") && (
                    <label className="set-row"><span>Ölçü</span>
                      <select className="set-in" value={selBlock.measure} onChange={(e) => patchBlock(selBlock.id, { measure: e.target.value })}>
                        {cat?.measures.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                      </select>
                    </label>
                  )}
                  {(selBlock.type === "table" || selBlock.type === "pivot" || selBlock.type === "chart") && (
                    <label className="set-row"><span>{selBlock.type === "pivot" ? "Satır boyutu" : "Boyut"}</span>
                      <select className="set-in" value={selBlock.dimension} onChange={(e) => patchBlock(selBlock.id, { dimension: e.target.value })}>
                        {cat?.dimensions.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                      </select>
                    </label>
                  )}
                  {(selBlock.type === "pivot" || (selBlock.type === "chart" && selBlock.chartType === "stacked")) && (
                    <label className="set-row"><span>{selBlock.type === "pivot" ? "Sütun boyutu" : "Kırılım boyutu"}</span>
                      <select className="set-in" value={selBlock.col} onChange={(e) => patchBlock(selBlock.id, { col: e.target.value })}>
                        {cat?.dimensions.filter((d) => d.id !== selBlock.dimension).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                      </select>
                    </label>
                  )}
                  {selBlock.type === "chart" && (
                    <>
                      <label className="set-row"><span>Grafik tipi</span>
                        <select className="set-in" value={selBlock.chartType} onChange={(e) => patchBlock(selBlock.id, { chartType: e.target.value as Block["chartType"] })}>
                          <option value="bar">Bar (dikey)</option>
                          <option value="hbar">Bar (yatay)</option>
                          <option value="line">Çizgi</option>
                          <option value="area">Alan</option>
                          <option value="donut">Donut</option>
                          <option value="stacked">Yığılmış bar (crosstab)</option>
                          <option value="trend">Trend (açılan/çözülen/backlog)</option>
                        </select>
                      </label>
                      {(selBlock.chartType === "trend" || selBlock.chartType === "area") && (
                        <label className="set-row"><span>Trend kaynağı</span>
                          <select className="set-in" value={selBlock.trendSrc ?? "work"} onChange={(e) => patchBlock(selBlock.id, { trendSrc: e.target.value as Block["trendSrc"] })}>
                            <option value="work">İş kalemleri (Jira)</option>
                            <option value="mr">Merge request'ler (GitLab)</option>
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  {selBlock.type === "signal" && (
                    <>
                      <label className="set-row"><span>Sinyal</span>
                        <select className="set-in" value={selBlock.signalId ?? "aging"} onChange={(e) => patchBlock(selBlock.id, { signalId: e.target.value })}>
                          {Object.entries(SIGNAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </label>
                      <label className="set-row"><span>Gösterim</span>
                        <select className="set-in" value={selBlock.signalView ?? "summary"} onChange={(e) => patchBlock(selBlock.id, { signalView: e.target.value as Block["signalView"] })}>
                          <option value="summary">Özet (grafik/kompakt tablo)</option>
                          <option value="table">Ham tablo (tüm satırlar)</option>
                        </select>
                      </label>
                    </>
                  )}
                  {selBlock.type === "table" && (
                    <div className="set-row"><span>Sütunlar — <b style={{ color: "var(--amber)" }}>custom</b>, sen seç</span>
                      <div className="rp-cols">
                        {cat?.measures.map((m) => {
                          const on = selBlock.columns?.includes(m.id) ?? false;
                          return <label key={m.id} className={`rp-col ${on ? "on" : ""}`}><input type="checkbox" checked={on} onChange={() => { const cur = selBlock.columns ?? []; patchBlock(selBlock.id, { columns: on ? cur.filter((x) => x !== m.id) : [...cur, m.id] }); }} />{m.title}</label>;
                        })}
                      </div>
                    </div>
                  )}
                  <label className="set-row"><span>Genişlik</span>
                    <select className="set-in" value={selBlock.span ?? "full"} onChange={(e) => patchBlock(selBlock.id, { span: e.target.value as Block["span"] })}>
                      <option value="full">Tam genişlik</option><option value="half">Yarım (yan yana)</option>
                    </select>
                  </label>
                  <label className="set-row"><span>Açıklama (başlık altı not)</span><textarea className="set-in" rows={2} value={selBlock.note ?? ""} onChange={(e) => patchBlock(selBlock.id, { note: e.target.value || undefined })} placeholder="Bu blok neyi gösterir, neye bakılır?" /></label>
                  <label className="insp-row" style={{ cursor: "pointer" }}><span>Veri boşsa gizle</span><input type="checkbox" checked={!!selBlock.hideIfEmpty} onChange={(e) => patchBlock(selBlock.id, { hideIfEmpty: e.target.checked })} /></label>
                  <div className="insp-sub">Filtre ezme (bu blok)</div>
                  <label className="set-row"><span>sprint</span>
                    <select className="set-in" value={selBlock.filter?.sprint ?? ""} onChange={(e) => patchBlock(selBlock.id, { filter: { ...(selBlock.filter ?? {}), sprint: e.target.value || undefined } })}>
                      <option value="">(global)</option>{opts.sprints.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="set-row"><span>tür</span>
                    <select className="set-in" value={selBlock.filter?.type ?? ""} onChange={(e) => patchBlock(selBlock.id, { filter: { ...(selBlock.filter ?? {}), type: e.target.value || undefined } })}>
                      <option value="">(global)</option>{opts.types.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </>
              )}
              <div className="set-actions">
                <button onClick={() => moveBlock(selBlock.id, -1)} title="Yukarı">↑</button>
                <button onClick={() => moveBlock(selBlock.id, 1)} title="Aşağı">↓</button>
                <button onClick={() => deleteBlock(selBlock.id)}>Sil</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- durum çubuğu ---------- */}
      <div className="ws-status">
        <span className="st">Sayfa <b>{pageCount}</b></span>
        <span className="st">Blok <b>{doc.blocks.length}</b></span>
        <span className="st amber">Zoom <b>{Math.round(zoom * 100)}%</b></span>
        <span className="st">{sel.kind === "block" && selBlock ? `Seçili: ${BLOCK_TITLE[selBlock.type]}` : "Belge"}</span>
        <span className="grow" />
        <span className="st">{doc.pageSize} · {doc.orientation === "portrait" ? "dikey" : "yatay"}</span>
        <span className="st">{templateId ? "kayıtlı" : "kaydedilmedi"}</span>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Workspace } from "../components/Workspace";
import { ForceGraph, type GNode } from "../components/ForceGraph";

import { nodeLink as linkFor, jiraUrl } from "../jira";

interface CNode { id: string; kind: string; label?: string; type?: string; risk?: number; total?: number; approvals?: number; mrs?: number; reviewers?: number; title?: string; repo?: string; iid?: string; state?: string; cat?: string }
interface CLink { source: string; target: string; value: number; rel: string; directed?: boolean; color?: string }
type Graph = { nodes: CNode[]; links: CLink[] };

/** Rol/tür → şekil ikonu. Kişi ⬡ · Repo ▣ · MR ▭ · Story ○ · Görev □ · Hata △ · Alt ◇ */
function ShapeIcon({ kind, type, color, size = 15 }: { kind?: string; type?: string; color: string; size?: number }) {
  const t = (type ?? "").toLowerCase(); const c = size / 2; const r = size / 2 - 1.5;
  const common = { stroke: "currentColor", fill: "transparent", strokeWidth: 2 } as const;
  const hex = [...Array(6)].map((_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${c + Math.cos(a) * r},${c + Math.sin(a) * r}`; }).join(" ");
  let el: JSX.Element;
  if (kind === "person") el = <polygon points={hex} {...common} />;
  else if (kind === "repo") el = <rect x={c - r * 0.85} y={c - r * 0.85} width={r * 1.7} height={r * 1.7} {...common} />;
  else if (kind === "mr") el = <rect x={c - r * 0.8} y={c - r * 0.6} width={r * 1.6} height={r * 1.2} {...common} />;
  else if (/hata|bug/.test(t)) el = <polygon points={`${c},${c - r} ${c + r},${c + r * 0.82} ${c - r},${c + r * 0.82}`} {...common} />;
  else if (/alt.?g[öo]rev|sub.?task/.test(t)) el = <polygon points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} {...common} />;
  else if (/g[öo]rev|task/.test(t)) el = <rect x={c - r * 0.8} y={c - r * 0.8} width={r * 1.6} height={r * 1.6} {...common} />;
  else el = <circle cx={c} cy={c} r={r} {...common} />;
  return <svg className="un-ico" width={size} height={size} style={{ color, flex: "0 0 auto", overflow: "visible" }}>{el}</svg>;
}

/** Düğümü şekil-kategorisine indir (filtre anahtarı). */
function shapeKey(n: { kind?: string; type?: string }): string {
  if (n.kind === "person") return "person";
  if (n.kind === "repo") return "repo";
  if (n.kind === "mr") return "mr";
  const t = (n.type ?? "").toLowerCase();
  if (/hata|bug/.test(t)) return "bug";
  if (/alt.?g[öo]rev|sub.?task/.test(t)) return "subtask";
  if (/epic/.test(t)) return "epic";
  if (/story|hikaye/.test(t)) return "story";
  if (/g[öo]rev|task/.test(t)) return "task";
  return "other";
}
const SHAPES: { key: string; kind?: string; type?: string; color: string; label: string }[] = [
  { key: "person", kind: "person", color: "#5fb4a8", label: "Kişi" },
  { key: "repo", kind: "repo", color: "#57c98a", label: "Repo" },
  { key: "mr", kind: "mr", color: "#5a6b8c", label: "MR" },
  { key: "task", type: "Görev", color: "#9aa7bd", label: "Görev" },
  { key: "bug", type: "Hata", color: "#ff5c6c", label: "Hata" },
  { key: "story", type: "Story", color: "#8bd17c", label: "Story" },
  { key: "subtask", type: "Alt görev", color: "#9aa7bd", label: "Alt görev" },
  { key: "epic", type: "Epic", color: "#d98cff", label: "Epic" },
];

// Düğüm dış linkleri ortak jira.ts'ten (nodeLink → linkFor) gelir.

function mergeGraph(base: Graph, add: Graph): Graph {
  const m = new Map(base.nodes.map((n) => [n.id, n])); for (const n of add.nodes) if (!m.has(n.id)) m.set(n.id, n);
  const s = new Set(base.links.map((e) => `${e.source}|${e.target}|${e.rel}`)); const out = [...base.links];
  for (const e of add.links) { const k = `${e.source}|${e.target}|${e.rel}`; if (!s.has(k)) { s.add(k); out.push(e); } }
  return { nodes: [...m.values()], links: out };
}

/**
 * Collab — Knowledge (sahiplik) + Review (işbirliği) birleşik ağ, Universe modeliyle.
 * ARA (kişi/repo) → sonuca tıkla → o düğümün ağacı açılır (focus) → dallan → ileri/geri + breadcrumb.
 * "all" modunda tüm ağ; tıkla → ilgisizler kararır, düğüm + bağlıları parlar, ortalanır.
 */
export function Collab() {
  const [all, setAll] = useState<Graph>({ nodes: [], links: [] });     // tüm evren
  const [focusSeed, setFocusSeed] = useState<Graph>({ nodes: [], links: [] });
  const [mode, setMode] = useState<"all" | "focus">("all");
  const [hoods, setHoods] = useState<Map<string, Graph>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [layers, setLayers] = useState({ own: true, review: true, ego: true });
  const [types, setTypes] = useState<Record<string, boolean>>({}); // boş = hepsi açık (?? true)
  const [frozen, setFrozen] = useState(false);
  const [labels, setLabels] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const [coord, setCoord] = useState({ x: 0, y: 0 });
  const [fitNonce, setFitNonce] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  const [history, setHistory] = useState<{ sel: string; exp: string[] }[]>([]);
  const [hidx, setHidx] = useState(-1);
  const hidxRef = useRef(-1);
  const [stats, setStats] = useState({ merged: 0, reviewed: 0, unreviewed: 0, reviewedPct: 0, avgApprovers: 0 });
  const [load, setLoad] = useState<{ reviewer: string; approvals: string; authors: string }[]>([]);
  const [contrib, setContrib] = useState<{ person: string; repos: string; mrs: string }[]>([]);
  // arama
  const [q, setQ] = useState("");
  const [showRes, setShowRes] = useState(false);

  useEffect(() => {
    api.collab().then((g) => setAll({ nodes: g.nodes, links: g.links }));
    api.reviewStats().then(setStats);
    api.reviewLoad().then(setLoad);
    api.contributors().then(setContrib);
  }, []);

  const seed = mode === "all" ? all : focusSeed;

  // görünür graf: seed (katman filtreli) + açık düğümlerin hood'ları
  const visible = useMemo<Graph>(() => {
    let g: Graph = { nodes: seed.nodes, links: seed.links.filter((l) => (layers as any)[l.rel] ?? true) };
    for (const k of expanded) { const h = hoods.get(k); if (h) g = mergeGraph(g, h); }
    // şekil/tür filtresi: sadece seçili şekiller + bağlı oldukları kenarlar
    const keepId = new Set(g.nodes.filter((n) => types[shapeKey(n)] ?? true).map((n) => n.id));
    const links = g.links.filter((l) => keepId.has(l.source) && keepId.has(l.target));
    const refd = new Set<string>(); links.forEach((l) => { refd.add(l.source); refd.add(l.target); });
    // all modunda izole kişiler de görünür; focus modunda sadece ağaçtakiler
    const nodes = g.nodes.filter((n) => keepId.has(n.id) && ((mode === "all" && n.kind === "person") || refd.has(n.id)));
    return { nodes, links };
  }, [seed, hoods, expanded, layers, mode, types]);

  // "Sadece seçili kişi": seçiliye değmeyen (diğer kişi-kişi) bağları gizle
  const shown = useMemo<Graph>(() => {
    if (!(layers.ego && selected)) return visible;
    const links = visible.links.filter((l) => l.source === selected || l.target === selected);
    const refd = new Set<string>([selected]); links.forEach((l) => { refd.add(l.source); refd.add(l.target); });
    return { nodes: visible.nodes.filter((n) => refd.has(n.id)), links };
  }, [visible, layers.ego, selected]);

  const byId = useMemo(() => new Map(visible.nodes.map((n) => [n.id, n])), [visible]);
  const neighbors = useMemo(() => {
    const s = new Set<string>();
    if (selected) for (const e of visible.links) { if (e.source === selected) s.add(e.target); if (e.target === selected) s.add(e.source); }
    return s;
  }, [selected, visible]);

  const center = () => setFocusNonce((n) => n + 1);
  const pushStep = (sel: string, exp: string[]) => {
    setHistory((h) => { const base = h.slice(0, hidxRef.current + 1); const nb = [...base, { sel, exp }]; hidxRef.current = nb.length - 1; setHidx(hidxRef.current); return nb; });
  };
  const applyStep = (s: { sel: string; exp: string[] }) => { setSelected(s.sel); setExpanded(new Set(s.exp)); center(); };

  // hood = düğümün temel komşuluğu (+ kişiyse MR/kart hood'u)
  const loadHood = async (id: string): Promise<Graph> => {
    const cached = hoods.get(id); if (cached) return cached;
    const nbrs = new Set<string>([id]);
    for (const l of all.links) { if (l.source === id) nbrs.add(l.target); if (l.target === id) nbrs.add(l.source); }
    let g: Graph = { nodes: all.nodes.filter((n) => nbrs.has(n.id)), links: all.links.filter((l) => nbrs.has(l.source) && nbrs.has(l.target)) };
    const node = all.nodes.find((n) => n.id === id) ?? byId.get(id);
    if (node?.kind === "person") { const h = await api.collabPerson(id); g = mergeGraph(g, { nodes: h.nodes, links: h.links }); }
    setHoods((m) => new Map(m).set(id, g));
    return g;
  };

  const onNodeClick = async (id: string) => {
    const n = byId.get(id); if (!n) return;
    // TÜM AĞ modunda: history yok — sadece seç + karart + ortala. Ağaç/geçmiş aramayla (focus) başlar.
    if (mode === "all") { setSelected(id); center(); return; }
    // FOCUS modunda: ağacı büyüt + geçmişe ekle
    if (id === selected && expanded.has(id)) {
      const ne = new Set(expanded); ne.delete(id); setExpanded(ne); setSelected(id); pushStep(id, [...ne]); center(); return;
    }
    setSelected(id); center();
    if (!expanded.has(id)) {
      await loadHood(id);
      const ne = new Set(expanded).add(id); setExpanded(ne); pushStep(id, [...ne]);
    } else {
      pushStep(id, [...expanded]);
    }
  };

  // ARA → sonuca tıkla: o düğümün ağacını focus modunda aç
  const focusNode = async (id: string) => {
    setShowRes(false); setQ(id);
    const g = await loadHood(id);
    setMode("focus"); setFocusSeed(g); setExpanded(new Set([id])); setSelected(id);
    setHistory([{ sel: id, exp: [id] }]); hidxRef.current = 0; setHidx(0); setRestartKey((k) => k + 1); center();
  };

  const back = () => { if (hidxRef.current > 0) { hidxRef.current--; setHidx(hidxRef.current); applyStep(history[hidxRef.current]); } };
  const forward = () => { if (hidxRef.current < history.length - 1) { hidxRef.current++; setHidx(hidxRef.current); applyStep(history[hidxRef.current]); } };
  const jump = (i: number) => { hidxRef.current = i; setHidx(i); applyStep(history[i]); };
  const cut = (i: number) => {
    const nb = history.slice(0, i); setHistory(nb);
    if (hidxRef.current >= i) { hidxRef.current = nb.length - 1; setHidx(hidxRef.current); if (nb[hidxRef.current]) applyStep(nb[hidxRef.current]); else { setSelected(null); setExpanded(new Set()); } }
  };
  const reset = () => { setMode("all"); setExpanded(new Set()); setSelected(null); setHistory([]); hidxRef.current = -1; setHidx(-1); setQ(""); setRestartKey((k) => k + 1); };

  const results = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    return all.nodes.filter((n) => (n.kind === "person" || n.kind === "repo") && (n.id.toLowerCase().includes(s) || (n.label ?? "").toLowerCase().includes(s))).slice(0, 25);
  }, [q, all]);

  const baseColor = (n: CNode): string => {
    if (n.kind === "repo") { const r = n.risk ?? 0; return r > 0.75 ? "#ff5c6c" : r > 0.6 ? "#f3a82b" : "#57c98a"; }
    if (n.kind === "mr") return "#5a6b8c";
    if (n.kind === "work") { const t = (n.type ?? "").toLowerCase(); return /bug|hata/.test(t) ? "#ff5c6c" : /story|hikaye/.test(t) ? "#8bd17c" : "#9aa7bd"; }
    const ap = n.approvals ?? 0; return ap > 100 ? "#ff5c6c" : ap > 40 ? "#f3a82b" : "#5fb4a8";
  };
  const colorOf = (gn: GNode) => {
    const n = byId.get((gn as any).id); if (!n) return "#7f8aa3";
    if (selected && n.id !== selected && !neighbors.has(n.id)) return "#283040";
    if (selected && n.id === selected) return "#ffffff";
    return baseColor(n);
  };

  const data = useMemo(() => ({
    nodes: shown.nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label, type: n.type })),
    links: shown.links.map((e) => ({ source: e.source, target: e.target, value: e.value, directed: e.directed, color: e.color })),
  }), [shown]);

  const sel = selected ? byId.get(selected) : undefined;
  const relations = selected ? visible.links.filter((e) => e.source === selected || e.target === selected)
    .map((e) => (e.source === selected ? { k: e.target, rel: e.rel, dir: "→" } : { k: e.source, rel: e.rel, dir: "←" })) : [];

  const topRisk = useMemo(() =>
    all.nodes.filter((n) => n.kind === "repo").map((n) => ({ repo: n.id, label: n.label, pct: Math.round((n.risk ?? 0) * 100) }))
      .sort((a, b) => b.pct - a.pct).slice(0, 6), [all]);
  const peopleRows = useMemo(() => {
    const lm = new Map(load.map((r) => [r.reviewer, r]));
    return contrib.map((c) => ({ person: c.person, repos: c.repos, mrs: c.mrs, approvals: lm.get(c.person)?.approvals ?? "0", authors: lm.get(c.person)?.authors ?? "0" }));
  }, [contrib, load]);

  return (
    <Workspace
      toolbar={
        <>
          <div className="wt-title">Collab</div>
          <button className="wt" onClick={back} disabled={hidx <= 0} title="Geri"><span className="g">◂</span></button>
          <button className="wt" onClick={forward} disabled={hidx >= history.length - 1} title="İleri"><span className="g">▸</span></button>
          <div style={{ position: "relative" }}>
            <input value={q} onChange={(e) => { setQ(e.target.value); setShowRes(true); }} onFocus={() => results.length && setShowRes(true)} placeholder="kişi / repo ara…"
              style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line-2)", padding: "7px 12px", fontFamily: "var(--mono)", fontSize: 12, width: 210 }} />
            {showRes && results.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 40, width: 360, maxHeight: 320, overflow: "auto", background: "var(--ink-2)", border: "1px solid var(--line-2)" }}>
                {results.map((r) => (
                  <div key={r.id} onMouseDown={(e) => e.preventDefault()} onClick={() => focusNode(r.id)} style={{ padding: "7px 10px", borderBottom: "1px solid var(--line)", cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}>
                    <ShapeIcon kind={r.kind} color={baseColor(r)} size={12} />
                    <span style={{ fontSize: 12, color: "var(--bone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.kind === "person" ? r.id : r.label}</span>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--dim)", fontSize: 10, marginLeft: "auto" }}>{r.kind === "person" ? "kişi" : "repo"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="wt" onClick={() => setFitNonce((k) => k + 1)}><span className="g">⌖</span> Fit</button>
          <button className="wt" onClick={reset}><span className="g">⟳</span> Tümü</button>
          <span className="wt-sep" />
          <button className={`wt ${layers.own ? "on" : ""}`} onClick={() => setLayers((l) => ({ ...l, own: !l.own }))} title="Sahiplik: kişi↔repo"><span className="g">▣</span> Sahiplik</button>
          <button className={`wt ${layers.review ? "on" : ""}`} onClick={() => setLayers((l) => ({ ...l, review: !l.review }))} title="Review: yazar→onaylayan"><span className="g" style={{ color: "#6ea8fe" }}>→</span> Review</button>
          <button className={`wt ${layers.ego ? "on" : ""}`} onClick={() => setLayers((l) => ({ ...l, ego: !l.ego }))} title="Açık: sadece seçili kişinin bağları; diğer kişilerin birbiriyle bağları gizlenir"><span className="g">◉</span> Sadece seçili</button>
          <span className="wt-sep" />
          <button className={`wt ${frozen ? "on" : ""}`} onClick={() => setFrozen((f) => !f)} title="Dondur"><span className="g">❄</span></button>
          <button className={`wt ${labels ? "on" : ""}`} onClick={() => setLabels((l) => !l)} title="Etiket"><span className="g">A</span></button>
          <span className="grow" />
          <span className="wt-kpi">{mode === "focus" ? "FOCUS" : "TÜM AĞ"}</span>
          <span className="wt-kpi" style={{ color: stats.reviewedPct < 60 ? "var(--bad)" : "var(--good)" }}>onaylı <b>%{stats.reviewedPct}</b></span>
          <span className="wt-kpi" style={{ color: "var(--bad)" }}>onaysız <b>{stats.unreviewed}</b></span>
        </>
      }
      rail={<>
        <button className="on" title="Seç/sürükle">⬚</button>
        <button title="Geri" onClick={back}>◂</button>
        <button title="İleri" onClick={forward}>▸</button>
        <button title="Sığdır (Fit)" onClick={() => setFitNonce((k) => k + 1)}>⌖</button>
        <button title="Tüm ağa dön" onClick={reset}>⟳</button>
        <span className="spring" />
        <button title="Ayarlar">⚙</button>
      </>}
      inspector={
        <>
          <div className="insp-sec">
            <h4>Seçili</h4>
            {!sel && <div className="insp-row"><span>ara veya bir düğüme tıkla</span></div>}
            {sel?.kind === "person" && <>
              <div className="insp-row"><span style={{ color: "var(--bone)" }}>⬡ {sel.id}</span></div>
              <div className="insp-row"><span>MR (yazar)</span><b className="num">{sel.mrs}</b></div>
              <div className="insp-row"><span>onayladığı</span><b className="num">{sel.approvals}</b></div>
              <div className="insp-row"><span>onu onaylayan</span><b className="num">{sel.reviewers}</b></div>
              {expanded.has(sel.id) && <div className="insp-row" style={{ marginTop: 6, cursor: "pointer", color: "var(--dim)" }} onClick={() => onNodeClick(sel.id)}>↩ bağlıları kapat</div>}
            </>}
            {sel?.kind === "repo" && <>
              <div className="insp-row"><span style={{ color: "var(--bone)" }} title={sel.id}>▣ {sel.label}</span></div>
              <div className="insp-row"><span>bus-factor</span><b className="num" style={{ color: (sel.risk ?? 0) > 0.75 ? "var(--bad)" : (sel.risk ?? 0) > 0.6 ? "var(--amber)" : "var(--good)" }}>%{Math.round((sel.risk ?? 0) * 100)}</b></div>
              <div className="insp-row"><span>toplam MR</span><b className="num">{sel.total}</b></div>
              <div className="insp-hint">tek kişi payı yüksekse bilgi o kişide kilitli.</div>
            </>}
            {sel?.kind === "mr" && <>
              <div className="insp-row"><span style={{ color: "var(--bone)" }}>▭ {sel.label}</span><span className="tag">{sel.state}</span></div>
              <div className="insp-hint">{sel.title}</div>
              {linkFor(sel) && <a className="insp-btn" href={linkFor(sel)} target="_blank" rel="noreferrer">GitLab'da aç ↗</a>}
            </>}
            {sel?.kind === "work" && <>
              <div className="insp-row"><span style={{ color: "var(--bone)" }}>{sel.label}</span><span className="tag">{sel.type}</span></div>
              <div className="insp-hint">{sel.title}</div>
              <a className="insp-btn" href={jiraUrl(sel.id)} target="_blank" rel="noreferrer">Jira'da aç ↗</a>
            </>}
          </div>

          {sel && (
            <div className="insp-sec">
              <h4>Bağlılar ({relations.length})</h4>
              {relations.length === 0 && <div className="insp-row"><span>bağ yok</span></div>}
              {relations.slice(0, 40).map((r, i) => {
                const n = byId.get(r.k);
                return (
                  <div className="insp-row" key={i} style={{ cursor: "pointer" }} onClick={() => onNodeClick(r.k)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--dim)" }}>
                      <ShapeIcon kind={n?.kind} type={n?.type} color={n ? baseColor(n) : "#7f8aa3"} size={11} />
                      {r.dir} {(n?.label ?? r.k).length > 16 ? (n?.label ?? r.k).slice(0, 15) + "…" : (n?.label ?? r.k)}
                    </span>
                    <b style={{ fontSize: 9, color: "var(--dim)" }}>{r.rel}</b>
                  </div>
                );
              })}
            </div>
          )}

          <div className="insp-sec">
            <h4>En riskli repo'lar (bus-factor)</h4>
            {topRisk.map((r) => (
              <div className="insp-row" key={r.repo} style={{ cursor: "pointer" }} onClick={() => focusNode(r.repo)}>
                <span title={r.repo}>{(r.label ?? r.repo).length > 18 ? "…" + (r.label ?? r.repo).slice(-17) : (r.label ?? r.repo)}</span>
                <b className="num" style={{ color: r.pct > 75 ? "var(--bad)" : r.pct > 60 ? "var(--amber)" : "var(--good)" }}>%{r.pct}</b>
              </div>
            ))}
          </div>

          <div className="insp-sec">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Şekil filtresi</h4>
              <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim)", cursor: "pointer" }} onClick={() => setTypes({})}>hepsi</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim)", cursor: "pointer" }} onClick={() => setTypes(Object.fromEntries(SHAPES.map((s) => [s.key, false])))}>hiçbiri</span>
              </span>
            </div>
            {SHAPES.map((s) => {
              const on = types[s.key] ?? true;
              return (
                <div className="insp-legend" key={s.key} style={{ cursor: "pointer", opacity: on ? 1 : 0.38 }} onClick={() => setTypes((t) => ({ ...t, [s.key]: !(t[s.key] ?? true) }))}>
                  <ShapeIcon kind={s.kind} type={s.type} color={s.color} size={12} /> {s.label}
                  <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 9, color: on ? "var(--good)" : "var(--dim)" }}>{on ? "açık" : "gizli"}</span>
                </div>
              );
            })}
            <div className="insp-legend" style={{ marginTop: 6, cursor: "default", opacity: 0.8 }}><span className="sw" style={{ background: "#6ea8fe", borderColor: "#6ea8fe" }} /> → review bağı (yazar→onaylayan)</div>
          </div>
        </>
      }
      dock={
        <>
          <div className="dock-head">
            <h4>Kişiler ({peopleRows.length})</h4>
            <span className="tag">satıra tıkla → ağacını aç</span>
          </div>
          <table>
            <thead><tr><th>kişi</th><th>dokunduğu repo</th><th>MR</th><th>onay verdiği</th><th>farklı yazar</th></tr></thead>
            <tbody>
              {peopleRows.map((r) => (
                <tr key={r.person} style={{ cursor: "pointer", background: r.person === selected ? "rgba(243,168,43,.08)" : undefined }} onClick={() => focusNode(r.person)}>
                  <td style={{ color: "var(--bone)" }}>{r.person}</td>
                  <td className="num">{r.repos}</td>
                  <td className="num">{r.mrs}</td>
                  <td><span className={`pill ${Number(r.approvals) > 100 ? "bad" : Number(r.approvals) > 40 ? "warn" : "good"}`}>{r.approvals}</span></td>
                  <td className="num">{r.authors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      }
      status={
        <>
          <div className="st">düğüm <b className="num">{visible.nodes.length}</b></div>
          <div className="st">bağ <b className="num">{data.links.length}</b></div>
          <div className="st amber">onaysız <b className="num">{stats.unreviewed}</b></div>
          <div className="st">açılan <b className="num">{expanded.size}</b></div>
          {sel && <div className="st">seçili <b>{sel.kind === "person" ? sel.id : sel.label}</b></div>}
          <div className="st grow" />
          <div className="st">x:{coord.x} y:{coord.y}</div>
        </>
      }
    >
      <div className="uni-stage">
        <ForceGraph data={data} colorOf={colorOf} showLabels={labels} frozen={frozen} restartKey={restartKey}
          focusId={selected} focusNonce={focusNonce} fitNonce={fitNonce}
          onCoord={(x, y) => setCoord({ x, y })} onNodeClick={onNodeClick}
          radiusMax={20} charge={-620} linkDistance={150} collidePad={12} />
        {mode === "focus" && history.length > 0 && (
          <div className="uni-nav">
            {history.map((h, i) => {
              const n = byId.get(h.sel);
              return (
                <div key={i} className={`un-row ${i === hidx ? "cur" : i > hidx ? "fwd" : ""}`} onClick={() => jump(i)} title={n?.kind === "person" ? h.sel : (n?.title ?? n?.label ?? h.sel)}>
                  <span className="un-x" title="Buradan itibaren sil" onClick={(e) => { e.stopPropagation(); cut(i); }}>✕</span>
                  <span className="un-lbl">{n?.kind === "person" ? h.sel : (n?.label ?? h.sel)}</span>
                  <ShapeIcon kind={n?.kind} type={n?.type} color={n ? baseColor(n) : "#7f8aa3"} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Workspace>
  );
}

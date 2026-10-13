import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Workspace } from "../components/Workspace";
import { ForceGraph, type GNode } from "../components/ForceGraph";

interface UNode { id: string; kind: string; label: string; type?: string; status?: string; category?: string | null; assignee?: string | null; summary?: string; degree?: number; state?: string }
interface UEdge { source: string; target: string; rel: string }
type Graph = { nodes: UNode[]; edges: UEdge[] };

import { nodeLink as linkFor } from "../jira";

/** Tür → şekil ikonu (renk = durum). Story ○ · Task □ · Bug △ · Alt görev ◇ · Epic ⬡ · MR ▭ */
function ShapeIcon({ type, kind, color, size = 15 }: { type?: string; kind?: string; color: string; size?: number }) {
  const t = (type ?? "").toLowerCase(); const c = size / 2; const r = size / 2 - 1.5;
  const common = { stroke: "currentColor", fill: "transparent", strokeWidth: 2 } as const;
  let el: JSX.Element;
  if (kind === "mr") el = <rect x={c - r * 0.8} y={c - r * 0.6} width={r * 1.6} height={r * 1.2} {...common} />;
  else if (/hata|bug/.test(t)) el = <polygon points={`${c},${c - r} ${c + r},${c + r * 0.82} ${c - r},${c + r * 0.82}`} {...common} />;
  else if (/alt.?g[öo]rev|sub.?task/.test(t)) el = <polygon points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} {...common} />;
  else if (/epic/.test(t)) { const p = [...Array(6)].map((_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${c + Math.cos(a) * r},${c + Math.sin(a) * r}`; }).join(" "); el = <polygon points={p} {...common} />; }
  else if (/g[öo]rev|task/.test(t)) el = <rect x={c - r * 0.8} y={c - r * 0.8} width={r * 1.6} height={r * 1.6} {...common} />;
  else el = <circle cx={c} cy={c} r={r} {...common} />;
  return <svg className="un-ico" width={size} height={size} style={{ color, flex: "0 0 auto", overflow: "visible" }}>{el}</svg>;
}
const CAT_COLOR: Record<string, string> = { todo: "#5fb4a8", in_progress: "#f3a82b", done: "#57c98a" };
const REL_COLOR: Record<string, string> = { block: "#ff5c6c", hierarchy: "#5fb4a8", relates: "#f3a82b", mr: "#5a6b8c" };
const REL_LABEL: Record<string, string> = { block: "blocker", hierarchy: "hiyerarşi", relates: "ilişkili", mr: "MR" };
function relCat(rel: string): keyof typeof REL_COLOR {
  const r = (rel || "").toLowerCase();
  if (/block|engel/.test(r)) return "block";
  if (["parent", "alt-görev", "epic", "epic-üye"].includes(rel)) return "hierarchy";
  if (rel === "MR") return "mr";
  return "relates";
}
/** Issue düğümünü tür anahtarına indir (footer tür filtresi). MR her zaman görünür. */
function issueCat(n: { kind: string; type?: string }): string {
  if (n.kind === "mr") return "mr";
  const t = (n.type ?? "").toLowerCase();
  if (/hata|bug/.test(t)) return "bug";
  if (/alt.?g[öo]rev|sub.?task/.test(t)) return "subtask";
  if (/epic/.test(t)) return "epic";
  if (/g[öo]rev|task/.test(t)) return "task";
  return "story";
}
const TYPE_CHIPS: { key: string; type: string; label: string }[] = [
  { key: "story", type: "Story", label: "Story" },
  { key: "task", type: "Görev", label: "Task" },
  { key: "bug", type: "Hata", label: "Bug" },
  { key: "subtask", type: "Alt görev", label: "Alt görev" },
  { key: "epic", type: "Epic", label: "Epic" },
];

function mergeGraph(base: Graph, add: Graph): Graph {
  const m = new Map(base.nodes.map((n) => [n.id, n])); for (const n of add.nodes) if (!m.has(n.id)) m.set(n.id, n);
  const s = new Set(base.edges.map((e) => `${e.source}|${e.target}|${e.rel}`)); const out = [...base.edges];
  for (const e of add.edges) { const k = `${e.source}|${e.target}|${e.rel}`; if (!s.has(k)) { s.add(k); out.push(e); } }
  return { nodes: [...m.values()], edges: out };
}

export function Universe({ project }: { project: string }) {
  const [seed, setSeed] = useState<Graph>({ nodes: [], edges: [] });
  const [hoods, setHoods] = useState<Map<string, Graph>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [labels, setLabels] = useState(true);
  const [coord, setCoord] = useState({ x: 0, y: 0 });
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ block: true, hierarchy: true, relates: true, mr: true });
  const [typeOn, setTypeOn] = useState<Record<string, boolean>>({}); // boş = hepsi açık (?? true)
  const [restartKey, setRestartKey] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  const [fitNonce, setFitNonce] = useState(0);
  const [mode, setMode] = useState<"all" | "focus">("all");
  // geçmiş (ileri/geri) — her adım grafın anlık görüntüsü: seçili + açık düğümler
  const [history, setHistory] = useState<{ sel: string; exp: string[] }[]>([]);
  const [hidx, setHidx] = useState(-1);
  const hidxRef = useRef(-1);
  // sprint seedleme
  const [sprintOpts, setSprintOpts] = useState<string[]>([]);
  const [sprint, setSprint] = useState("");
  const [sprintSet, setSprintSet] = useState<Set<string>>(new Set());
  // arama
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ key: string; summary: string; type: string }[]>([]);
  const [showRes, setShowRes] = useState(false);
  const timer = useRef<number | null>(null);

  const loadUniverse = useCallback((sprintVal: string) => {
    api.universeAll(project, sprintVal || undefined).then((g) => {
      setMode("all"); setSeed(g); setHoods(new Map()); setExpanded(new Set()); setSelected(null);
      setSprintSet(sprintVal ? new Set(g.nodes.map((n: any) => n.id)) : new Set());
      setHistory([]); setHidx(-1); hidxRef.current = -1; setRestartKey((k) => k + 1);
    });
  }, [project]);
  const reset = useCallback(() => { setSprint(""); loadUniverse(""); }, [loadUniverse]);
  useEffect(() => { setSprint(""); loadUniverse(""); setQ(""); setResults([]); api.streamFilters(project).then((f) => setSprintOpts(f.sprints)); }, [project, loadUniverse]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = window.setTimeout(() => api.universeSearch(project, q.trim()).then((r) => { setResults(r); setShowRes(true); }), 200);
  }, [q, project]);

  const visible = useMemo(() => {
    let g = seed;
    for (const k of expanded) { const h = hoods.get(k); if (h) g = mergeGraph(g, h); }
    return g;
  }, [seed, hoods, expanded]);

  const byId = useMemo(() => new Map(visible.nodes.map((n) => [n.id, n])), [visible]);
  const neighbors = useMemo(() => {
    const s = new Set<string>();
    if (selected) for (const e of visible.edges) { if (e.source === selected) s.add(e.target); if (e.target === selected) s.add(e.source); }
    return s;
  }, [selected, visible]);

  const center = () => setFocusNonce((n) => n + 1);
  const pushStep = (sel: string, exp: string[]) => {
    setHistory((h) => { const base = h.slice(0, hidxRef.current + 1); const nb = [...base, { sel, exp }]; hidxRef.current = nb.length - 1; setHidx(hidxRef.current); return nb; });
  };
  const applyStep = (s: { sel: string; exp: string[] }) => { setSelected(s.sel); setExpanded(new Set(s.exp)); center(); };

  const loadHood = async (key: string): Promise<Graph> => {
    const cached = hoods.get(key); if (cached) return cached;
    const res = await api.universeExpand(key);
    const g = { nodes: res.nodes as UNode[], edges: res.edges as UEdge[] };
    setHoods((m) => new Map(m).set(key, g));
    return g;
  };

  const onNodeClick = async (id: string) => {
    const n = byId.get(id); if (!n) return;
    // "all" modunda her şey zaten ekranda → sadece seç + ortala + adım kaydet
    if (mode === "all") { setSelected(id); pushStep(id, [...expanded]); center(); return; }
    // "focus" modunda: zaten seçili + açıksa kapat (toggle)
    if (id === selected && expanded.has(id)) {
      const ne = new Set(expanded); ne.delete(id); setExpanded(ne); setSelected(id); pushStep(id, [...ne]); center(); return;
    }
    setSelected(id); center();
    if (n.kind === "issue" && !expanded.has(id)) {
      await loadHood(id);
      const ne = new Set(expanded).add(id); setExpanded(ne); pushStep(id, [...ne]);
    } else {
      pushStep(id, [...expanded]);
    }
  };

  // Arama → o issue'nun ağını AÇ (tüm evreni değil): seed = komşuluk, odak modu
  const focusIssue = async (key: string) => {
    setShowRes(false); setQ(key);
    const g = await loadHood(key);
    setMode("focus"); setSeed(g); setHoods(new Map([[key, g]])); setExpanded(new Set([key]));
    setSelected(key); setHistory([{ sel: key, exp: [key] }]); hidxRef.current = 0; setHidx(0); setRestartKey((k) => k + 1); center();
  };

  const back = () => { if (hidxRef.current > 0) { hidxRef.current--; setHidx(hidxRef.current); applyStep(history[hidxRef.current]); } };
  const forward = () => { if (hidxRef.current < history.length - 1) { hidxRef.current++; setHidx(hidxRef.current); applyStep(history[hidxRef.current]); } };
  const jump = (i: number) => { hidxRef.current = i; setHidx(i); applyStep(history[i]); };
  const cut = (i: number) => {
    const nb = history.slice(0, i); setHistory(nb);
    if (hidxRef.current >= i) { hidxRef.current = nb.length - 1; setHidx(hidxRef.current); if (nb[hidxRef.current]) applyStep(nb[hidxRef.current]); else { setSelected(null); setExpanded(new Set()); } }
  };

  const nodeColor = (id: string) => {
    const n = byId.get(id); if (!n) return "#7f8aa3";
    if (n.kind === "mr") return "#5a6b8c";
    if ((n.type ?? "").toLowerCase() === "epic") return "#d98cff";
    return CAT_COLOR[n.category ?? ""] ?? "#7f8aa3";
  };
  const colorOf = (n: GNode) => {
    const u = n as unknown as UNode;
    if (selected && u.id !== selected && !neighbors.has(u.id)) return "#283040";
    if (selected && u.id === selected) return "#ffffff";
    return nodeColor(u.id);
  };

  const data = useMemo(() => {
    const keep = new Set(visible.nodes.filter((n) => n.kind === "mr" || (typeOn[issueCat(n)] ?? true)).map((n) => n.id));
    return {
      nodes: visible.nodes.filter((n) => keep.has(n.id)).map((n) => ({ id: n.id, kind: n.kind, label: n.label, type: n.type, category: n.category })),
      links: visible.edges.filter((e) => enabled[relCat(e.rel)] && keep.has(e.source) && keep.has(e.target)).map((e) => ({ source: e.source, target: e.target, value: 1, color: REL_COLOR[relCat(e.rel)] })),
    };
  }, [visible, enabled, typeOn]);

  const sel = selected ? byId.get(selected) : undefined;
  const relations = selected ? visible.edges.filter((e) => e.source === selected || e.target === selected)
    .map((e) => (e.source === selected ? { k: e.target, rel: e.rel, dir: "→", cat: relCat(e.rel) } : { k: e.source, rel: e.rel, dir: "←", cat: relCat(e.rel) })) : [];
  const relTally: Record<string, number> = {};
  for (const r of relations) { const n = byId.get(r.k); const t = n?.kind === "mr" ? "MR" : (n?.type || "—"); relTally[t] = (relTally[t] || 0) + 1; }

  return (
    <Workspace
      toolbar={
        <>
          <div className="wt-title">Universe</div>
          <button className="wt" onClick={back} title="Geri" disabled={hidx <= 0} style={{ opacity: hidx <= 0 ? 0.4 : 1 }}><span className="g">◂</span></button>
          <button className="wt" onClick={forward} title="İleri" disabled={hidx >= history.length - 1} style={{ opacity: hidx >= history.length - 1 ? 0.4 : 1 }}><span className="g">▸</span></button>
          <div style={{ position: "relative" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setShowRes(true)} placeholder="issue ara (key / başlık)…"
              style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line-2)", padding: "7px 12px", fontFamily: "var(--mono)", fontSize: 12, width: 230 }} />
            {showRes && results.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 40, width: 380, maxHeight: 320, overflow: "auto", background: "var(--ink-2)", border: "1px solid var(--line-2)" }}>
                {results.map((r) => (
                  <div key={r.key} onMouseDown={(e) => e.preventDefault()} onClick={() => focusIssue(r.key)} style={{ padding: "7px 10px", borderBottom: "1px solid var(--line)", cursor: "pointer", display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--amber)", fontSize: 11 }}>{r.key}</span>
                    <span style={{ fontSize: 12, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="wt" onClick={() => setFitNonce((n) => n + 1)}><span className="g">⌖</span> Fit</button>
          <button className="wt" onClick={reset}><span className="g">⟳</span> Tümü</button>
          <select value={sprint} onChange={(e) => { setSprint(e.target.value); loadUniverse(e.target.value); }} title="Sprint seç (başlangıç kümesi)" style={{ maxWidth: 150 }}>
            <option value="">Tüm evren</option>
            {sprintOpts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="sep" />
          {(["block", "hierarchy", "relates", "mr"] as const).map((c) => (
            <button key={c} className={`wt ${enabled[c] ? "on" : ""}`} onClick={() => setEnabled((s) => ({ ...s, [c]: !s[c] }))}>
              <span className="g" style={{ color: REL_COLOR[c] }}>●</span> {REL_LABEL[c]}
            </button>
          ))}
          <span className="sep" />
          <button className={`wt ${frozen ? "on" : ""}`} title={frozen ? "Simülasyonu çöz" : "Simülasyonu dondur"} onClick={() => setFrozen((f) => !f)}><span className="g">❄</span></button>
          <button className={`wt ${labels ? "on" : ""}`} title="Etiketleri aç/kapat" onClick={() => setLabels((l) => !l)}><span className="g">A</span></button>
          <span className="grow" />
        </>
      }
      rail={<>
        <button className="on" title="Seç / sürükle">⬚</button>
        <button title="Geri" onClick={back}>◂</button>
        <button title="İleri" onClick={forward}>▸</button>
        <button title="Tümünü sığdır (Fit)" onClick={() => setFitNonce((n) => n + 1)}>⌖</button>
        <button title="Tüm evrene dön" onClick={reset}>⟳</button>
        <span className="spring" />
        <button title="Ayarlar">⚙</button>
      </>}
      inspector={
        <>
          <div className="insp-sec">
            <h4>Seçili kart</h4>
            {!sel && <div className="insp-row"><span>ara veya bir düğüme tıkla</span></div>}
            {sel && (
              <>
                <div className="insp-row"><span>{sel.kind === "mr" ? "MR" : "key"}</span><a href={linkFor(sel)} target="_blank" rel="noreferrer" style={{ color: "var(--amber)", textDecoration: "none", fontWeight: 600 }}>{sel.kind === "mr" ? sel.label : sel.id} ↗</a></div>
                <div className="insp-row"><span>tip</span><b>{sel.kind === "mr" ? "Merge Request" : sel.type ?? "—"}</b></div>
                {sel.kind === "issue" && <div className="insp-row"><span>durum</span><b>{sel.status ?? "—"}</b></div>}
                {sel.kind === "issue" && <div className="insp-row"><span>kişi</span><b>{sel.assignee ?? "—"}</b></div>}
                <div style={{ fontFamily: "var(--body)", fontSize: 12, color: "var(--dim)", marginTop: 6 }}>{sel.summary}</div>
                {expanded.has(sel.id) && <div className="insp-row" style={{ marginTop: 6, cursor: "pointer", color: "var(--dim)" }} onClick={() => onNodeClick(sel.id)}>↩ bağlıları kapat</div>}
              </>
            )}
          </div>
          {sel && relations.length > 0 && (
            <div className="insp-sec">
              <h4>Bağlı tür dağılımı</h4>
              {Object.entries(relTally).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
                <div className="insp-row" key={t}><span>{t}</span><b className="num">{c}</b></div>
              ))}
            </div>
          )}
          {sel && (
            <div className="insp-sec">
              <h4>Etki & bağımlılık ({relations.length})</h4>
              {relations.length === 0 && <div className="insp-row"><span>tıkla → bağları aç</span></div>}
              {relations.map((r, i) => (
                <div className="insp-row" key={i} style={{ cursor: "pointer" }} onClick={() => onNodeClick(r.k)}>
                  <span style={{ color: REL_COLOR[r.cat] }}>{r.dir} {r.k}</span><b style={{ fontSize: 9, color: "var(--dim)" }}>{r.rel}</b>
                </div>
              ))}
            </div>
          )}
          <div className="insp-sec">
            <h4>Renk = durum</h4>
            <div className="insp-legend"><span className="sw" style={{ background: "#5fb4a8", borderColor: "#5fb4a8" }} /> To Do</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#f3a82b", borderColor: "#f3a82b" }} /> In Progress</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#57c98a", borderColor: "#57c98a" }} /> Done</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#5a6b8c", borderColor: "#5a6b8c" }} /> Merge Request</div>
          </div>
        </>
      }
      status={
        <>
          <div className="st">PRJ <b>{project}</b></div>
          <div className="st">düğüm <b className="num">{visible.nodes.length}</b></div>
          <div className="st">bağ <b className="num">{data.links.length}</b></div>
          <div className="st amber">açılan <b className="num">{expanded.size}</b></div>
          {sel && <div className="st">seçili <b>{sel.id}</b></div>}
          <div className="st" style={{ gap: 12 }}>
            {TYPE_CHIPS.map((c) => {
              const on = typeOn[c.key] ?? true;
              return (
                <span key={c.key} title={on ? "görünüyor — gizlemek için tıkla" : "gizli — göstermek için tıkla"} onClick={() => setTypeOn((s) => ({ ...s, [c.key]: !(s[c.key] ?? true) }))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", opacity: on ? 1 : 0.32, textDecoration: on ? "none" : "line-through" }}>
                  <ShapeIcon type={c.type} color={on ? "#8a93a6" : "#4a5362"} size={12} /> {c.label}
                </span>
              );
            })}
          </div>
          <div className="st grow" />
          <div className="st">x:{coord.x} y:{coord.y}</div>
        </>
      }
    >
      <div className="uni-stage">
        <ForceGraph data={data} colorOf={colorOf} showLabels={labels} frozen={frozen} restartKey={restartKey} directed
          focusId={selected} focusNonce={focusNonce} fitNonce={fitNonce} groupIds={sprintSet} groupLabel={sprint}
          onCoord={(x, y) => setCoord({ x, y })} onNodeClick={onNodeClick} />
        {history.length > 0 && (
          <div className="uni-nav">
            {history.map((h, i) => {
              const c = nodeColor(h.sel);
              return (
                <div key={i} className={`un-row ${i === hidx ? "cur" : i > hidx ? "fwd" : ""}`} onClick={() => jump(i)} title={byId.get(h.sel)?.summary ?? h.sel}>
                  <span className="un-x" title="Buradan itibaren sil" onClick={(e) => { e.stopPropagation(); cut(i); }}>✕</span>
                  <span className="un-lbl">{h.sel}</span>
                  <ShapeIcon type={byId.get(h.sel)?.type} kind={byId.get(h.sel)?.kind} color={c} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Workspace>
  );
}

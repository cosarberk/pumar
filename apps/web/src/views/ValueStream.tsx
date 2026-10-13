import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Handle, Position, useReactFlow,
  type Node, type Edge,
} from "@xyflow/react";
import { api, type Stage } from "../api";
import { Workspace } from "../components/Workspace";

type Mode = "cards" | "flow";
const CAT_COLOR: Record<string, string> = { todo: "#5fb4a8", in_progress: "#f3a82b", done: "#57c98a" };
import { jiraUrl } from "../jira";

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <>
      <div className="wt-title">Value Stream</div>
      <button className={`wt ${mode === "cards" ? "on" : ""}`} onClick={() => setMode("cards")}><span className="g">▦</span> Kartlar</button>
      <button className={`wt ${mode === "flow" ? "on" : ""}`} onClick={() => setMode("flow")}><span className="g">⇄</span> Akış</button>
      <span className="sep" />
    </>
  );
}

/* =========================== KARTLAR MODU =========================== */
function CardNode({ data }: { data: { label: string; status: string; age: number; color: string; selected: boolean; dim: boolean } }) {
  return (
    <div className="vs-node" style={{
      borderColor: data.selected ? "var(--bone)" : data.color, borderWidth: data.selected ? 2 : 1,
      minWidth: 172, padding: "8px 10px", cursor: "pointer", opacity: data.dim ? 0.25 : 1,
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: data.color }}>{data.label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim)", display: "flex", justifyContent: "space-between", marginTop: 2, gap: 8 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.status}</span><span>{data.age}g</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
function LaneNode({ data }: { data: { label: string; count: number } }) {
  return <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: "var(--dim)", letterSpacing: 1 }}>{data.label} <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>({data.count})</span></div>;
}
const cardTypes = { card: CardNode, lane: LaneNode };
const LANES = ["To Do", "In Progress", "Review"];
const ageColor = (a: number) => (a > 14 ? "var(--bad)" : a > 5 ? "var(--amber)" : "var(--teal)");

function CardsInner({ project, mode, setMode }: { project: string; mode: Mode; setMode: (m: Mode) => void }) {
  const rf = useReactFlow();
  const [data, setData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [coord, setCoord] = useState({ x: 0, y: 0 });

  useEffect(() => { api.streamCards(project).then(setData); setSelected(null); }, [project]);

  const neighbors = useMemo(() => {
    const s = new Set<string>();
    if (selected) for (const e of data.edges) { if (e.from === selected) s.add(e.to); if (e.to === selected) s.add(e.from); }
    return s;
  }, [selected, data]);

  const { nodes, edges, laneCounts } = useMemo(() => {
    const perLane: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    const laneCounts = [0, 0, 0];
    const nodes: Node[] = LANES.map((l, i) => ({ id: `lane-${i}`, type: "lane", position: { x: i * 300, y: -64 }, data: { label: l, count: data.nodes.filter((n) => n.lane === i).length }, draggable: false, selectable: false }));
    for (const c of data.nodes) {
      const y = perLane[c.lane] * 66; perLane[c.lane]++; laneCounts[c.lane]++;
      const dim = !!selected && selected !== c.key && !neighbors.has(c.key);
      nodes.push({ id: c.key, type: "card", position: { x: c.lane * 300, y }, data: { label: c.key, status: c.status, age: c.age, color: ageColor(c.age), selected: selected === c.key, dim } });
    }
    const edges: Edge[] = data.edges.map((e, i) => {
      const conn = !!selected && (e.from === selected || e.to === selected);
      const block = /block|engel/i.test(e.rel);
      const col = block ? "var(--bad)" : e.rel === "alt-görev" ? "var(--dim-2)" : "var(--amber)";
      return {
        id: `e${i}`, source: e.from, target: e.to,
        animated: conn, label: conn ? e.rel : undefined,
        labelStyle: { fill: col, fontFamily: "var(--mono)", fontSize: 9 }, labelBgStyle: { fill: "var(--ink)", fillOpacity: 0.85 },
        style: { stroke: col, strokeWidth: conn ? 2.4 : 1, opacity: selected ? (conn ? 1 : 0.06) : 0.5, strokeDasharray: block ? "5 4" : undefined },
      };
    });
    return { nodes, edges, laneCounts };
  }, [data, selected, neighbors]);

  useEffect(() => { if (data.nodes.length) setTimeout(() => rf.fitView({ duration: 200 }), 60); }, [data, rf]);

  const sel = data.nodes.find((n) => n.key === selected);
  const related = selected ? data.edges.filter((e) => e.from === selected || e.to === selected)
    .map((e) => (e.from === selected ? { k: e.to, rel: e.rel, dir: "→" } : { k: e.from, rel: e.rel, dir: "←" })) : [];

  return (
    <Workspace
      toolbar={
        <>
          <ModeToggle mode={mode} setMode={setMode} />
          <button className="wt" onClick={() => rf.fitView({ duration: 300 })}><span className="g">⌖</span> Fit</button>
          <button className="wt" onClick={() => rf.zoomIn()}><span className="g">＋</span></button>
          <button className="wt" onClick={() => rf.zoomOut()}><span className="g">－</span></button>
          {selected && <><span className="sep" /><button className="wt on" onClick={() => setSelected(null)}><span className="g">✕</span> {selected}</button></>}
          <span className="grow" />
        </>
      }
      rail={<>
        <button className="on" title="Seç">⬚</button>
        <button title="Yakınlaştır" onClick={() => rf.zoomIn()}>⚲</button>
        <button title="Odakla" onClick={() => rf.fitView({ duration: 300 })}>⌖</button>
        <span className="spring" />
        <button title="Ayarlar">⚙</button>
      </>}
      inspector={
        <>
          <div className="insp-sec">
            <h4>Okuma</h4>
            <div className="insp-legend"><span className="sw" style={{ background: "var(--teal)", borderColor: "var(--teal)" }} /> taze (≤5g)</div>
            <div className="insp-legend"><span className="sw" style={{ background: "var(--amber)", borderColor: "var(--amber)" }} /> bekliyor (6–14g)</div>
            <div className="insp-legend"><span className="sw" style={{ background: "var(--bad)", borderColor: "var(--bad)" }} /> çürüyor (&gt;14g)</div>
            <div className="insp-legend"><span className="sw" style={{ background: "var(--bad)", borderColor: "var(--bad)" }} /> kırmızı ok = blocker</div>
            <div className="insp-legend"><span className="sw" style={{ background: "var(--dim-2)", borderColor: "var(--dim-2)" }} /> gri ok = alt-görev</div>
          </div>
          <div className="insp-sec">
            <h4>Seçili kart</h4>
            {!sel && <div className="insp-row"><span>bir karta tıkla</span></div>}
            {sel && (
              <>
                <div className="insp-row"><span>key</span><b style={{ color: "var(--amber)" }}>{sel.key}</b></div>
                <div className="insp-row"><span>durum</span><b>{sel.status}</b></div>
                <div className="insp-row"><span>yaş</span><b style={{ color: ageColor(sel.age) }}>{sel.age}g</b></div>
                <div className="insp-row"><span>kişi</span><b>{sel.assignee ?? "—"}</b></div>
                <div style={{ fontFamily: "var(--body)", fontSize: 12, color: "var(--dim)", marginTop: 6 }}>{sel.summary}</div>
              </>
            )}
          </div>
          {sel && (
            <div className="insp-sec">
              <h4>Bağlı kartlar ({related.length})</h4>
              {related.length === 0 && <div className="insp-row"><span>bağ yok</span></div>}
              {related.map((r, i) => (
                <div className="insp-row" key={i} style={{ cursor: "pointer" }} onClick={() => setSelected(r.k)}>
                  <span>{r.dir} {r.k}</span><b style={{ fontSize: 10, color: "var(--dim)" }}>{r.rel}</b>
                </div>
              ))}
            </div>
          )}
        </>
      }
      status={
        <>
          <div className="st">PRJ <b>{project}</b></div>
          <div className="st">aktif kart <b className="num">{data.nodes.length}</b></div>
          <div className="st">To Do <b className="num">{laneCounts[0]}</b></div>
          <div className="st amber">In Progress <b className="num">{laneCounts[1]}</b></div>
          <div className="st">Review <b className="num">{laneCounts[2]}</b></div>
          <div className="st">bağ <b className="num">{data.edges.length}</b></div>
          <div className="st grow" />
          <div className="st">zoom <b className="num">{zoom}%</b></div>
        </>
      }
    >
      <div className="rf" onMouseMove={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setCoord({ x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) }); }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={cardTypes} fitView proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => { if (!n.id.startsWith("lane-")) setSelected((s) => (s === n.id ? null : n.id)); }}
          onMove={(_, vp) => setZoom(Math.round(vp.zoom * 100))} minZoom={0.15} maxZoom={3}>
          <Background color="rgba(214,221,210,0.05)" gap={30} />
        </ReactFlow>
      </div>
    </Workspace>
  );
}

/* =========================== AKIŞ MODU (statü akışı) =========================== */
function StatusNode({ data }: { data: { label: string; count: number; through: number; cat: string; selected: boolean } }) {
  const passive = data.count === 0;
  const col = passive ? "var(--dim-2)" : (CAT_COLOR[data.cat] ?? "#7f8aa3");
  return (
    <div className="vs-node" style={{ borderColor: data.selected ? "var(--bone)" : col, borderWidth: data.selected ? 2 : 1, borderStyle: passive ? "dashed" : "solid", cursor: "pointer", minWidth: 160, opacity: passive ? 0.5 : 1, background: passive ? "transparent" : "var(--ink-2)" }}>
      <Handle id="l" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="bt" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="tt" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="kd" style={{ color: col, display: "flex", justifyContent: "space-between" }}><span>{data.cat ?? "—"}</span>{passive && <span>pasif</span>}</div>
      <div style={{ fontFamily: "var(--body)", fontSize: 13, fontWeight: 600, margin: "2px 0", color: passive ? "var(--dim)" : "var(--bone)" }}>{data.label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span><span className="vl" style={{ color: col, fontSize: 26 }}>{data.count}</span><span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim)" }}> şu an</span></span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)" }}>{data.through} geçti</span>
      </div>
      <Handle id="r" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="bs" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="ts" type="source" position={Position.Top} style={{ opacity: 0 }} />
    </div>
  );
}
const flowTypes = { st: StatusNode };
const CAT_COL: Record<string, number> = { todo: 0, in_progress: 1, done: 2 };

function FlowInner({ project, mode, setMode }: { project: string; mode: Mode; setMode: (m: Mode) => void }) {
  const rf = useReactFlow();
  const [flow, setFlow] = useState<{ nodes: { status: string; category: string | null; count: number }[]; edges: { from: string; to: string; count: number }[] }>({ nodes: [], edges: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<{ from: string; to: string } | null>(null);
  const [dockItems, setDockItems] = useState<Record<string, unknown>[]>([]);
  const [zoom, setZoom] = useState(100);
  // interaktif: filtreler + eşik + hover
  const [opts, setOpts] = useState<{ assignees: string[]; sprints: string[] }>({ assignees: [], sprints: [] });
  const [assignee, setAssignee] = useState("");
  const [sprint, setSprint] = useState("");
  const [minPct, setMinPct] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const flt = { assignee: assignee || undefined, sprint: sprint || undefined };

  useEffect(() => { api.streamFilters(project).then(setOpts); }, [project]);
  useEffect(() => { api.statusFlow(project, flt).then(setFlow); setSelected(null); setSelEdge(null); }, [project, assignee, sprint]);
  useEffect(() => {
    if (selEdge) api.itemsByTransition(project, selEdge.from, selEdge.to, flt).then(setDockItems);
    else if (selected) api.itemsByStatus(project, selected, flt).then(setDockItems);
    else api.items(project, "in_progress", flt).then(setDockItems);
  }, [selected, selEdge, project, assignee, sprint]);

  const statusMeta = useMemo(() => {
    const m = new Map<string, { cat: string; count: number }>();
    for (const n of flow.nodes) m.set(n.status, { cat: n.category ?? "in_progress", count: n.count });
    for (const e of flow.edges) for (const s of [e.from, e.to]) if (!m.has(s)) m.set(s, { cat: "in_progress", count: 0 });
    return m;
  }, [flow]);
  const through = useMemo(() => { const m = new Map<string, number>(); for (const e of flow.edges) m.set(e.to, (m.get(e.to) ?? 0) + e.count); return m; }, [flow]);

  // Workflow sırası: her statüye soldan sağa mantıksal bir indeks ver
  const orderOf = (status: string, cat: string) => {
    const s = status.toLowerCase();
    if (cat === "todo") return 0;
    if (cat === "done") return 50;
    if (/review|onay/.test(s)) return 30;
    if (/test|kontrol/.test(s)) return 40;
    if (/progress|devam|geliş|doing|başla/.test(s)) return 20;
    return 20; // diğer in_progress
  };
  const orderMap = useMemo(() => { const m = new Map<string, number>(); for (const [st, meta] of statusMeta) m.set(st, orderOf(st, meta.cat)); return m; }, [statusMeta]);

  const { nodes, edges } = useMemo(() => {
    // Benzersiz sıraları sırala, boşlukları kapatarak kolon indeksine çevir (tek yatay hat)
    const orders = [...new Set([...orderMap.values()])].sort((a, b) => a - b);
    const colIdx = new Map<number, number>(orders.map((o, i) => [o, i]));
    const colOf = (st: string) => colIdx.get(orderMap.get(st) ?? 0) ?? 0;
    const perCol: Record<number, number> = {};
    const pos = new Map<string, { x: number; y: number }>();
    [...statusMeta.keys()].sort((a, b) => (orderMap.get(a)! - orderMap.get(b)!)).forEach((st) => {
      const col = colOf(st);
      const k = perCol[col] ?? 0; perCol[col] = k + 1;
      pos.set(st, { x: col * 360, y: k * 150 });
    });
    const nodes: Node[] = [...statusMeta.entries()].map(([status, meta]) => ({
      id: status, type: "st", position: pos.get(status)!, sourcePosition: Position.Right, targetPosition: Position.Left,
      data: { label: status, count: meta.count, through: through.get(status) ?? 0, cat: meta.cat, selected: selected === status },
    }));

    const maxE = Math.max(1, ...flow.edges.map((e) => e.count));
    const minShow = Math.max(3, maxE * 0.015, maxE * (minPct / 100)); // önemsiz + eşik sürgüsü

    const drawn = flow.edges.filter((e) => e.count >= minShow).map((e) => {
      const fc = colOf(e.from), tc = colOf(e.to);
      return { e, backward: tc < fc, skip: tc - fc >= 2, span: Math.abs(tc - fc) };
    });
    const offMap = new Map<unknown, number>();
    drawn.filter((d) => d.skip).sort((a, b) => b.span - a.span).forEach((d, i) => offMap.set(d.e, 24 + i * 46));
    drawn.filter((d) => d.backward).sort((a, b) => b.span - a.span).forEach((d, i) => offMap.set(d.e, 24 + i * 46));

    const anySel = selected || selEdge;
    const edges: Edge[] = drawn.map((d, i) => {
      const { e, backward, skip } = d;
      const isSel = selEdge ? (e.from === selEdge.from && e.to === selEdge.to) : !!(selected && (e.from === selected || e.to === selected));
      const col = isSel ? "#ffffff" : backward ? "var(--bad)" : "var(--amber)";
      const sH = backward ? "bs" : skip ? "ts" : "r";
      const tH = backward ? "bt" : skip ? "tt" : "l";
      const baseW = 1 + (e.count / maxE) * 6;
      return {
        id: `e${i}`, source: e.from, target: e.to, type: "smoothstep",
        sourceHandle: sH, targetHandle: tH,
        pathOptions: { offset: offMap.get(e) ?? 12, borderRadius: 10 },
        label: String(e.count), animated: isSel || (!anySel && e.count > maxE * 0.15),
        labelStyle: { fill: backward ? "#ffffff" : "var(--amber)", fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: backward ? "var(--bad)" : "#0a0d12", fillOpacity: 1 },
        labelBgPadding: [8, 5] as [number, number], labelBgBorderRadius: 3,
        style: { stroke: col, strokeWidth: isSel ? baseW + 1.5 : baseW, opacity: anySel ? (isSel ? 1 : 0.1) : (backward ? 0.85 : skip ? 0.55 : 0.6 + (e.count / maxE) * 0.4), strokeDasharray: backward ? "5 4" : undefined },
      };
    });
    return { nodes, edges };
  }, [statusMeta, flow, selected, selEdge, through, orderMap, minPct]);

  useEffect(() => { if (nodes.length) setTimeout(() => rf.fitView({ duration: 200 }), 60); }, [nodes.length, rf]);
  const byCat = (cat: string) => [...statusMeta.entries()].filter(([, m]) => m.cat === cat);
  const total = [...statusMeta.values()].reduce((s, m) => s + m.count, 0);

  const activeFilter = assignee || sprint;
  const pickNode = (id: string) => { setSelEdge(null); setSelected((s) => (s === id ? null : id)); };

  return (
    <Workspace
      toolbar={
        <>
          <ModeToggle mode={mode} setMode={setMode} />
          <button className="wt" onClick={() => rf.fitView({ duration: 300 })}><span className="g">⌖</span> Fit</button>
          <span className="sep" />
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ maxWidth: 150 }}>
            <option value="">Herkes</option>
            {opts.assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={sprint} onChange={(e) => setSprint(e.target.value)} style={{ maxWidth: 140 }}>
            <option value="">Tüm sprintler</option>
            {opts.sprints.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="sep" />
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)" }}>eşik</span>
          <input type="range" min={0} max={60} value={minPct} onChange={(e) => setMinPct(Number(e.target.value))} title={`min %${minPct} hacim`} style={{ width: 90 }} />
          {(selected || selEdge) && <><span className="sep" /><button className="wt on" onClick={() => { setSelected(null); setSelEdge(null); }}><span className="g">✕</span> {selEdge ? `${selEdge.from}→${selEdge.to}` : selected}</button></>}
          <span className="grow" />
        </>
      }
      rail={<><button className="on" title="Seç">⬚</button><button title="Odakla (Fit)" onClick={() => rf.fitView({ duration: 300 })}>⌖</button><span className="spring" /><button title="Ayarlar">⚙</button></>}
      inspector={
        <>
          <div className="insp-sec"><h4>Okuma</h4>
            <div className="insp-legend"><span className="sw" style={{ background: "var(--amber)", borderColor: "var(--amber)" }} /> ileri akış</div>
            <div className="insp-legend"><span className="sw" style={{ background: "var(--bad)", borderColor: "var(--bad)" }} /> geri dönüş (rework)</div>
            <div className="insp-row" style={{ marginTop: 4 }}><span>düğüme/oka tıkla</span><b>süz</b></div>
          </div>
          {["todo", "in_progress", "done"].map((cat) => (
            <div className="insp-sec" key={cat}><h4 style={{ color: CAT_COLOR[cat] }}>{cat}</h4>
              {byCat(cat).sort((a, b) => b[1].count - a[1].count).map(([status, m]) => (
                <div className="insp-row" key={status} style={{ cursor: "pointer" }} onClick={() => pickNode(status)}><span style={{ color: selected === status ? "var(--bone)" : undefined }}>{status}</span><b className="num">{m.count}</b></div>
              ))}
            </div>
          ))}
        </>
      }
      dock={
        <>
          <div className="dock-head">
            <h4>{selEdge ? `"${selEdge.from} → ${selEdge.to}" geçişi` : selected ? `"${selected}" kartları` : "In Progress kartları"} ({dockItems.length})</h4>
            {activeFilter && <span className="tag">{assignee}{assignee && sprint ? " · " : ""}{sprint}</span>}
            {(selected || selEdge) && <span className="tag" style={{ cursor: "pointer" }} onClick={() => { setSelected(null); setSelEdge(null); }}>✕ filtreyi kaldır</span>}
          </div>
          <table><thead><tr><th>key</th><th>özet</th><th>tip</th><th>durum</th><th>kişi</th><th>güncellendi</th></tr></thead>
            <tbody>{dockItems.map((r: any) => (<tr key={r.key}><td className="k"><a href={jiraUrl(r.key)} target="_blank" rel="noreferrer" style={{ color: "var(--amber)", textDecoration: "none" }}>{r.key} ↗</a></td><td style={{ fontFamily: "var(--body)", maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.summary}>{r.summary}</td><td>{r.type}</td><td>{r.status}</td><td>{r.assignee ?? "—"}</td><td>{r.updated ?? "—"}</td></tr>))}</tbody>
          </table>
        </>
      }
      status={<><div className="st">PRJ <b>{project}</b></div><div className="st">iş <b className="num">{total}</b></div><div className="st">statü <b className="num">{statusMeta.size}</b></div><div className="st">geçiş <b className="num">{flow.edges.length}</b></div>{activeFilter && <div className="st amber">filtre <b>{assignee || sprint}</b></div>}<div className="st grow" /><div className="st">zoom <b className="num">{zoom}%</b></div></>}
    >
      <div className="rf" style={{ position: "relative" }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={flowTypes} fitView proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => pickNode(n.id)}
          onEdgeClick={(_, ed) => { setSelected(null); setSelEdge((s) => (s && s.from === ed.source && s.to === ed.target ? null : { from: ed.source, to: ed.target })); }}
          onNodeMouseEnter={(e, n: any) => setHover({ x: e.clientX, y: e.clientY, text: `${n.data.label} · ${n.data.count} şu an · ${n.data.through} geçti` })}
          onNodeMouseLeave={() => setHover(null)}
          onEdgeMouseEnter={(e, ed) => setHover({ x: e.clientX, y: e.clientY, text: `${ed.source} → ${ed.target} · ${ed.label} geçiş` })}
          onEdgeMouseLeave={() => setHover(null)}
          onMove={(_, vp) => setZoom(Math.round(vp.zoom * 100))} minZoom={0.2} maxZoom={3}>
          <Background color="rgba(214,221,210,0.05)" gap={30} />
        </ReactFlow>
        {hover && (
          <div style={{ position: "fixed", left: hover.x + 14, top: hover.y + 14, zIndex: 50, pointerEvents: "none", background: "var(--ink-2)", border: "1px solid var(--line-2)", padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--bone)", borderRadius: 3, whiteSpace: "nowrap" }}>{hover.text}</div>
        )}
      </div>
    </Workspace>
  );
}

export function ValueStream({ project }: { project: string }) {
  const [mode, setMode] = useState<Mode>("flow");
  return (
    <ReactFlowProvider>
      {mode === "cards" ? <CardsInner project={project} mode={mode} setMode={setMode} /> : <FlowInner project={project} mode={mode} setMode={setMode} />}
    </ReactFlowProvider>
  );
}

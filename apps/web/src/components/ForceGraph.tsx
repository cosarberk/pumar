import { useEffect, useRef } from "react";
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY,
  type Simulation, type SimulationNodeDatum,
} from "d3-force";

export interface GNode extends SimulationNodeDatum { id: string; kind?: string; deg?: number }
export interface GLink { source: GNode | string; target: GNode | string; value: number }

/** Tür → şekil: Story ○ · Task □ · Bug △ · Alt görev ◇ · Epic ⬡ · MR ▭ */
function shapePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type?: string, kind?: string) {
  const t = (type ?? "").toLowerCase();
  ctx.beginPath();
  if (kind === "person") { for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); return; }
  if (kind === "repo") { ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); return; }
  if (kind === "mr") { ctx.rect(x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2); return; }
  if (/hata|bug/.test(t)) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.82); ctx.lineTo(x - r, y + r * 0.82); ctx.closePath(); return; }
  if (/alt.?g[öo]rev|sub.?task/.test(t)) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); return; }
  if (/epic/.test(t)) { for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); return; }
  if (/g[öo]rev|task/.test(t)) { ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); return; }
  ctx.arc(x, y, r, 0, 7); // Story / diğer
}

/**
 * Canvas force graf: düğüm sürükle + kamera (zoom/pan).
 * Performans: sürekli raf YOK — sadece simülasyon tick'lerinde ve etkileşimde çizer
 * (büyük graf oturunca CPU'yu bırakır). fitNonce = tümünü çerçevele, focusNonce = düğüme ortala.
 */
export function ForceGraph(props: {
  data: { nodes: { id: string; kind?: string }[]; links: { source: string; target: string; value: number }[] };
  colorOf: (n: GNode) => string;
  showLabels: boolean;
  frozen: boolean;
  restartKey: number;
  directed?: boolean;
  onCoord?: (x: number, y: number) => void;
  onNodeClick?: (id: string) => void;
  focusId?: string | null;
  focusNonce?: number;
  fitNonce?: number;
  groupIds?: Set<string>;
  groupLabel?: string;
  charge?: number;
  linkDistance?: number;
  collidePad?: number;
  radiusMax?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<GNode, undefined> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const groupRef = useRef<Set<string>>(props.groupIds ?? new Set()); groupRef.current = props.groupIds ?? new Set();
  const groupLabelRef = useRef(props.groupLabel ?? ""); groupLabelRef.current = props.groupLabel ?? "";
  const renderRef = useRef<() => void>(() => {});
  const fitRef = useRef<() => void>(() => {});
  const radiusRef = useRef<(n: GNode) => number>(() => 8);
  const labelsRef = useRef(props.showLabels); labelsRef.current = props.showLabels;
  const colorRef = useRef(props.colorOf); colorRef.current = props.colorOf;
  const clickRef = useRef(props.onNodeClick); clickRef.current = props.onNodeClick;
  const cam = useRef({ scale: 1, ox: 0, oy: 0 });

  useEffect(() => {
    const nodes: GNode[] = props.data.nodes.map((n) => ({ ...n }));
    const links: GLink[] = props.data.links.map((l) => ({ ...l }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    links.forEach((l) => {
      const s = byId.get(l.source as string), t = byId.get(l.target as string);
      if (s) s.deg = (s.deg ?? 0) + l.value; if (t) t.deg = (t.deg ?? 0) + l.value;
    });
    nodesRef.current = nodes;

    const cv = ref.current!, ctx = cv.getContext("2d")!, dpr = devicePixelRatio || 1;
    const resize = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; renderRef.current(); };
    resize(); addEventListener("resize", resize);
    // konteyner boyutu değişince (yan panel/alt panel sürükleme) canvas'ı yeniden ölçekle — yoksa esner/bozulur
    const ro = new ResizeObserver(() => resize());
    ro.observe(cv);
    const W = () => cv.clientWidth, H = () => cv.clientHeight;
    const rmax = props.radiusMax ?? Infinity;
    const radius = (n: GNode) => Math.min(rmax, 7 + Math.sqrt(n.deg ?? 1) * 2.2); radiusRef.current = radius;
    const toWorld = (mx: number, my: number) => ({ x: (mx - cam.current.ox) / cam.current.scale, y: (my - cam.current.oy) / cam.current.scale });

    const big = nodes.length > 600;
    const sim = forceSimulation<GNode>(nodes)
      .force("charge", forceManyBody().strength(big ? -120 : (props.charge ?? -240)).distanceMax(big ? 400 : Infinity))
      .force("link", forceLink<GNode, GLink>(links).id((d) => d.id).distance(big ? 60 : (props.linkDistance ?? 85)).strength(0.35))
      .force("center", forceCenter(W() / 2, H() / 2))
      .force("collide", forceCollide<GNode>().radius((d) => radius(d) + (props.collidePad ?? 3)))
      // sprint kümeleme: grup düğümleri merkeze toplanır, dışarıdakiler gevşek kalır
      .force("gx", forceX<GNode>(W() / 2).strength((d) => (groupRef.current.size ? (groupRef.current.has(d.id) ? 0.11 : 0.004) : 0)))
      .force("gy", forceY<GNode>(H() / 2).strength((d) => (groupRef.current.size ? (groupRef.current.has(d.id) ? 0.11 : 0.004) : 0)));
    simRef.current = sim;

    function render() {
      const { scale, ox, oy } = cam.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W(), H());
      ctx.translate(ox, oy); ctx.scale(scale, scale);
      // sprint sınır çemberi (grup varsa)
      if (groupRef.current.size) {
        let gx = 0, gy = 0, cnt = 0;
        for (const n of nodes) if (groupRef.current.has(n.id) && n.x != null) { gx += n.x; gy += n.y!; cnt++; }
        if (cnt) {
          gx /= cnt; gy /= cnt; let rad = 0;
          for (const n of nodes) if (groupRef.current.has(n.id) && n.x != null) rad = Math.max(rad, Math.hypot(n.x - gx, n.y! - gy) + radius(n));
          rad += 26;
          ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = "rgba(243,168,43,.45)"; ctx.lineWidth = 1.5 / scale;
          ctx.beginPath(); ctx.arc(gx, gy, rad, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "rgba(243,168,43,.85)"; ctx.font = `600 ${13 / scale}px 'IBM Plex Mono', monospace`; ctx.textAlign = "center";
          ctx.fillText(groupLabelRef.current + " · sprint içi", gx, gy - rad - 8 / scale); ctx.restore();
        }
      }
      for (const l of links) {
        const s = l.source as GNode, t = l.target as GNode;
        const lc = (l as any).color as string | undefined;
        ctx.save(); ctx.globalAlpha = lc ? 0.55 : 0.07 + Math.min(0.4, l.value / 12);
        ctx.strokeStyle = lc ?? "#f3a82b"; ctx.lineWidth = 0.6 + Math.min(3, l.value / 4);
        ctx.beginPath(); ctx.moveTo(s.x!, s.y!); ctx.lineTo(t.x!, t.y!); ctx.stroke(); ctx.restore();
        if (props.directed || (l as any).directed) {
          const ang = Math.atan2(t.y! - s.y!, t.x! - s.x!), r = radius(t) + 2;
          const hx = t.x! - Math.cos(ang) * r, hy = t.y! - Math.sin(ang) * r;
          ctx.fillStyle = lc ?? "rgba(243,168,43,.45)";
          ctx.beginPath(); ctx.moveTo(hx, hy);
          ctx.lineTo(hx - Math.cos(ang - 0.4) * 6, hy - Math.sin(ang - 0.4) * 6);
          ctx.lineTo(hx - Math.cos(ang + 0.4) * 6, hy - Math.sin(ang + 0.4) * 6); ctx.fill();
        }
      }
      const showLabel = labelsRef.current && scale > 0.5 && nodes.length < 400;
      for (const n of nodes) {
        const r = radius(n), col = colorRef.current(n);
        ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = scale > 0.4 ? 10 : 0;
        ctx.fillStyle = "#0e131b"; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        shapePath(ctx, n.x!, n.y!, r, (n as any).type, (n as any).kind);
        ctx.fill(); ctx.stroke(); ctx.restore();
        if (showLabel) { ctx.fillStyle = "#e4e7df"; ctx.font = "500 10px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillText((n as any).label ?? n.id, n.x!, n.y! + r + 13); }
      }
    }
    renderRef.current = render;

    function fitAll() {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const n of nodes) { if (n.x == null) continue; const r = radius(n); a = Math.min(a, n.x - r); c = Math.max(c, n.x + r); b = Math.min(b, n.y! - r); d = Math.max(d, n.y! + r); }
      if (!isFinite(a)) return;
      const w = W(), h = H(), bw = c - a || 1, bh = d - b || 1, pad = 48;
      const scale = Math.max(0.02, Math.min(2, Math.min((w - pad * 2) / bw, (h - pad * 2) / bh)));
      cam.current.scale = scale; cam.current.ox = w / 2 - (a + c) / 2 * scale; cam.current.oy = h / 2 - (b + d) / 2 * scale;
      render();
    }
    fitRef.current = fitAll;

    let fitted = false;
    sim.on("tick", render);
    sim.on("end", () => { if (!fitted) { fitAll(); fitted = true; } render(); });
    render();

    // etkileşim
    let drag: GNode | null = null, panning = false, moved = 0, lastX = 0, lastY = 0;
    const rel = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); return { mx: e.clientX - r.left, my: e.clientY - r.top }; };
    const hit = (mx: number, my: number) => { const w = toWorld(mx, my); return nodes.find((n) => Math.hypot((n.x ?? 0) - w.x, (n.y ?? 0) - w.y) < radius(n) + 6) ?? null; };
    cv.onmousedown = (e) => { const { mx, my } = rel(e); moved = 0; drag = hit(mx, my); if (drag) sim.alphaTarget(0.3).restart(); else { panning = true; lastX = mx; lastY = my; } };
    cv.onmousemove = (e) => {
      const { mx, my } = rel(e); const w = toWorld(mx, my); props.onCoord?.(Math.round(w.x), Math.round(w.y));
      if (drag) { moved++; drag.fx = w.x; drag.fy = w.y; return; }
      if (panning) { moved++; cam.current.ox += mx - lastX; cam.current.oy += my - lastY; lastX = mx; lastY = my; render(); return; }
      cv.style.cursor = hit(mx, my) ? "pointer" : "grab";
    };
    const end = () => { if (drag && moved < 4) clickRef.current?.(drag.id); if (drag) { drag.fx = null; drag.fy = null; sim.alphaTarget(0); } drag = null; panning = false; };
    cv.onmouseup = end;
    cv.onmouseleave = () => { if (drag) { drag.fx = null; drag.fy = null; sim.alphaTarget(0); } drag = null; panning = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const { mx, my } = rel(e);
      const f = Math.exp(-e.deltaY * 0.0012), ns = Math.min(4, Math.max(0.02, cam.current.scale * f));
      const wx = (mx - cam.current.ox) / cam.current.scale, wy = (my - cam.current.oy) / cam.current.scale;
      cam.current.ox = mx - wx * ns; cam.current.oy = my - wy * ns; cam.current.scale = ns; render();
    };
    cv.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      sim.stop(); removeEventListener("resize", resize); ro.disconnect(); cv.removeEventListener("wheel", onWheel);
      renderRef.current = () => {}; fitRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.data, props.restartKey]);

  useEffect(() => { const s = simRef.current; if (!s) return; if (props.frozen) s.stop(); else s.alpha(0.5).restart(); }, [props.frozen]);
  useEffect(() => { if (props.fitNonce) fitRef.current(); }, [props.fitNonce]);
  useEffect(() => {
    if (!props.focusId) return;
    let tries = 0;
    const t = setInterval(() => {
      const cv = ref.current; const n = nodesRef.current.find((x) => x.id === props.focusId);
      if (cv && n && n.x != null && n.y != null) {
        const sc = Math.max(cam.current.scale, 0.6);
        cam.current.scale = sc; cam.current.ox = cv.clientWidth / 2 - n.x * sc; cam.current.oy = cv.clientHeight / 2 - n.y! * sc;
        renderRef.current();
      }
      if (++tries > 8) clearInterval(t);
    }, 130);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusId, props.focusNonce]);

  return <canvas ref={ref} style={{ cursor: "grab" }} />;
}

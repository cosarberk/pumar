import { useEffect, useRef } from "react";

export interface SeriesDef { id: string; label: string; color: string; axis: "L" | "R"; kind: "area" | "line"; unit?: string }

/**
 * İnteraktif zaman-serisi grafiği (TradingView benzeri): çift eksen, alan/çizgi,
 * crosshair + hover değer kutusu, yatay pan, tekerlek zoom. Kütüphanesiz canvas.
 */
export function TimeChart({ data, series, visible }: { data: any[]; series: SeriesDef[]; visible: Record<string, boolean> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const win = useRef({ s: 0, e: 0 });          // görünür indeks penceresi
  const hover = useRef<number | null>(null);
  const dataRef = useRef(data); dataRef.current = data;
  const visRef = useRef(visible); visRef.current = visible;

  // Yeni veri (dönem/proje değişimi) gelince pencereyi HER ZAMAN tüm aralığa sıfırla
  useEffect(() => { win.current = { s: 0, e: Math.max(0, data.length - 1) }; }, [data]);

  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!, dpr = devicePixelRatio || 1;
    const pad = { l: 44, r: 48, t: 14, b: 42 };
    const resize = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); };

    function activeSeries() { return series.filter((s) => visRef.current[s.id]); }
    function winData() { const d = dataRef.current; const { s, e } = win.current; return d.slice(s, e + 1); }

    function draw() {
      const d = winData(); const W = cv.clientWidth, H = cv.clientHeight;
      ctx.clearRect(0, 0, W, H);
      if (d.length < 2) { ctx.fillStyle = "#6a7483"; ctx.font = "12px 'IBM Plex Mono',monospace"; ctx.textAlign = "center"; ctx.fillText("yeterli veri yok", W / 2, H / 2); return; }
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const act = activeSeries();
      const Ls = act.filter((s) => s.axis === "L"), Rs = act.filter((s) => s.axis === "R");
      const maxOf = (arr: SeriesDef[]) => Math.max(1, ...arr.flatMap((s) => d.map((r) => Number(r[s.id]) || 0)));
      const lMax = maxOf(Ls), rMax = maxOf(Rs);
      const x = (i: number) => pad.l + (d.length === 1 ? 0 : (i / (d.length - 1)) * iw);
      const yL = (v: number) => pad.t + ih - (v / lMax) * ih;
      const yR = (v: number) => pad.t + ih - (v / rMax) * ih;
      const yOf = (s: SeriesDef, v: number) => (s.axis === "L" ? yL(v) : yR(v));

      // grid + eksen etiketleri
      ctx.strokeStyle = "rgba(214,221,210,0.07)"; ctx.fillStyle = "#6a7483"; ctx.font = "9px 'IBM Plex Mono',monospace";
      for (let g = 0; g <= 4; g++) {
        const yy = pad.t + (ih / 4) * g;
        ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
        if (Ls.length) { ctx.textAlign = "right"; ctx.fillStyle = "#6a7483"; ctx.fillText(String(Math.round(lMax * (1 - g / 4))), pad.l - 5, yy + 3); }
        if (Rs.length) { ctx.textAlign = "left"; ctx.fillStyle = "#8a93a6"; ctx.fillText(String(Math.round(rMax * (1 - g / 4))), W - pad.r + 5, yy + 3); }
      }
      // x etiketleri (birkaç tane)
      const step = Math.max(1, Math.floor(d.length / 7));
      ctx.fillStyle = "#6a7483"; ctx.textAlign = "center";
      for (let i = 0; i < d.length; i += step) ctx.fillText(d[i].period, x(i), H - pad.b + 14);

      // seriler
      for (const s of act) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.beginPath();
        d.forEach((r, i) => { const px = x(i), py = yOf(s, Number(r[s.id]) || 0); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        if (s.kind === "area") {
          ctx.lineTo(x(d.length - 1), yOf(s, 0)); ctx.lineTo(x(0), yOf(s, 0)); ctx.closePath();
          ctx.globalAlpha = 0.14; ctx.fillStyle = s.color; ctx.fill(); ctx.globalAlpha = 1;
          ctx.beginPath(); d.forEach((r, i) => { const px = x(i), py = yOf(s, Number(r[s.id]) || 0); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
        } else ctx.stroke();
      }

      // crosshair + değer kutusu
      const hi = hover.current;
      if (hi != null && hi >= 0 && hi < d.length) {
        const cx = x(hi);
        ctx.strokeStyle = "rgba(214,221,210,0.25)"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, H - pad.b); ctx.stroke(); ctx.setLineDash([]);
        for (const s of act) { const py = yOf(s, Number(d[hi][s.id]) || 0); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(cx, py, 3, 0, 7); ctx.fill(); }
        // kutu
        const lines = [`${d[hi].period}`, ...act.map((s) => `${s.label}: ${d[hi][s.id] ?? "—"}${s.unit ?? ""}`)];
        ctx.font = "10px 'IBM Plex Mono',monospace";
        const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16, bh = lines.length * 14 + 8;
        let bx = cx + 10; if (bx + bw > W - pad.r) bx = cx - bw - 10;
        ctx.fillStyle = "rgba(10,13,18,0.95)"; ctx.strokeStyle = "rgba(214,221,210,0.18)";
        ctx.fillRect(bx, pad.t, bw, bh); ctx.strokeRect(bx, pad.t, bw, bh);
        lines.forEach((l, i) => {
          ctx.textAlign = "left";
          ctx.fillStyle = i === 0 ? "#e4e7df" : act[i - 1].color;
          ctx.fillText(l, bx + 8, pad.t + 16 + i * 14);
        });
      }
    }

    const rel = (e: MouseEvent) => { const b = cv.getBoundingClientRect(); return { mx: e.clientX - b.left, my: e.clientY - b.top }; };
    const idxAt = (mx: number) => {
      const d = winData(); const W = cv.clientWidth, iw = W - pad.l - pad.r;
      const f = (mx - pad.l) / iw; return Math.round(Math.min(1, Math.max(0, f)) * (d.length - 1));
    };
    let panning = false, panStartX = 0, panStartWin = { s: 0, e: 0 };
    cv.onmousedown = (e) => { panning = true; panStartX = rel(e).mx; panStartWin = { ...win.current }; cv.style.cursor = "grabbing"; };
    cv.onmousemove = (e) => {
      const { mx } = rel(e);
      if (panning) {
        const d = dataRef.current, W = cv.clientWidth, iw = W - pad.l - pad.r;
        const span = panStartWin.e - panStartWin.s;
        const shift = Math.round(((panStartX - mx) / iw) * span);
        let s = panStartWin.s + shift, e2 = panStartWin.e + shift;
        if (s < 0) { e2 -= s; s = 0; } if (e2 > d.length - 1) { s -= e2 - (d.length - 1); e2 = d.length - 1; }
        win.current = { s: Math.max(0, s), e: e2 };
      }
      hover.current = idxAt(mx); draw();
    };
    cv.onmouseup = () => { panning = false; cv.style.cursor = "crosshair"; };
    cv.onmouseleave = () => { panning = false; hover.current = null; draw(); };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = dataRef.current; const { mx } = rel(e); const at = win.current.s + idxAt(mx);
      const span = win.current.e - win.current.s; const ns = Math.round(span * (e.deltaY > 0 ? 1.25 : 0.8));
      const clamped = Math.min(d.length - 1, Math.max(2, ns));          // tek sprint'e kadar yakınlaş
      let s = Math.round(at - (clamped * (at - win.current.s)) / Math.max(1, span));
      let e2 = s + clamped; if (s < 0) { e2 -= s; s = 0; } if (e2 > d.length - 1) { s -= e2 - (d.length - 1); e2 = d.length - 1; }
      win.current = { s: Math.max(0, s), e: e2 }; draw();
    };
    cv.addEventListener("wheel", onWheel, { passive: false });

    resize(); addEventListener("resize", resize);
    return () => { removeEventListener("resize", resize); cv.removeEventListener("wheel", onWheel); };
  }, [data, series, visible]);

  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }} />;
}

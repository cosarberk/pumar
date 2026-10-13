import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { BarChart, LineChart } from "../components/Charts";

export function Sprints({ project }: { project: string }) {
  const [data, setData] = useState<{ mode: string; rows: any[] }>({ mode: "sprint", rows: [] });
  const [big, setBig] = useState<"vel" | "trend" | "velSP" | null>(null);
  useEffect(() => { api.velocity(project).then(setData); }, [project]);
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && setBig(null); addEventListener("keydown", h); return () => removeEventListener("keydown", h); }, []);

  const sprintMode = data.mode === "sprint";
  const rows = data.rows;
  const label = (r: any) => (sprintMode ? r.sprint : r.week);
  const done = rows.map((r) => Number(r.done));
  const avg = done.length ? Math.round(done.reduce((s, v) => s + v, 0) / done.length) : 0;
  const last = done[done.length - 1] ?? 0;
  const trend = done.length > 1 ? last - done[done.length - 2] : 0;

  const predictability = useMemo(() => {
    if (done.length < 2) return 0;
    const m = done.reduce((s, v) => s + v, 0) / done.length;
    const sd = Math.sqrt(done.reduce((s, v) => s + (v - m) ** 2, 0) / done.length);
    return m ? Math.round((1 - sd / m) * 100) : 0;
  }, [done]);

  const avgCommit = useMemo(() => {
    const vals = rows.map((r) => r.commitmentPct).filter((x) => x != null);
    return vals.length ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length) : null;
  }, [rows]);
  const avgScope = useMemo(() => {
    const vals = rows.map((r) => r.scopePct).filter((x) => x != null);
    return vals.length ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length) : null;
  }, [rows]);
  const sp = rows.map((r) => Number(r.points) || 0);
  const avgSP = sp.length ? Math.round(sp.reduce((s, v) => s + v, 0) / sp.length) : 0;
  const hasSP = sp.some((v) => v > 0);

  return (
    <>
      <div className="vhead">
        <h2>Velocity</h2>
        <p>{sprintMode ? "Sprint başına teslim, kapasite ve SÖZ TUTMA (planlanan vs sonradan eklenen)." : "Sprint linki yok — haftalık throughput."} <span className="tag">{project}</span></p>
      </div>

      <div className="kstrip">
        <div className="kcell"><div className="l">{sprintMode ? "Sprint" : "Hafta"}</div><div className="v num">{rows.length}</div></div>
        <div className="kcell"><div className="l">Ort. velocity</div><div className="v num">{avg}</div><div className="d">iş / {sprintMode ? "sprint" : "hafta"}</div></div>
        <div className="kcell"><div className="l">Son</div><div className="v num">{last}</div><div className={`d ${trend >= 0 ? "up" : "down"}`}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}</div></div>
        <div className="kcell"><div className="l">Öngörülebilirlik</div><div className="v num" style={{ color: predictability > 70 ? "var(--good)" : predictability > 40 ? "var(--amber)" : "var(--bad)" }}>%{predictability}</div><div className="d">tutarlılık</div></div>
        {sprintMode && <div className="kcell"><div className="l">Ort. söz tutma</div><div className="v num" style={{ color: (avgCommit ?? 0) >= 80 ? "var(--good)" : (avgCommit ?? 0) >= 50 ? "var(--amber)" : "var(--bad)" }}>%{avgCommit ?? "—"}</div><div className="d">planlananın biteni</div></div>}
        {sprintMode && <div className="kcell"><div className="l">Ort. scope ekleme</div><div className="v num" style={{ color: (avgScope ?? 0) > 40 ? "var(--bad)" : (avgScope ?? 0) > 15 ? "var(--amber)" : "var(--good)" }}>%{avgScope ?? "—"}</div><div className="d">sonradan eklenen</div></div>}
        {sprintMode && <div className="kcell"><div className="l">Ort. velocity (SP)</div><div className="v num">{hasSP ? avgSP : "—"}</div><div className="d">{hasSP ? "story point / sprint" : "SP verisi yok"}</div></div>}
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="card col-4">
          <header><h3>Velocity (adet)</h3><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="hint">tamamlanan iş</span><button className="card-exp" title="Büyüt" onClick={() => setBig("vel")}>⤢</button></div></header>
          <div className="body" style={{ overflowX: "auto", cursor: "zoom-in" }} onClick={() => setBig("vel")}><BarChart data={rows.map((r) => ({ label: label(r), value: Number(r.done) }))} color="var(--amber)" /></div>
        </div>
        {sprintMode && (
          <div className="card col-4">
            <header><h3>Velocity (SP)</h3><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="hint">{hasSP ? "story point" : "SP verisi yok"}</span><button className="card-exp" title="Büyüt" onClick={() => setBig("velSP")}>⤢</button></div></header>
            <div className="body" style={{ overflowX: "auto", cursor: "zoom-in" }} onClick={() => setBig("velSP")}><BarChart data={rows.map((r) => ({ label: label(r), value: Number(r.points) || 0 }))} color="var(--teal)" unit="sp" /></div>
          </div>
        )}
        <div className="card col-4">
          <header><h3>Trend</h3><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="hint">amber=hareketli ort.</span><button className="card-exp" title="Büyüt" onClick={() => setBig("trend")}>⤢</button></div></header>
          <div className="body" style={{ overflowX: "auto", cursor: "zoom-in" }} onClick={() => setBig("trend")}><LineChart data={rows.map((r) => ({ label: label(r), value: Number(r.done) }))} roll={3} /></div>
        </div>
        {sprintMode && (
          <div className="card col-12">
            <header><h3>Sprint Tablosu</h3><span className="hint">planlanan vs eklenen · söz tutma</span></header>
            <div className="body" style={{ padding: 0, overflowX: "auto" }}>
              <table>
                <thead><tr><th>sprint</th><th>planlanan</th><th>eklenen (scope)</th><th>biten</th><th>SP</th><th>tamamlanma</th><th>söz tutma</th><th>süre</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.sprint}>
                      <td className="k" style={{ fontFamily: "var(--body)", color: "var(--bone)" }}>{r.sprint}</td>
                      <td className="num">{r.committed}</td>
                      <td><span className={`pill ${r.scopePct > 40 ? "bad" : r.scopePct > 15 ? "warn" : "good"}`}>+{r.added} (%{r.scopePct ?? 0})</span></td>
                      <td className="num">{r.done}</td>
                      <td className="num">{Number(r.points) || "—"}</td>
                      <td><span className={`pill ${r.completionPct >= 90 ? "good" : r.completionPct >= 60 ? "warn" : "bad"}`}>%{r.completionPct}</span></td>
                      <td><span className={`pill ${r.commitmentPct >= 80 ? "good" : r.commitmentPct >= 50 ? "warn" : "bad"}`}>%{r.commitmentPct ?? "—"}</span></td>
                      <td className="num">{r.lengthDays != null ? `${r.lengthDays}g` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {big && (
        <div className="modal-backdrop" onClick={() => setBig(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{big === "vel" ? "Velocity — tamamlanan iş / dönem" : big === "velSP" ? "Velocity — story point / sprint" : "Trend — hareketli ortalama"}</h3>
              <span className="modal-x" onClick={() => setBig(null)}>✕ kapat (Esc)</span>
            </div>
            <div className="modal-body">
              {big === "vel" && <BarChart data={rows.map((r) => ({ label: label(r), value: Number(r.done) }))} color="var(--amber)" />}
              {big === "velSP" && <BarChart data={rows.map((r) => ({ label: label(r), value: Number(r.points) || 0 }))} color="var(--teal)" unit="sp" />}
              {big === "trend" && <LineChart data={rows.map((r) => ({ label: label(r), value: Number(r.done) }))} roll={3} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

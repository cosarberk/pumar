import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { BarChart } from "../components/Charts";
import { RiskMatrix, type RiskItem } from "../components/RiskMatrix";

import { jiraUrl } from "../jira";
const openJira = (k: string) => { const u = jiraUrl(k); if (u) window.open(u, "_blank"); };
const RISK_CLASS: Record<string, string> = { "yüksek": "bad", "orta": "warn", "düşük": "good" };
const SCOPES: { id: "all" | "wip" | "backlog"; label: string }[] = [
  { id: "all", label: "Hepsi" }, { id: "wip", label: "Aktif (WIP)" }, { id: "backlog", label: "Backlog" },
];
type Row = RiskItem & { assignee: string | null; sprint: string | null; blocked: number; overdue: boolean; type: string };

export function Risk({ project }: { project: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [opts, setOpts] = useState<{ assignees: string[]; sprints: string[] }>({ assignees: [], sprints: [] });
  const [assignee, setAssignee] = useState("");
  const [sprint, setSprint] = useState("");
  const [scope, setScope] = useState<"all" | "wip" | "backlog">("all");
  const [big, setBig] = useState<"matrix" | "level" | "reason" | "assignee" | "sprint" | null>(null);

  useEffect(() => { api.streamFilters(project).then(setOpts); }, [project]);
  useEffect(() => { api.risk(project, { assignee: assignee || undefined, sprint: sprint || undefined, scope }).then((r) => setRows(r as any)); }, [project, assignee, sprint, scope]);
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && setBig(null); addEventListener("keydown", h); return () => removeEventListener("keydown", h); }, []);

  const high = rows.filter((r) => r.risk === "yüksek").length;
  const mid = rows.filter((r) => r.risk === "orta").length;
  const blocked = rows.filter((r) => r.blocked > 0).length;
  const overdue = rows.filter((r) => r.overdue).length;

  const byLevel = [{ label: "yüksek", value: high }, { label: "orta", value: mid }, { label: "düşük", value: rows.length - high - mid }];
  const byReason = useMemo(() => {
    const m: Record<string, number> = { "bloklu": 0, "sprint": 0, "eski/bekleyen": 0, "etkiliyor": 0, "sahipsiz": 0 };
    for (const r of rows) for (const x of r.reasons) {
      if (x.startsWith("bloklu")) m["bloklu"]++; else if (x.includes("sprint")) m["sprint"]++;
      else if (x.includes("eski") || x.includes("bekliyor")) m["eski/bekleyen"]++;
      else if (x.includes("etkiliyor")) m["etkiliyor"]++; else if (x === "sahipsiz") m["sahipsiz"]++;
    }
    return Object.entries(m).map(([label, value]) => ({ label, value }));
  }, [rows]);
  const byAssignee = useMemo(() => {
    const m: Record<string, number> = {}; for (const r of rows) { const k = r.assignee ?? "—"; m[k] = (m[k] ?? 0) + 1; }
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 14);
  }, [rows]);
  const bySprint = useMemo(() => {
    const m: Record<string, number> = {}; for (const r of rows) { const k = r.sprint ?? "—"; m[k] = (m[k] ?? 0) + 1; }
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 14);
  }, [rows]);

  const reasonMeters = useMemo(() => {
    const m: Record<string, number> = { "bloklu": 0, "sprint aştı / kaldı": 0, "uzun bekliyor / eski": 0, "başkasını etkiliyor": 0, "sahipsiz": 0 };
    for (const r of rows) for (const x of r.reasons) {
      if (x.startsWith("bloklu")) m["bloklu"]++;
      else if (x.includes("sprint")) m["sprint aştı / kaldı"]++;
      else if (x.includes("eski") || x.includes("bekliyor")) m["uzun bekliyor / eski"]++;
      else if (x.includes("etkiliyor")) m["başkasını etkiliyor"]++;
      else if (x === "sahipsiz") m["sahipsiz"]++;
    }
    const max = Math.max(1, ...Object.values(m));
    return Object.entries(m).map(([label, value]) => ({ label, value, pct: (value / max) * 100 }));
  }, [rows]);

  return (
    <>
      <div className="vhead">
        <h2>Risk Radarı</h2>
        <p>Aktif + backlog işlerin gerçek riski — bekleme, bloklu, sprint aşımı ve <b>etki</b> birlikte skorlanır.</p>
      </div>

      <div className="tools">
        {SCOPES.map((s) => <button key={s.id} style={scope === s.id ? { background: "var(--amber)", color: "#06121a", borderColor: "var(--amber)" } : undefined} onClick={() => setScope(s.id)}>{s.label}</button>)}
        <span className="x" style={{ color: "var(--dim)" }}>|</span>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ maxWidth: 160 }}><option value="">Herkes</option>{opts.assignees.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={sprint} onChange={(e) => setSprint(e.target.value)} style={{ maxWidth: 150 }}><option value="">Tüm sprintler</option>{opts.sprints.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        {(assignee || sprint) && <button onClick={() => { setAssignee(""); setSprint(""); }}>✕ temizle</button>}
      </div>

      <div className="kstrip">
        <div className="kcell"><div className="l">Kart</div><div className="v num">{rows.length}</div></div>
        <div className="kcell"><div className="l">Yüksek risk</div><div className="v num" style={{ color: "var(--bad)" }}>{high}</div></div>
        <div className="kcell"><div className="l">Bloklu</div><div className="v num" style={{ color: blocked ? "var(--bad)" : "var(--bone)" }}>{blocked}</div></div>
        <div className="kcell"><div className="l">Sprint aşan</div><div className="v num" style={{ color: overdue ? "var(--bad)" : "var(--bone)" }}>{overdue}</div></div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="card col-6">
          <header><h3>Risk Matrisi</h3><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="hint">bekleme × etki</span><button className="card-exp" title="Büyüt" onClick={() => setBig("matrix")}>⤢</button></div></header>
          <div className="body"><RiskMatrix items={rows} onPick={openJira} /></div>
        </div>
        <div className="card col-6">
          <header><h3>Risk Sebepleri</h3><span className="hint">kaç kart</span></header>
          <div className="body">
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
              {reasonMeters.map((m) => (
                <div key={m.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", marginBottom: 4 }}><span>{m.label}</span><b style={{ color: "var(--bone)" }}>{m.value}</b></div>
                  <div style={{ height: 8, background: "rgba(214,221,210,0.06)" }}><div style={{ height: "100%", width: `${m.pct}%`, background: m.value ? "var(--bad)" : "transparent" }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card col-3"><header><h3>Risk Seviyesi</h3><button className="card-exp" title="Büyüt" onClick={() => setBig("level")}>⤢</button></header><div className="body" style={{ cursor: "zoom-in", overflowX: "auto" }} onClick={() => setBig("level")}><BarChart data={byLevel} color="var(--bad)" /></div></div>
        <div className="card col-3"><header><h3>Sebep Dağılımı</h3><button className="card-exp" title="Büyüt" onClick={() => setBig("reason")}>⤢</button></header><div className="body" style={{ cursor: "zoom-in", overflowX: "auto" }} onClick={() => setBig("reason")}><BarChart data={byReason} color="var(--bad)" /></div></div>
        <div className="card col-3"><header><h3>Kişiye Göre</h3><button className="card-exp" title="Büyüt" onClick={() => setBig("assignee")}>⤢</button></header><div className="body" style={{ cursor: "zoom-in", overflowX: "auto" }} onClick={() => setBig("assignee")}><BarChart data={byAssignee} color="var(--amber)" /></div></div>
        <div className="card col-3"><header><h3>Sprint Bazında</h3><button className="card-exp" title="Büyüt" onClick={() => setBig("sprint")}>⤢</button></header><div className="body" style={{ cursor: "zoom-in", overflowX: "auto" }} onClick={() => setBig("sprint")}><BarChart data={bySprint} color="var(--amber)" /></div></div>

        <div className="card col-12">
          <header><h3>Öncelik Listesi</h3><span className="hint">en riskliden → işe ilk buradan başla</span></header>
          <div className="body" style={{ padding: 0, maxHeight: 360, overflow: "auto" }}>
            {rows.length === 0 ? <div className="empty">kayıt yok</div> : rows.slice(0, 60).map((r, i) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim-2)", width: 22 }}>{i + 1}</span>
                <span style={{ width: 9, height: 9, borderRadius: "50%", flex: "0 0 auto", background: r.risk === "yüksek" ? "var(--bad)" : r.risk === "orta" ? "var(--amber)" : "var(--good)" }} />
                <a href={jiraUrl(r.key)} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--amber)", textDecoration: "none", width: 88, flex: "0 0 auto" }}>{r.key} ↗</a>
                <span className="tag" style={{ flex: "0 0 auto" }}>{r.kind === "backlog" ? "backlog" : "aktif"}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.summary}>{r.summary}</span>
                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>{r.reasons.map((x) => <span key={x} className={`pill ${x.startsWith("bloklu") || x.includes("sprint") ? "bad" : "warn"}`} style={{ fontSize: 10 }}>{x}</span>)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", flex: "0 0 auto", width: 48, textAlign: "right" }}>{r.days}g</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card col-12">
          <header><h3>Riskli Kartlar</h3><span className="hint">{rows.length} kayıt · tüm detay</span></header>
          <div className="body" style={{ padding: 0, maxHeight: 440, overflow: "auto" }}>
            {rows.length === 0 ? <div className="empty">kayıt yok</div> : (
              <table>
                <thead><tr><th>key</th><th>özet</th><th>tip</th><th>kapsam</th><th>sprint</th><th>kişi</th><th>bekleme</th><th>etki</th><th>neden riskli</th><th>risk</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="k"><a href={jiraUrl(r.key)} target="_blank" rel="noreferrer" style={{ color: "var(--amber)", textDecoration: "none" }}>{r.key} ↗</a></td>
                      <td style={{ fontFamily: "var(--body)", maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.summary}>{r.summary}</td>
                      <td>{r.type}</td>
                      <td>{r.kind === "backlog" ? "backlog" : "aktif"}</td>
                      <td>{r.sprint ?? "—"}</td>
                      <td>{r.assignee ?? "—"}</td>
                      <td><span className={`pill ${r.days > 20 ? "bad" : r.days > 7 ? "warn" : "good"}`}>{r.days}g</span></td>
                      <td className="num">{r.impact || "—"}</td>
                      <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{r.reasons.length ? r.reasons.map((x) => <span key={x} className={`pill ${x.startsWith("bloklu") || x.includes("sprint") ? "bad" : "warn"}`} style={{ fontSize: 10 }}>{x}</span>) : <span style={{ color: "var(--dim)" }}>—</span>}</td>
                      <td><span className={`pill ${RISK_CLASS[r.risk] ?? "good"}`}>{r.risk}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {big && (
        <div className="modal-backdrop" onClick={() => setBig(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{big === "matrix" ? "Risk Matrisi — bekleme × etki" : big === "level" ? "Risk Seviyesi" : big === "reason" ? "Sebep Dağılımı" : big === "assignee" ? "Kişiye Göre" : "Sprint Bazında"}</h3>
              <span className="modal-x" onClick={() => setBig(null)}>✕ kapat (Esc)</span>
            </div>
            <div className="modal-body">
              {big === "matrix" && <RiskMatrix items={rows} onPick={openJira} />}
              {big === "level" && <BarChart data={byLevel} color="var(--bad)" />}
              {big === "reason" && <BarChart data={byReason} color="var(--bad)" />}
              {big === "assignee" && <BarChart data={byAssignee} color="var(--amber)" />}
              {big === "sprint" && <BarChart data={bySprint} color="var(--amber)" />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

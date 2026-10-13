import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { jiraUrl, gitlabUrl, gitlabMrUrl } from "../jira";

type Row = Record<string, unknown>;
const CARDS = [
  { id: "aging", title: "Çürüyen kartlar", hint: "In Progress'te bekleyen", kind: "item" as const },
  { id: "done_without_mr", title: "Done ama MR yok", hint: "Jira↔GitLab tutarsızlığı", kind: "item" as const },
  { id: "bus_factor", title: "Bus-factor riski", hint: "tek kişiye bağımlı repo", kind: "repo" as const },
  { id: "review_bottleneck", title: "Review darboğazı", hint: "repo başına merge süresi", kind: "repo" as const },
  { id: "unlinked_code", title: "Issue'suz kod", hint: "başıboş commit/MR", kind: "info" as const },
];

const LBL: Record<string, string> = {
  key: "Key", summary: "Özet", status: "Durum", assignee: "Atanan", days: "Gün",
  resolved_at: "Çözüldü", kind: "Tür", count: "Adet", repo: "Repo",
  "tek_kişi_payı": "Tek kişi payı", mr: "MR", ilk_review: "İlk review", merge_days: "Merge süresi", merged: "Merge",
};
const lbl = (c: string) => LBL[c] ?? c.replace(/_/g, " ");
const JKey = ({ k }: { k: string }) => {
  const u = jiraUrl(k);
  return u
    ? <a className="jkey" href={u} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{k} ↗</a>
    : <span className="jkey">{k}</span>;
};
const GRepo = ({ p }: { p: string }) => {
  const u = gitlabUrl(p);
  return u
    ? <a className="jkey" href={u} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{p} ↗</a>
    : <span className="jkey">{p}</span>;
};

function pill(c: string, v: unknown) {
  const n = Number(v);
  if (c === "days" || c === "merge_days") return <span className={`pill ${n > 5 ? "bad" : n > 3 ? "warn" : "good"}`}>{String(v)}g</span>;
  if (c === "ilk_review") return <span className={`pill ${n > 3 ? "bad" : n > 1.5 ? "warn" : "good"}`}>{String(v)}g</span>;
  if (c === "tek_kişi_payı") return <span className={`pill ${n > 75 ? "bad" : n > 60 ? "warn" : "good"}`}>%{String(v)}</span>;
  if (c === "count") return <span className="pill warn">{String(v)}</span>;
  if (c === "resolved_at") return <span className="dim">{v ? String(v).slice(0, 10) : "—"}</span>;
  return String(v ?? "—");
}

function critCount(id: string, rows: Row[]) {
  switch (id) {
    case "aging": return rows.filter((r) => Number(r.days) > 5).length;
    case "bus_factor": return rows.filter((r) => Number(r["tek_kişi_payı"]) > 75).length;
    case "review_bottleneck": return rows.filter((r) => Number(r.merge_days) > 5).length;
    case "unlinked_code": return rows.reduce((s, r) => s + Number(r.count ?? 0), 0);
    default: return rows.length;
  }
}
function sevLevel(id: string, rows: Row[]): "bad" | "warn" | "good" {
  const c = critCount(id, rows);
  if (id === "unlinked_code") return c > 50 ? "bad" : c > 0 ? "warn" : "good";
  if (!rows.length) return "good";
  return c > 5 ? "bad" : c > 0 ? "warn" : rows.length > 8 ? "warn" : "good";
}
function orderCols(rows: Row[]) {
  if (!rows[0]) return [];
  const cols = Object.keys(rows[0]);
  const head = cols.filter((c) => ["key", "repo", "kind"].includes(c));
  const sum = cols.filter((c) => c === "summary");
  const rest = cols.filter((c) => !["key", "repo", "kind", "summary"].includes(c));
  return [...head, ...sum, ...rest];
}

type Drill =
  | { kind: "item"; key: string; row: [string, unknown][]; loading: boolean; self: any; mrs: any[]; rels: any[] }
  | { kind: "repo" | "info"; title: string; sub?: string; fields: [string, unknown][] }
  | null;

export function Insights({ project }: { project: string }) {
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [agingDays, setAgingDays] = useState(3);
  const [busy, setBusy] = useState(true);
  const [drill, setDrill] = useState<Drill>(null);
  const [selKey, setSelKey] = useState<string>("");
  const [tab, setTab] = useState<string>("aging");

  useEffect(() => {
    let alive = true;
    setBusy(true);
    Promise.all(CARDS.map((c) => api.insight(c.id, project, c.id === "aging" ? agingDays : undefined).then((rows) => [c.id, rows] as const)))
      .then((entries) => { if (alive) { setData(Object.fromEntries(entries)); setBusy(false); } });
    return () => { alive = false; };
  }, [project, agingDays]);

  const triage = useMemo(() =>
    CARDS.map((c) => ({ ...c, rows: data[c.id] ?? [], sev: sevLevel(c.id, data[c.id] ?? []), crit: critCount(c.id, data[c.id] ?? []) })),
    [data]);
  const totalCrit = triage.filter((t) => t.id !== "unlinked_code").reduce((s, t) => s + t.crit, 0);

  async function openItem(key: string, row: Row) {
    setSelKey(key);
    const re = Object.entries(row);
    setDrill({ kind: "item", key, row: re, loading: true, self: null, mrs: [], rels: [] });
    const g = await api.universeExpand(key);
    const byId = new Map(g.nodes.map((n: any) => [n.id, n]));
    const self = byId.get(key) ?? null;
    const mrs = g.nodes.filter((n: any) => n.kind === "mr");
    const rels = g.edges
      .filter((e: any) => e.source === key || e.target === key)
      .map((e: any) => {
        const otherId = e.source === key ? e.target : e.source;
        const o: any = byId.get(otherId);
        if (!o || o.kind !== "issue") return null;
        return { rel: e.rel, key: o.label ?? otherId, summary: o.summary };
      })
      .filter(Boolean);
    setDrill((d) => (d && d.kind === "item" && d.key === key ? { kind: "item", key, row: re, loading: false, self, mrs, rels } : d));
  }
  function openRow(card: typeof CARDS[number], r: Row) {
    if (card.kind === "item") { openItem(String(r.key), r); return; }
    const id = card.kind === "repo" ? String(r.repo) : String(r.kind);
    setSelKey(id);
    setDrill({ kind: card.kind, title: id, sub: card.title, fields: Object.entries(r).filter(([k]) => k !== "repo" && k !== "kind") });
  }

  return (
    <div className="ws">
      <div className="ws-toolbar">
        <span className="wt-title">Signals</span>
        <span className="wt-kpi"><b className="num">{totalCrit}</b> kritik</span>
        <span className="wt-sep" />
        {triage.map((t) => (
          <span key={t.id} className={`sig-chip ${tab === t.id ? "on" : ""}`} title={t.hint} onClick={() => setTab(t.id)}>
            <span className={`sig-dot ${t.sev}`} />{t.title} <b className="num">{t.id === "unlinked_code" ? t.crit : t.rows.length}</b>
          </span>
        ))}
        <span className="grow" />
        <span className="wt-kpi">çürüme eşiği</span>
        <select value={agingDays} onChange={(e) => setAgingDays(Number(e.target.value))}>
          {[3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d}+ gün</option>)}
        </select>
      </div>

      <div className="ws-body sig-body">
        {/* SAĞ detay paneli (row-reverse ile sağda) */}
        <div className="ws-inspector sig-panel">
          <div className="insp-sec"><h4>Detay {drill && <span className="sig-x" onClick={() => { setDrill(null); setSelKey(""); }} title="kapat">✕</span>}</h4>
            {!drill && <div className="insp-row"><span>bir satıra tıkla →</span></div>}
            {drill && drill.kind === "item" && (
              <>
                <div className="insp-row"><span>key</span><JKey k={drill.key} /></div>
                {drill.row.filter(([k]) => k !== "key" && k !== "summary").map(([k, v]) => (
                  <div className="insp-row" key={k}><span>{lbl(k)}</span><b>{pill(k, v)}</b></div>
                ))}
                {drill.self?.type && <div className="insp-row"><span>tip</span><b>{drill.self.type}</b></div>}
                {drill.self?.category && <div className="insp-row"><span>kategori</span><b>{drill.self.category}</b></div>}
                {drill.self?.degree != null && <div className="insp-row"><span>bağlantı</span><b className="num">{drill.self.degree}</b></div>}
                {(() => { const s = drill.row.find(([k]) => k === "summary"); return s ? <div className="sig-dsub">{String(s[1])}</div> : null; })()}
              </>
            )}
            {drill && drill.kind !== "item" && (
              <>
                <div className="insp-row"><span>{drill.kind === "repo" ? "repo" : "tür"}</span>{drill.kind === "repo" ? <GRepo p={drill.title} /> : <b>{drill.title}</b>}</div>
                <div className="sig-dsub">{drill.sub}</div>
              </>
            )}
          </div>

          {drill && drill.kind === "item" && (
            <>
              <div className="insp-sec">
                <h4>Bağlı MR'lar ({drill.loading ? "…" : drill.mrs.length})</h4>
                {drill.loading ? <div className="insp-row"><span>yükleniyor…</span></div>
                  : drill.mrs.length ? drill.mrs.map((m: any) => {
                    const mu = gitlabMrUrl(m.id);
                    return (
                      <div className="insp-row" key={m.id}>
                        {mu ? <a className="jkey" href={mu} target="_blank" rel="noreferrer" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }} title={m.summary}>{m.label} ↗</a>
                            : <span className="dim" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }} title={m.summary}>{m.label}</span>}
                        <span className={`pill ${m.state === "merged" ? "good" : m.state === "opened" ? "warn" : ""}`}>{m.state ?? "—"}</span>
                      </div>
                    );
                  }) : <div className="insp-row"><span>— MR yok (tutarsızlık) —</span></div>}
              </div>
              <div className="insp-sec">
                <h4>İlişkiler / engel ({drill.loading ? "…" : drill.rels.length})</h4>
                {!drill.loading && (drill.rels.length ? drill.rels.map((l: any, i: number) => (
                  <div className="insp-row" key={i}><span className="tag">{l.rel}</span><JKey k={l.key} /></div>
                )) : <div className="insp-row"><span>— yok —</span></div>)}
              </div>
            </>
          )}
          {drill && drill.kind !== "item" && (
            <div className="insp-sec">
              <h4>Değerler</h4>
              {drill.fields.map(([k, v]) => (
                <div className="insp-row" key={k}><span>{lbl(k)}</span><b>{pill(k, v)}</b></div>
              ))}
            </div>
          )}
        </div>

        {/* SAĞ: alt alta tablolar */}
        <div className="ws-viewport sig-scroll">
          <div className="sig-stack">
            {triage.filter((c) => c.id === tab).map((c) => {
              const rows = c.rows;
              const cols = orderCols(rows);
              return (
                <div key={c.id} className="card">
                  <header>
                    <h3>{c.title}</h3>
                    <span className="hint">{c.hint}</span>
                    <span className={`pill ${c.sev}`}>{rows.length}</span>
                  </header>
                  <div className="body" style={{ padding: 0, overflow: "auto" }}>
                    {!rows.length ? (
                      <div className="empty" style={{ padding: 24 }}>{busy ? "yükleniyor…" : "temiz ✓"}</div>
                    ) : (
                      <table>
                        <thead><tr>{cols.map((col) => <th key={col}>{lbl(col)}</th>)}</tr></thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const rid = c.kind === "repo" ? String(r.repo) : c.kind === "item" ? String(r.key) : String(r.kind);
                            return (
                              <tr key={i} className={`sig-row ${selKey === rid ? "on" : ""}`} onClick={() => openRow(c, r)}>
                                {cols.map((col) => (
                                  <td key={col} className={col === "summary" ? "sig-sum" : ""}>
                                    {col === "key" ? <JKey k={String(r[col])} /> : col === "repo" ? <GRepo p={String(r[col])} /> : col === "summary" ? String(r[col] ?? "") : pill(col, r[col])}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

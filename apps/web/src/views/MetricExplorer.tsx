import { useEffect, useMemo, useState } from "react";
import { api, type Catalog, type DrillItem, type MetricFilters } from "../api";
import { BarChart } from "../components/Charts";
import { jiraUrl } from "../jira";

/**
 * Isı-haritası rengi — yeşil (iyi) ↔ kırmızı (kötü), yumuşatılmış tonlar.
 * Orta değer ŞEFFAF (mürekkebe karışır → çamur/kahverengi geçiş yok); nötr ölçü amber yoğunluk.
 */
function heat(v: number, min: number, max: number, better: string): string {
  if (!isFinite(v) || max <= min) return "transparent";
  const t = (v - min) / (max - min);                 // 0..1 büyüklük
  if (better === "neutral") return `rgba(150,163,183,${(0.05 + 0.30 * t).toFixed(3)})`; // gri: güçlendirildi
  const good = better === "lower" ? 1 - t : t;        // 0=kötü .. 1=iyi
  const d = Math.abs(good - 0.5) * 2;                 // orta=0 (şeffaf), uç=1
  // yeşil daha belirgin, kırmızı dizginli (göz kırmızıyı daha baskın algılar)
  return good >= 0.5
    ? `rgba(90,196,140,${(0.05 + 0.28 * d).toFixed(3)})`
    : `rgba(214,118,112,${(0.05 + 0.21 * d).toFixed(3)})`;
}

const catPill = (c: string | null) =>
  c === "done" ? "good" : c === "in_progress" ? "warn" : "";

export function MetricExplorer({ project }: { project: string }) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [rowDim, setRowDim] = useState("assignee");
  const [colDim, setColDim] = useState("");            // "" = tüm ölçüler tablosu
  const [measure, setMeasure] = useState("throughput"); // çapraz pivot + grafik ölçüsü
  const [sprint, setSprint] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [opts, setOpts] = useState<{ sprints: string[]; types: string[] }>({ sprints: [], types: [] });

  const [table, setTable] = useState<{ measures: { id: string; title: string; unit: string }[]; rows: Record<string, unknown>[] }>({ measures: [], rows: [] });
  const [cross, setCross] = useState<{ row: string; col: string; value: number | null }[]>([]);
  const [sortBy, setSortBy] = useState("throughput");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<{ title: string; items: DrillItem[]; loading: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const filters: MetricFilters = useMemo(
    () => ({ project, sprint: sprint || undefined, type: type || undefined, from: from || undefined, to: to || undefined }),
    [project, sprint, type, from, to],
  );
  const fkey = JSON.stringify(filters);

  useEffect(() => { api.catalog().then(setCat); }, []);
  useEffect(() => { api.metricOptions(project).then(setOpts); }, [project]);

  // satır boyutu = sütun boyutu olamaz
  useEffect(() => { if (colDim && colDim === rowDim) setColDim(""); }, [rowDim, colDim]);

  // Veri yükle: colDim boşsa tüm-ölçü tablosu, doluysa çapraz pivot
  useEffect(() => {
    let alive = true;
    setBusy(true);
    (async () => {
      if (!colDim) {
        const t = await api.metricTable(rowDim, filters);
        if (alive) { setTable(t); setCross([]); }
      } else {
        const c = await api.metricCrosstab(measure, rowDim, colDim, filters);
        if (alive) { setCross(c); }
      }
      if (alive) setBusy(false);
    })();
    return () => { alive = false; };
  }, [rowDim, colDim, measure, fkey]); // eslint-disable-line react-hooks/exhaustive-deps

  const bw = (id: string) => cat?.measures.find((m) => m.id === id)?.betterWhen ?? "neutral";
  const dimTitle = (id: string) => cat?.dimensions.find((d) => d.id === id)?.title ?? id;
  const measTitle = (id: string) => cat?.measures.find((m) => m.id === id)?.title ?? id;

  // ---- tablo modu (tüm ölçüler) ----
  const rows = useMemo(() => {
    const r = [...table.rows];
    r.sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0));
    return r;
  }, [table, sortBy]);
  const range = useMemo(() => {
    const m: Record<string, { min: number; max: number }> = {};
    for (const meas of table.measures) {
      const vals = table.rows.map((r) => Number(r[meas.id] ?? 0)).filter((v) => isFinite(v));
      m[meas.id] = { min: Math.min(...vals, 0), max: Math.max(1, ...vals) };
    }
    return m;
  }, [table]);
  const visMeasures = table.measures.filter((m) => !hidden[m.id]);

  // ---- çapraz pivot modu ----
  const cx = useMemo(() => {
    const rowKeys: string[] = [];
    const colKeys: string[] = [];
    const cell = new Map<string, number>();
    const rowTot = new Map<string, number>();
    const colTot = new Map<string, number>();
    let min = Infinity, max = -Infinity;
    for (const c of cross) {
      const v = Number(c.value ?? 0);
      if (!rowTot.has(c.row)) rowKeys.push(c.row);
      if (!colTot.has(c.col)) colKeys.push(c.col);
      cell.set(`${c.row}\u0000${c.col}`, v);
      rowTot.set(c.row, (rowTot.get(c.row) ?? 0) + v);
      colTot.set(c.col, (colTot.get(c.col) ?? 0) + v);
      if (v < min) min = v; if (v > max) max = v;
    }
    rowKeys.sort((a, b) => (rowTot.get(b) ?? 0) - (rowTot.get(a) ?? 0));
    colKeys.sort((a, b) => (colTot.get(b) ?? 0) - (colTot.get(a) ?? 0));
    return { rowKeys, colKeys, cell, rowTot, colTot, min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 1 };
  }, [cross]);

  // ---- grafik (seçili ölçü, satır boyutu bazında) ----
  const chart = useMemo(() => {
    if (!colDim) return rows.map((r) => ({ label: String(r.group), value: Number(r[measure] ?? 0) })).slice(0, 14);
    return cx.rowKeys.map((k) => ({ label: k, value: cx.rowTot.get(k) ?? 0 })).slice(0, 14);
  }, [colDim, rows, measure, cx]);

  const totalCards = useMemo(() => {
    if (!colDim) return rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    return cross.reduce((s, c) => s + Number(c.value ?? 0), 0);
  }, [colDim, rows, cross]);

  async function openDrill(p: { title: string; group: string; measure?: string; colGroup?: string }) {
    setDrill({ title: p.title, items: [], loading: true });
    const items = await api.metricItems({
      dimension: rowDim, group: p.group, measure: p.measure,
      col: p.colGroup != null ? colDim : undefined, colGroup: p.colGroup,
      ...filters,
    });
    setDrill((d) => (d && d.title === p.title ? { title: p.title, items, loading: false } : d));
  }

  const hasFilter = sprint || type || from || to;

  return (
    <>
      <div className="vhead">
        <h2>Metric Explorer</h2>
        <p>Satır boyutu seç → <b>tüm ölçüler</b> kesilir. İkinci (sütun) boyut seçersen <b>çapraz pivot</b> matrisi gelir. Hücreler <b>iyi/kötü</b> ısı-haritası; hücreye tıkla = o kırılımdaki <b>gerçek kartlar</b>.</p>
      </div>

      <div className="tools mx-tools">
        <span className="x">satır</span>
        <select value={rowDim} onChange={(e) => setRowDim(e.target.value)}>
          {cat?.dimensions.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <span className="x">× sütun</span>
        <select value={colDim} onChange={(e) => setColDim(e.target.value)}>
          <option value="">— yok (tüm ölçüler) —</option>
          {cat?.dimensions.filter((d) => d.id !== rowDim).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <span className="x">· ölçü</span>
        <select value={measure} onChange={(e) => setMeasure(e.target.value)} title={colDim ? "çapraz pivot + grafik ölçüsü" : "grafik ölçüsü"}>
          {cat?.measures.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>

        <span className="mx-div" />

        <span className="x">sprint</span>
        <select value={sprint} onChange={(e) => setSprint(e.target.value)}>
          <option value="">tümü</option>
          {opts.sprints.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="x">tür</span>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">tümü</option>
          {opts.types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="x">tarih</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="oluşturma ≥" />
        <span className="x">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="oluşturma ≤" />
        {hasFilter && <button className="mx-clear" onClick={() => { setSprint(""); setType(""); setFrom(""); setTo(""); }}>temizle ✕</button>}

        <span className="mx-grow" />
        <span className="mx-kpi"><i>{busy ? "…" : (colDim ? cx.rowKeys.length : rows.length)}</i> satır</span>
        <span className="mx-kpi"><i className="num">{totalCards.toLocaleString("tr-TR")}</i> kart</span>
      </div>

      <div className="grid">
        <div className="card col-12">
          <header>
            <h3>{measTitle(measure)}</h3>
            <span className="hint">{dimTitle(rowDim)} bazında · ilk 14{colDim ? ` · (${dimTitle(colDim)} toplamı)` : ""}</span>
          </header>
          <div className="body" style={{ overflowX: "auto" }}><BarChart data={chart} color="var(--amber)" /></div>
        </div>

        {!colDim ? (
          /* ---------------- Tüm-ölçüler pivot ---------------- */
          <div className="card col-12">
            <header>
              <h3>Pivot · {dimTitle(rowDim)}</h3>
              <div className="mx-togs">
                {table.measures.map((m) => (
                  <span key={m.id} className={`mx-tog ${hidden[m.id] ? "off" : ""}`} onClick={() => setHidden((h) => ({ ...h, [m.id]: !h[m.id] }))} title="sütunu göster/gizle">{m.title}</span>
                ))}
              </div>
            </header>
            <div className="body" style={{ overflowX: "auto", padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>{dimTitle(rowDim)}</th>
                    {visMeasures.map((m) => (
                      <th key={m.id} style={{ cursor: "pointer", color: sortBy === m.id ? "var(--amber)" : undefined }} onClick={() => setSortBy(m.id)} title="sırala">
                        {m.title}{sortBy === m.id ? " ▾" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={String(r.group)}>
                      <td className="k mx-rowh" onClick={() => openDrill({ title: `${r.group} · tüm kartlar`, group: String(r.group) })} title="tüm kartları gör">{String(r.group)}</td>
                      {visMeasures.map((m) => {
                        const v = Number(r[m.id] ?? 0);
                        return (
                          <td key={m.id} className="mx-cell" style={{ background: heat(v, range[m.id]?.min ?? 0, range[m.id]?.max ?? 1, bw(m.id)) }}
                              onClick={() => openDrill({ title: `${r.group} · ${m.title}`, group: String(r.group), measure: m.id })} title="kartları gör">
                            <span className="num">{r[m.id] ?? "—"}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {!rows.length && <tr><td className="empty" colSpan={visMeasures.length + 1}>{busy ? "yükleniyor…" : "veri yok"}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ---------------- Çapraz pivot matrisi ---------------- */
          <div className="card col-12">
            <header>
              <h3>Çapraz · {dimTitle(rowDim)} × {dimTitle(colDim)}</h3>
              <span className="hint">ölçü: {measTitle(measure)} · ısı = {bw(measure) === "higher" ? "çok=iyi" : bw(measure) === "lower" ? "az=iyi" : "yoğunluk"}</span>
            </header>
            <div className="body" style={{ overflowX: "auto", padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>{dimTitle(rowDim)} ╲ {dimTitle(colDim)}</th>
                    {cx.colKeys.map((c) => <th key={c} style={{ textAlign: "right" }}>{c}</th>)}
                    <th style={{ textAlign: "right", color: "var(--amber)" }}>Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {cx.rowKeys.map((rk) => (
                    <tr key={rk}>
                      <td className="k">{rk}</td>
                      {cx.colKeys.map((ck) => {
                        const v = cx.cell.get(`${rk}\u0000${ck}`) ?? 0;
                        return (
                          <td key={ck} className="mx-cell" style={{ textAlign: "right", background: heat(v, cx.min, cx.max, bw(measure)) }}
                              onClick={() => v && openDrill({ title: `${rk} · ${ck} · ${measTitle(measure)}`, group: rk, measure, colGroup: ck })} title="kartları gör">
                            <span className="num">{v || "·"}</span>
                          </td>
                        );
                      })}
                      <td className="num" style={{ textAlign: "right", color: "var(--amber)", fontWeight: 600 }}>{cx.rowTot.get(rk) ?? 0}</td>
                    </tr>
                  ))}
                  <tr className="mx-foot">
                    <td className="k">Σ</td>
                    {cx.colKeys.map((ck) => <td key={ck} className="num" style={{ textAlign: "right" }}>{cx.colTot.get(ck) ?? 0}</td>)}
                    <td className="num" style={{ textAlign: "right", color: "var(--amber)", fontWeight: 700 }}>{totalCards}</td>
                  </tr>
                  {!cx.rowKeys.length && <tr><td className="empty" colSpan={cx.colKeys.length + 2}>{busy ? "yükleniyor…" : "veri yok"}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {drill && (
          <div className="card col-12">
            <header>
              <h3>Kartlar · {drill.title}</h3>
              <span className="hint">{drill.loading ? "yükleniyor…" : `${drill.items.length} kart`} <button className="card-exp" onClick={() => setDrill(null)} title="kapat">✕</button></span>
            </header>
            <div className="body" style={{ overflowX: "auto", padding: 0, maxHeight: 360 }}>
              <table>
                <thead>
                  <tr><th>Key</th><th>Tür</th><th>Özet</th><th>Durum</th><th>Atanan</th></tr>
                </thead>
                <tbody>
                  {drill.items.map((it) => (
                    <tr key={it.key}>
                      <td className="k">{jiraUrl(it.key) ? <a className="jkey" href={jiraUrl(it.key)} target="_blank" rel="noreferrer">{it.key} ↗</a> : it.key}</td>
                      <td>{it.type}</td>
                      <td style={{ fontFamily: "var(--body)", color: "var(--bone)", whiteSpace: "normal", maxWidth: 520 }}>{it.summary}</td>
                      <td><span className={`pill ${catPill(it.category)}`}>{it.status}</span></td>
                      <td>{it.assignee ?? "—"}</td>
                    </tr>
                  ))}
                  {!drill.loading && !drill.items.length && <tr><td className="empty" colSpan={5}>kart yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

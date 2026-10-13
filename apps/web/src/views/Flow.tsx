import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Workspace } from "../components/Workspace";
import { TimeChart, type SeriesDef } from "../components/TimeChart";

const SERIES: SeriesDef[] = [
  { id: "cumCreated", label: "Açılan (küm.)", color: "#5a6b8c", axis: "L", kind: "area" },
  { id: "cumDone", label: "Tamamlanan (küm.)", color: "#57c98a", axis: "L", kind: "area" },
  { id: "wip", label: "WIP (açık)", color: "#f3a82b", axis: "L", kind: "line" },
  { id: "done", label: "Throughput", color: "#5fb4a8", axis: "R", kind: "line", unit: "" },
  { id: "cycP50", label: "Cycle p50", color: "#d98cff", axis: "R", kind: "line", unit: "g" },
  { id: "cycP85", label: "Cycle p85", color: "#ff6b85", axis: "R", kind: "line", unit: "g" },
  { id: "leadP50", label: "Lead p50", color: "#8a93a6", axis: "R", kind: "line", unit: "g" },
  { id: "bugRatio", label: "Bug oranı", color: "#ffc54d", axis: "R", kind: "line", unit: "%" },
];
const BUCKETS: { id: "week" | "month" | "sprint"; label: string }[] = [
  { id: "week", label: "Hafta" }, { id: "sprint", label: "Sprint" }, { id: "month", label: "Ay" },
];

export function Flow({ project }: { project: string }) {
  const [bucket, setBucket] = useState<"week" | "month" | "sprint">("week");
  const [data, setData] = useState<any[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({ cumCreated: true, cumDone: true, wip: true, cycP85: true });

  useEffect(() => { api.flowSeries(project, bucket).then(setData); }, [project, bucket]);

  const last = data[data.length - 1];
  const toggle = (id: string) => setVisible((v) => ({ ...v, [id]: !v[id] }));

  const summary = useMemo(() => {
    const done = data.reduce((s, r) => s + (r.done || 0), 0);
    const cyc = data.map((r) => r.cycP85).filter((x) => x != null);
    return { done, lastWip: last?.wip ?? 0, cyc85: cyc.length ? cyc[cyc.length - 1] : "—" };
  }, [data, last]);

  return (
    <Workspace
      toolbar={
        <>
          <div className="wt-title">Flow</div>
          <span className="eyebrow" style={{ marginRight: 4 }}>dönem</span>
          {BUCKETS.map((b) => (
            <button key={b.id} className={`wt ${bucket === b.id ? "on" : ""}`} onClick={() => setBucket(b.id)}>{b.label}</button>
          ))}
          <span className="sep" />
          <span className="eyebrow">sürükle = kaydır · tekerlek = zoom · üstüne gel = değer</span>
          <span className="grow" />
        </>
      }
      rail={<><button className="on" title="Crosshair">✛</button><span className="spring" /><button title="Ayarlar">⚙</button></>}
      inspector={
        <>
          <div className="insp-sec">
            <h4>Seriler — Sol eksen (adet)</h4>
            {SERIES.filter((s) => s.axis === "L").map((s) => (
              <div className="insp-row" key={s.id} style={{ cursor: "pointer", opacity: visible[s.id] ? 1 : 0.45 }} onClick={() => toggle(s.id)}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: s.color, marginRight: 7, borderRadius: s.kind === "area" ? 2 : 6 }} />{s.label}</span>
                <b>{last ? last[s.id] : "—"}</b>
              </div>
            ))}
          </div>
          <div className="insp-sec">
            <h4>Seriler — Sağ eksen (gün/%)</h4>
            {SERIES.filter((s) => s.axis === "R").map((s) => (
              <div className="insp-row" key={s.id} style={{ cursor: "pointer", opacity: visible[s.id] ? 1 : 0.45 }} onClick={() => toggle(s.id)}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: s.color, marginRight: 7, borderRadius: 6 }} />{s.label}{s.unit ? ` (${s.unit})` : ""}</span>
                <b>{last ? (last[s.id] ?? "—") : "—"}</b>
              </div>
            ))}
          </div>
          <div className="insp-sec">
            <h4>Özet</h4>
            <div className="insp-row"><span>Toplam teslim</span><b className="num">{summary.done}</b></div>
            <div className="insp-row"><span>Güncel WIP</span><b className="num">{summary.lastWip}</b></div>
            <div className="insp-row"><span>Son Cycle p85</span><b className="num">{summary.cyc85}g</b></div>
          </div>
        </>
      }
      status={
        <>
          <div className="st">PRJ <b>{project}</b></div>
          <div className="st">dönem <b>{BUCKETS.find((b) => b.id === bucket)?.label}</b></div>
          <div className="st">nokta <b className="num">{data.length}</b></div>
          <div className="st grow" />
          <div className="st">sol: adet · sağ: gün/%</div>
        </>
      }
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <TimeChart data={data} series={SERIES} visible={visible} />
      </div>
    </Workspace>
  );
}

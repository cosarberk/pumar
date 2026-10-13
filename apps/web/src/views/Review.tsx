import { useEffect, useState } from "react";
import { api } from "../api";
import { Workspace } from "../components/Workspace";
import { ForceGraph, type GNode } from "../components/ForceGraph";

export function Review() {
  const [data, setData] = useState<{ nodes: { id: string; kind?: string }[]; links: { source: string; target: string; value: number }[] }>({ nodes: [], links: [] });
  const [load, setLoad] = useState<{ reviewer: string; approvals: string; authors: string }[]>([]);
  const [coord, setCoord] = useState({ x: 0, y: 0 });
  const [frozen, setFrozen] = useState(false);
  const [labels, setLabels] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const [stats, setStats] = useState({ merged: 0, reviewed: 0, unreviewed: 0, reviewedPct: 0, avgApprovers: 0 });

  useEffect(() => { api.reviewGraph().then(setData); api.reviewLoad().then(setLoad); api.reviewStats().then(setStats); }, []);

  const colorOf = (n: GNode) => ((n.deg ?? 0) > 40 ? "#ff5c6c" : (n.deg ?? 0) > 15 ? "#f3a82b" : "#5fb4a8");

  return (
    <Workspace
      toolbar={
        <>
          <div className="wt-title">Review</div>
          <button className="wt" onClick={() => setRestartKey((k) => k + 1)}><span className="g">⟳</span> Restart</button>
          <button className={`wt ${frozen ? "on" : ""}`} onClick={() => setFrozen((f) => !f)}><span className="g">❄</span> {frozen ? "Frozen" : "Freeze"}</button>
          <button className={`wt ${labels ? "on" : ""}`} onClick={() => setLabels((l) => !l)}><span className="g">A</span> Labels</button>
          <span className="grow" />
          <button className="wt"><span className="g">⤓</span> Export</button>
        </>
      }
      rail={<>
        <button className="on" title="Seç/sürükle">⬚</button>
        <button title="Yeniden diz" onClick={() => setRestartKey((k) => k + 1)}>⟳</button>
        <button title="Dondur" onClick={() => setFrozen((f) => !f)}>❄</button>
        <span className="spring" />
        <button title="Ayarlar">⚙</button>
      </>}
      inspector={
        <>
          <div className="insp-sec">
            <h4>Onaylayan yükü</h4>
            {load.length === 0 && <div className="insp-row"><span>veri yok</span></div>}
            {load.map((r) => (
              <div className="insp-row" key={r.reviewer}>
                <span title={r.reviewer}>{r.reviewer.length > 16 ? r.reviewer.slice(0, 15) + "…" : r.reviewer}</span>
                <b className="num" style={{ color: Number(r.approvals) > 100 ? "var(--bad)" : Number(r.approvals) > 40 ? "var(--amber)" : "var(--bone)" }}>{r.approvals}</b>
              </div>
            ))}
          </div>
          <div className="insp-sec">
            <h4>Lejant</h4>
            <div className="insp-legend"><span className="sw" style={{ background: "#5fb4a8", borderColor: "#5fb4a8" }} /> normal</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#f3a82b", borderColor: "#f3a82b" }} /> yoğun onaylayan</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#ff5c6c", borderColor: "#ff5c6c" }} /> aşırı yük (darboğaz)</div>
            <div className="insp-row" style={{ marginTop: 6 }}><span>ok yönü</span><b>yazar → onaylayan</b></div>
          </div>
        </>
      }
      dock={
        <>
          <div className="dock-head">
            <h4>Review istatistikleri</h4>
            <span className="tag">merge {stats.merged}</span>
            <span className={`tag`} style={{ color: stats.reviewedPct < 60 ? "var(--bad)" : "var(--good)" }}>onaylı %{stats.reviewedPct}</span>
            <span className="tag" style={{ color: "var(--bad)" }}>onaysız {stats.unreviewed}</span>
            <span className="tag">ort. onaylayan {stats.avgApprovers}</span>
          </div>
          <table>
            <thead><tr><th>onaylayan</th><th>onay sayısı</th><th>farklı yazar</th></tr></thead>
            <tbody>
              {load.map((r) => (
                <tr key={r.reviewer}>
                  <td style={{ color: "var(--bone)" }}>{r.reviewer}</td>
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
          <div className="st">kişi <b className="num">{data.nodes.length}</b></div>
          <div className="st">bağ <b className="num">{data.links.length}</b></div>
          <div className="st amber">onaysız <b className="num">{stats.unreviewed}</b></div>
          <div className="st">{frozen ? "donduruldu" : "simülasyon aktif"}</div>
          <div className="st grow" />
          <div className="st">x:{coord.x} y:{coord.y}</div>
        </>
      }
    >
      <ForceGraph data={data} colorOf={colorOf} showLabels={labels} frozen={frozen} restartKey={restartKey} directed
        onCoord={(x, y) => setCoord({ x, y })} />
    </Workspace>
  );
}

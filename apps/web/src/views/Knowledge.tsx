import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Workspace } from "../components/Workspace";
import { ForceGraph, type GNode } from "../components/ForceGraph";

export function Knowledge() {
  const [data, setData] = useState<{ nodes: { id: string; kind?: string }[]; links: { source: string; target: string; value: number }[] }>({ nodes: [], links: [] });
  const [coord, setCoord] = useState({ x: 0, y: 0 });
  const [frozen, setFrozen] = useState(false);
  const [labels, setLabels] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const [contrib, setContrib] = useState<{ person: string; repos: string; mrs: string }[]>([]);

  useEffect(() => { api.knowledge().then(setData); api.contributors().then(setContrib); }, []);

  // repo başına tek kişi payı (bus-factor)
  const risk = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of data.nodes) {
      if (n.kind !== "repo") continue;
      const inc = data.links.filter((l) => l.target === n.id);
      const total = inc.reduce((s, l) => s + l.value, 0);
      const top = Math.max(0, ...inc.map((l) => l.value));
      m.set(n.id, total ? top / total : 0);
    }
    return m;
  }, [data]);

  const topRisk = useMemo(() =>
    [...risk.entries()].map(([repo, p]) => ({ repo, pct: Math.round(p * 100) })).sort((a, b) => b.pct - a.pct).slice(0, 6),
    [risk]);

  const colorOf = (n: GNode) => {
    if (n.kind === "person") return "#5fb4a8";
    const r = risk.get(n.id) ?? 0;
    return r > 0.75 ? "#ff5c6c" : r > 0.6 ? "#f3a82b" : "#57c98a";
  };

  return (
    <Workspace
      toolbar={
        <>
          <div className="wt-title">Knowledge</div>
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
            <h4>Lejant</h4>
            <div className="insp-legend"><span className="sw" style={{ background: "#5fb4a8", borderColor: "#5fb4a8" }} /> kişi</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#57c98a", borderColor: "#57c98a" }} /> repo (sağlıklı)</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#f3a82b", borderColor: "#f3a82b" }} /> repo (dikkat)</div>
            <div className="insp-legend"><span className="sw" style={{ background: "#ff5c6c", borderColor: "#ff5c6c" }} /> repo (bus-factor riski)</div>
          </div>
          <div className="insp-sec">
            <h4>En riskli repo'lar</h4>
            {topRisk.map((r) => (
              <div className="insp-row" key={r.repo}>
                <span title={r.repo}>{r.repo.length > 18 ? "…" + r.repo.slice(-17) : r.repo}</span>
                <b className="num" style={{ color: r.pct > 75 ? "var(--bad)" : r.pct > 60 ? "var(--amber)" : "var(--good)" }}>%{r.pct}</b>
              </div>
            ))}
          </div>
        </>
      }
      dock={
        <>
          <div className="dock-head"><h4>Katkıcılar ({contrib.length})</h4></div>
          <table>
            <thead><tr><th>kişi</th><th>dokunduğu repo</th><th>MR</th></tr></thead>
            <tbody>
              {contrib.map((c) => (
                <tr key={c.person}>
                  <td style={{ color: "var(--bone)" }}>{c.person}</td>
                  <td className="num">{c.repos}</td>
                  <td className="num">{c.mrs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      }
      status={
        <>
          <div className="st">düğüm <b className="num">{data.nodes.length}</b></div>
          <div className="st">bağ <b className="num">{data.links.length}</b></div>
          <div className="st">{frozen ? "donduruldu" : "simülasyon aktif"}</div>
          <div className="st grow" />
          <div className="st">x:{coord.x} y:{coord.y}</div>
        </>
      }
    >
      <ForceGraph data={data} colorOf={colorOf} showLabels={labels} frozen={frozen} restartKey={restartKey}
        onCoord={(x, y) => setCoord({ x, y })} />
    </Workspace>
  );
}

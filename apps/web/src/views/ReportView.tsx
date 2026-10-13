import { useEffect, useState } from "react";
import { api, type Catalog } from "../api";
import { ReportCanvas } from "../report/ReportCanvas";
import type { ReportDoc } from "../report/types";

/** Salt-okunur paylaşım görünümü — şablonu canlı veriyle açar (düzenleme yok). */
export function ReportView({ id, project, onExit }: { id: string; project: string; onExit: () => void }) {
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [zoom, setZoom] = useState(0.9);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.config();
    api.catalog().then(setCat);
    api.reportTemplate(id).then((t) => (t ? setDoc(t.config as ReportDoc) : setNotFound(true)));
  }, [id]);

  if (notFound) return <div className="rv-loading">Rapor bulunamadı. <button className="wt" onClick={onExit}>Geri</button></div>;
  if (!doc) return <div className="rv-loading">Rapor yükleniyor…</div>;

  return (
    <div className="rv">
      <div className="rv-bar">
        <span className="mark">PUMAR<i>/</i></span>
        <span className="rv-title">{doc.name}</span>
        <span className="rv-sub">{project}</span>
        <span style={{ flex: 1 }} />
        <button className="wt" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}>−</button>
        <span className="wt-kpi"><b>{Math.round(zoom * 100)}%</b></span>
        <button className="wt" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>+</button>
        <span className="wt-sep" />
        <button className="wt" onClick={() => window.print()}>Yazdır / PDF</button>
        <button className="wt" onClick={onExit}>Kapat</button>
      </div>
      <ReportCanvas doc={doc} filters={{ project }} nonce={0} cat={cat} zoom={zoom} onSelect={() => {}} onBlank={() => {}}
        onZoom={(d) => setZoom((z) => Math.min(2, Math.max(0.3, +(z + d).toFixed(2))))} readOnly />
    </div>
  );
}

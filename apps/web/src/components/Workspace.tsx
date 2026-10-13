import { useState, type ReactNode } from "react";

/**
 * Tam ekran "program" düzeni — boyutlandırılabilir + aç/kapa panellerle.
 * Üst toolbar (+ panel toggle'ları) · sol rail · merkez viewport · sağ inspector
 * (sürükle-boyutlandır) · alt dock (sürükle-boyutlandır) · status bar.
 */
export function Workspace(props: {
  toolbar: ReactNode;
  rail?: ReactNode;
  inspector?: ReactNode;
  dock?: ReactNode;
  status: ReactNode;
  children: ReactNode;
}) {
  const [railOpen, setRailOpen] = useState(true);
  const [inspOpen, setInspOpen] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);
  const [inspW, setInspW] = useState(248);
  const [dockH, setDockH] = useState(192);

  const dragX = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX, sw = inspW;
    const mv = (ev: MouseEvent) => setInspW(Math.min(620, Math.max(180, sw + (sx - ev.clientX))));
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  const dragY = (e: React.MouseEvent) => {
    e.preventDefault();
    const sy = e.clientY, sh = dockH;
    const mv = (ev: MouseEvent) => setDockH(Math.min(460, Math.max(90, sh + (sy - ev.clientY))));
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "row-resize";
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };

  return (
    <div className="ws">
      <div className="ws-toolbar">
        {props.toolbar}
        <div className="ws-toggles">
          {props.rail && <button className={railOpen ? "on" : ""} title="Araç çubuğu" onClick={() => setRailOpen((o) => !o)}>▌</button>}
          {props.inspector && <button className={inspOpen ? "on" : ""} title="Inspector" onClick={() => setInspOpen((o) => !o)}>▐</button>}
          {props.dock && <button className={dockOpen ? "on" : ""} title="Alt panel" onClick={() => setDockOpen((o) => !o)}>▁</button>}
        </div>
      </div>

      <div className="ws-body">
        {props.rail && railOpen && <div className="ws-rail">{props.rail}</div>}
        <div className="ws-viewport">{props.children}</div>
        {props.inspector && inspOpen && (
          <>
            <div className="ws-resize-x" onMouseDown={dragX} title="Sürükle: genişlik" />
            <div className="ws-inspector" style={{ width: inspW }}>{props.inspector}</div>
          </>
        )}
      </div>

      {props.dock && dockOpen && (
        <>
          <div className="ws-resize-y" onMouseDown={dragY} title="Sürükle: yükseklik" />
          <div className="ws-dock" style={{ height: dockH }}>{props.dock}</div>
        </>
      )}

      <div className="ws-status">{props.status}</div>
    </div>
  );
}

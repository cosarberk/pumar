import { useEffect, useState } from "react";
import { ValueStream } from "./views/ValueStream";
import { Universe } from "./views/Universe";
import { Collab } from "./views/Collab";
import { Flow } from "./views/Flow";
import { Sprints } from "./views/Sprints";
import { Risk } from "./views/Risk";
import { MetricExplorer } from "./views/MetricExplorer";
import { Insights } from "./views/Insights";
import { Reports } from "./views/Reports";
import { ReportView } from "./views/ReportView";
import { Settings } from "./views/Settings";
import { ProjectPicker } from "./components/ProjectPicker";
import { api, liveBackend } from "./api";
import { setProject } from "./mock";

type Tab = "stream" | "universe" | "flow" | "sprints" | "risk" | "collab" | "metrics" | "signals" | "reports" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "stream", label: "Stream" },
  { id: "universe", label: "Universe" },
  { id: "flow", label: "Flow" },
  { id: "sprints", label: "Velocity" },
  { id: "risk", label: "Risk" },
  { id: "collab", label: "Collab" },
  { id: "metrics", label: "Metrics" },
  { id: "signals", label: "Signals" },
  { id: "reports", label: "Raporlar" },
  { id: "settings", label: "Ayarlar" },
];
const WORKSPACE: Tab[] = ["stream", "universe", "flow", "collab", "signals", "reports"];

function parseShare() {
  const h = window.location.hash;
  const m = /[#&]rapor=([^&]+)/.exec(h);
  if (!m) return null;
  const p = /[#&]proje=([^&]+)/.exec(h);
  return { id: decodeURIComponent(m[1]), project: p ? decodeURIComponent(p[1]) : "" };
}

export function App() {
  const [share, setShare] = useState(parseShare);
  if (share) return <ReportView id={share.id} project={share.project} onExit={() => { window.location.hash = ""; setShare(null); }} />;
  return <MainApp />;
}

function MainApp() {
  const [project, setProj] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stream");
  const [live, setLive] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => { api.config(); api.catalog().then(() => setLive(liveBackend)); }, []);
  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("tr-TR", { hour12: false }));
    t(); const h = setInterval(t, 1000); return () => clearInterval(h);
  }, []);

  function pick(key: string) { setProject(key); setProj(key); setTab("stream"); }
  function back() { setProject(null); setProj(null); }

  if (!project) return <ProjectPicker onPick={pick} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="seg">
          <span className="mark">PUMAR<i>/</i></span>
          <span className="proj-chip" onClick={back} title="Proje değiştir">◂ {project}</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <div key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </nav>
        <div className="right">
          <div className="seg sync"><span className={`d ${live ? "live" : "mock"}`} />{live ? "CANLI" : "MOCK"}</div>
          <div className="seg clock num">{clock}</div>
        </div>
      </header>

      <main className={`content ${WORKSPACE.includes(tab) ? "flush" : ""}`}>
        {tab === "stream" && <ValueStream project={project} />}
        {tab === "universe" && <Universe project={project} />}
        {tab === "flow" && <Flow project={project} />}
        {tab === "sprints" && <Sprints project={project} />}
        {tab === "risk" && <Risk project={project} />}
        {tab === "collab" && <Collab />}
        {tab === "metrics" && <MetricExplorer project={project} />}
        {tab === "signals" && <Insights project={project} />}
        {tab === "reports" && <Reports project={project} />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}

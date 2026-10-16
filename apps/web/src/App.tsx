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
import { Users } from "./views/Users";
import { ProjectPicker } from "./components/ProjectPicker";
import { Login } from "./views/Login";
import { api, liveBackend, auth, setUnauthorizedHandler, type AuthUser } from "./api";
import { setProject } from "./mock";

type Tab = "stream" | "universe" | "flow" | "sprints" | "risk" | "collab" | "metrics" | "signals" | "reports" | "settings" | "users";
// `admin: true` olanlar yalnız admin rolüne gösterilir.
const TABS: { id: Tab; label: string; admin?: boolean }[] = [
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
  { id: "users", label: "Kullanıcılar", admin: true },
];
const WORKSPACE: Tab[] = ["stream", "universe", "flow", "collab", "signals", "reports"];

function parseShare() {
  const h = window.location.hash;
  const m = /[#&]rapor=([^&]+)/.exec(h);
  if (!m) return null;
  const p = /[#&]proje=([^&]+)/.exec(h);
  return { id: decodeURIComponent(m[1]), project: p ? decodeURIComponent(p[1]) : "" };
}

// "loading" → ilk /auth/me beklenirken; "offline" → backend yok (mock mod, login atlanır);
// AuthUser → oturum açık; null → kimlik doğrulanmamış (login göster).
type Gate = "loading" | "offline" | AuthUser | null;

export function App() {
  const [gate, setGate] = useState<Gate>("loading");

  useEffect(() => {
    let alive = true;
    auth.me().then((r) => {
      if (!alive) return;
      if (r.status === "authenticated") setGate(r.user);
      else if (r.status === "offline") setGate("offline");
      else setGate(null);
    });
    // Oturum kullanım sırasında düşerse login'e dön.
    setUnauthorizedHandler(() => setGate((g) => (g === "offline" ? g : null)));
    return () => { alive = false; setUnauthorizedHandler(null); };
  }, []);

  async function logout() {
    await auth.logout();
    setGate(null);
  }

  if (gate === "loading") return <div className="boot"><span className="mark">PUMAR<i>/</i></span><span className="eyebrow">oturum denetleniyor…</span></div>;
  if (gate === null) return <Login onAuth={(u) => setGate(u)} />;

  const user = gate === "offline" ? null : gate;
  return <Authed user={user} onLogout={logout} />;
}

/** Oturum geçildikten sonra: paylaşılan rapor görünümü veya ana uygulama. */
function Authed({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  const [share, setShare] = useState(parseShare);
  if (share) return <ReportView id={share.id} project={share.project} onExit={() => { window.location.hash = ""; setShare(null); }} />;
  return <MainApp user={user} onLogout={onLogout} />;
}

/** Üst şeritte kullanıcı + çıkış. Offline modda (user yok) gizlenir. */
function AccountChip({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  if (!user) return null;
  return (
    <div className="acct">
      <span className="acct-name" title={`${user.email}${user.role === "admin" ? " · admin" : ""}`}>{user.displayName}</span>
      <button className="acct-out" onClick={onLogout} title="Oturumu kapat">ÇIKIŞ</button>
    </div>
  );
}

function MainApp({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  const [project, setProj] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stream");
  const [live, setLive] = useState(false);
  const [clock, setClock] = useState("");
  const [preSettings, setPreSettings] = useState(false);

  useEffect(() => { api.config(); api.catalog().then(() => setLive(liveBackend)); }, []);
  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("tr-TR", { hour12: false }));
    t(); const h = setInterval(t, 1000); return () => clearInterval(h);
  }, []);

  function pick(key: string) { setProject(key); setProj(key); setTab("stream"); }
  function back() { setProject(null); setProj(null); }

  if (!project) {
    // Proje seçilmeden önce Ayarlar'a erişim — taze kurulumda (hiç proje yokken)
    // Jira/GitLab bağlanıp ilk senkronizasyonu başlatabilmek için şart.
    if (preSettings)
      return (
        <div className="app">
          <header className="topbar">
            <div className="seg">
              <span className="mark">PUMAR<i>/</i></span>
              <span className="proj-chip" onClick={() => setPreSettings(false)} title="Proje seçimine dön">◂ Proje seç</span>
            </div>
            <nav className="tabs"><div className="tab on">Ayarlar</div></nav>
            <div className="right">
              <div className="seg sync"><span className={`d ${live ? "live" : "mock"}`} />{live ? "CANLI" : "MOCK"}</div>
              <div className="seg clock num">{clock}</div>
              <AccountChip user={user} onLogout={onLogout} />
            </div>
          </header>
          <main className="content"><Settings /></main>
        </div>
      );
    return <ProjectPicker onPick={pick} onSettings={() => setPreSettings(true)} user={user} onLogout={onLogout} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="seg">
          <span className="mark">PUMAR<i>/</i></span>
          <span className="proj-chip" onClick={back} title="Proje değiştir">◂ {project}</span>
        </div>
        <nav className="tabs">
          {TABS.filter((t) => !t.admin || user?.role === "admin").map((t) => (
            <div key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </nav>
        <div className="right">
          <div className="seg sync"><span className={`d ${live ? "live" : "mock"}`} />{live ? "CANLI" : "MOCK"}</div>
          <div className="seg clock num">{clock}</div>
          <AccountChip user={user} onLogout={onLogout} />
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
        {tab === "users" && user?.role === "admin" && <Users me={user} />}
      </main>
    </div>
  );
}

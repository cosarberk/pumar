import { useEffect, useState } from "react";
import { api, type SettingsView, type SyncStatus, type SyncMode } from "../api";

type TestState = { ok: boolean; detail: string } | "loading" | undefined;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("tr-TR") : "—");

export function Settings() {
  const [v, setV] = useState<SettingsView | null>(null);
  const [jb, setJb] = useState(""); const [je, setJe] = useState(""); const [jm, setJm] = useState("bearer"); const [jt, setJt] = useState("");
  const [gb, setGb] = useState(""); const [gt, setGt] = useState("");
  const [test, setTest] = useState<{ jira?: TestState; gitlab?: TestState }>({});
  const [saved, setSaved] = useState<string>("");
  const [sync, setSync] = useState<SyncStatus | null>(null);

  useEffect(() => { api.syncStatus().then(setSync); }, []);
  useEffect(() => {
    if (!sync?.running) return;
    const t = setInterval(async () => setSync(await api.syncStatus()), 2500);
    return () => clearInterval(t);
  }, [sync?.running]);
  async function runSync(mode: SyncMode) {
    const r = await api.startSync(mode);
    if (r.running) setSync(await api.syncStatus());
  }

  function apply(s: SettingsView | null) {
    setV(s);
    if (s) { setJb(s.jiraBase); setJe(s.jiraEmail); setJm(s.jiraAuthMode || "bearer"); setGb(s.gitlabBase); }
  }
  useEffect(() => { api.settings().then(apply); }, []);

  async function saveJira() {
    const s = await api.saveSettings({ jiraBase: jb, jiraEmail: je, jiraAuthMode: jm, jiraToken: jt });
    apply(s); setJt(""); setSaved("jira"); setTimeout(() => setSaved(""), 2000);
  }
  async function saveGitlab() {
    const s = await api.saveSettings({ gitlabBase: gb, gitlabToken: gt });
    apply(s); setGt(""); setSaved("gitlab"); setTimeout(() => setSaved(""), 2000);
  }
  async function testOnly(service: "jira" | "gitlab") {
    setTest((t) => ({ ...t, [service]: "loading" }));
    const r = await api.testConnection(service);
    setTest((t) => ({ ...t, [service]: r }));
  }
  async function connect(service: "jira" | "gitlab") {
    if (service === "jira") await api.saveSettings({ jiraBase: jb, jiraEmail: je, jiraAuthMode: jm, jiraToken: jt });
    else await api.saveSettings({ gitlabBase: gb, gitlabToken: gt });
    if (service === "jira") setJt(""); else setGt("");
    apply(await api.settings());
    setTest((t) => ({ ...t, [service]: "loading" }));
    const r = await api.testConnection(service);
    setTest((t) => ({ ...t, [service]: r }));
  }

  const badge = (src?: string) => <span className={`set-badge ${src === "db" ? "db" : "env"}`}>{src === "db" ? "DB" : "ENV"}</span>;
  const result = (t: TestState) => t === "loading" ? <span className="set-msg">test ediliyor…</span>
    : t ? <span className={`set-msg ${t.ok ? "ok" : "bad"}`}>{t.ok ? "✓ " : "✕ "}{t.detail}</span> : null;

  return (
    <>
      <div className="vhead">
        <h2>Ayarlar</h2>
        <p>Jira ve GitLab bağlantıları. Değerler <b>veritabanında</b> tutulur; boşsa <b>.env</b>'den gelir. Token'lar yalnızca sunucuda saklanır, geri gösterilmez.</p>
      </div>

      <div className="grid">
        {/* JIRA */}
        <div className="card col-6">
          <header><h3>Jira {badge(v?.jiraSource)}</h3><span className="hint">self-hosted</span></header>
          <div className="body set-body">
            <label className="set-row"><span>Base URL</span><input className="set-in" value={jb} onChange={(e) => setJb(e.target.value)} placeholder="https://jira.ornek.com" /></label>
            <label className="set-row"><span>Kullanıcı / e-posta</span><input className="set-in" value={je} onChange={(e) => setJe(e.target.value)} placeholder="kullanıcı adı" /></label>
            <label className="set-row"><span>Kimlik modu</span>
              <select className="set-in" value={jm} onChange={(e) => setJm(e.target.value)}>
                <option value="bearer">Bearer (PAT)</option>
                <option value="basic">Basic (e-posta + token)</option>
              </select>
            </label>
            <label className="set-row"><span>Token</span><input className="set-in" type="password" value={jt} onChange={(e) => setJt(e.target.value)} placeholder={v?.jiraTokenSet ? "•••••• (ayarlı — değiştirmek için gir)" : "token gir"} /></label>
            <div className="set-actions">
              <button className="set-primary" onClick={() => connect("jira")}>Jira'ya bağlan</button>
              <button onClick={saveJira}>Kaydet</button>
              <button onClick={() => testOnly("jira")}>Test et</button>
              {saved === "jira" && <span className="set-msg ok">kaydedildi ✓</span>}
              {result(test.jira)}
            </div>
          </div>
        </div>

        {/* GITLAB */}
        <div className="card col-6">
          <header><h3>GitLab {badge(v?.gitlabSource)}</h3><span className="hint">self-hosted</span></header>
          <div className="body set-body">
            <label className="set-row"><span>Base URL</span><input className="set-in" value={gb} onChange={(e) => setGb(e.target.value)} placeholder="https://gitlab.ornek.com" /></label>
            <label className="set-row"><span>Token</span><input className="set-in" type="password" value={gt} onChange={(e) => setGt(e.target.value)} placeholder={v?.gitlabTokenSet ? "•••••• (ayarlı — değiştirmek için gir)" : "glpat-… (api scope)"} /></label>
            <div className="set-hint2">Personal/Project Access Token · <span className="dim">api</span> yetkisi gerekli.</div>
            <div className="set-actions">
              <button className="set-primary" onClick={() => connect("gitlab")}>GitLab'a bağlan</button>
              <button onClick={saveGitlab}>Kaydet</button>
              <button onClick={() => testOnly("gitlab")}>Test et</button>
              {saved === "gitlab" && <span className="set-msg ok">kaydedildi ✓</span>}
              {result(test.gitlab)}
            </div>
          </div>
        </div>

        {/* VERİ SENKRONİZASYONU */}
        <div className="card col-12">
          <header><h3>Veri senkronizasyonu</h3><span className="hint">Jira + GitLab → DB</span></header>
          <div className="body set-body">
            <div className="set-actions">
              <button className="set-primary" disabled={!!sync?.running} onClick={() => runSync("all")}>
                {sync?.running ? "Senkronize ediliyor…" : "Güncel veri çek"}
              </button>
              <button disabled={!!sync?.running} onClick={() => runSync("jira")}>Yalnız Jira</button>
              <button disabled={!!sync?.running} onClick={() => runSync("gitlab")}>Yalnız GitLab</button>
              {sync?.running && <span className="set-msg">⟳ {sync.mode} çekiliyor… (birkaç dk sürebilir)</span>}
              {!sync?.running && sync?.ok === true && <span className="set-msg ok">✓ {sync.message}</span>}
              {!sync?.running && sync?.ok === false && <span className="set-msg bad">✕ {sync.message}</span>}
            </div>
            <table className="set-sync-tbl">
              <thead><tr><th>Kaynak</th><th>Son çekim</th><th>Durum</th></tr></thead>
              <tbody>
                {(sync?.sources ?? []).map((s) => (
                  <tr key={`${s.source}-${s.entity}`}>
                    <td>{s.source} · {s.entity}</td>
                    <td>{fmtDate(s.last_run_at)}</td>
                    <td>{s.status ?? "—"}{s.message ? ` · ${s.message}` : ""}</td>
                  </tr>
                ))}
                {!(sync?.sources ?? []).length && <tr><td colSpan={3} className="dim">henüz senkron kaydı yok</td></tr>}
              </tbody>
            </table>
            <div className="set-hint2">Otomatik zamanlama <b>yok</b> — veri yalnızca burada "Güncel veri çek" dediğinde güncellenir. İlk/tam çekim birkaç dakika sürebilir; bu sırada açık raporlar eski veriyle görünür.</div>
          </div>
        </div>

        <div className="card col-12">
          <header><h3>Nasıl çalışır</h3></header>
          <div className="body" style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
            <b style={{ color: "var(--bone)" }}>Base URL</b> buradan girilir → uygulamadaki tüm <span className="dim">key/repo</span> linkleri (Stream, Metrics, Signals, Universe) bu adresi kullanır (DB &gt; env).
            <br /><b style={{ color: "var(--bone)" }}>Bağlan</b> = girdiğin bilgileri kaydeder ve <span className="dim">canlı</span> olarak Jira <span className="dim">/myself</span> · GitLab <span className="dim">/user</span> uçlarına bağlanmayı dener.
            <br />Token'lar DB'de saklanır, API'ye geri dönmez (yalnızca "ayarlı mı" bilgisi gösterilir).
          </div>
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { api, type Project, type AuthUser } from "../api";
import { sparkFor } from "../mock";

/** Giriş ekranı: proje seçimi — Netflix profil seçer gibi büyük monogram tile'lar. */
export function ProjectPicker({ onPick, onSettings, user, onLogout }: {
  onPick: (key: string) => void;
  onSettings: () => void;
  user?: AuthUser | null;
  onLogout?: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.projects().then((p) => { setProjects(p); setLoading(false); }); }, []);

  const now = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  const empty = !loading && projects.length === 0;

  return (
    <div className="picker">
      <div className="picker-top">
        <div className="mark">PUMAR<i>/</i>OPS</div>
        <div className="picker-top-r">
          <div className="eyebrow">RELTECO · {now}</div>
          <button className="picker-set" onClick={onSettings} title="Jira/GitLab bağlantıları & veri senkronizasyonu">⚙ Ayarlar</button>
          {user && onLogout && (
            <div className="acct">
              <span className="acct-name" title={`${user.email}${user.role === "admin" ? " · admin" : ""}`}>{user.displayName}</span>
              <button className="acct-out" onClick={onLogout} title="Oturumu kapat">ÇIKIŞ</button>
            </div>
          )}
        </div>
      </div>

      <div>
        <h1>Proje Seç<small>{loading ? "projeler yükleniyor…" : empty ? "henüz proje yok — önce bağlantıları kur" : "konsola girmek için bir proje seç"}</small></h1>
      </div>

      {empty ? (
        <div className="picker-empty">
          <p>Görüntülenecek proje yok. Jira/GitLab bağlantılarını kur ve ilk senkronizasyonu başlat; veri geldikçe projeler burada belirir.</p>
          <button className="picker-cta" onClick={onSettings}>Ayarlar → Bağlantıları kur &amp; veri çek</button>
        </div>
      ) : (
      <div className="tiles">
        {projects.map((p) => (
          <div key={p.key} className="tile" onClick={() => onPick(p.key)}
               role="button" tabIndex={0}
               onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(p.key)}>
            <span className="corner tl" /><span className="corner tr" />
            <span className="corner bl" /><span className="corner br" />

            <div className="mono-id">PRJ-{p.key}</div>
            <div className="glyph">{p.key}</div>

            <Spark data={sparkFor(p.key)} />

            <div className="stats">
              <div><b className="num">{p.total}</b> <span>iş</span></div>
              <div><b className="num">{p.wip}</b> <span>WIP</span></div>
              <div><b className="num">{p.people}</b> <span>kişi</span></div>
              <div><b className="num">%{p.bugRatio}</b> <span>bug</span></div>
            </div>
            <div className="enter">GİR →</div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function Spark({ data }: { data: number[] }) {
  const w = 100, h = 20, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / Math.max(1, max - min)) * (h - 3) - 1.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--teal)" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

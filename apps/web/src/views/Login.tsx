import { useState, type FormEvent } from "react";
import { auth, type AuthUser } from "../api";

/** Giriş kapısı — proje seçiminin de önünde. Mevcut "enstrüman paneli" diliyle. */
export function Login({ onAuth }: { onAuth: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const r = await auth.login(email.trim(), password);
    setBusy(false);
    if (r.ok) onAuth(r.user);
    else { setError(r.error); setPassword(""); }
  }

  return (
    <div className="login">
      <div className="login-grid" aria-hidden />
      <form className="login-card" onSubmit={submit}>
        <div className="login-head">
          <div className="mark">PUMAR<i>/</i>OPS</div>
          <div className="eyebrow">RELTECO · {now}</div>
        </div>

        <h1 className="login-title">Oturum Aç<small>devam etmek için kimliğini doğrula</small></h1>

        <label className="login-field">
          <span>E-POSTA</span>
          <input
            type="email" value={email} autoFocus autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ad@relteco.com" required
          />
        </label>

        <label className="login-field">
          <span>ŞİFRE</span>
          <input
            type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" required
          />
        </label>

        {error && <div className="login-error" role="alert">⚠ {error}</div>}

        <button className="login-submit" type="submit" disabled={busy || !email || !password}>
          {busy ? "DOĞRULANIYOR…" : "GİRİŞ →"}
        </button>

        <div className="login-foot eyebrow">Hesabın yok mu? Yöneticine başvur.</div>
      </form>
    </div>
  );
}

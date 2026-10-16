import { useEffect, useState, type FormEvent } from "react";
import { adminApi, type AuthUser, type UserRow } from "../api";

type Msg = { kind: "ok" | "err"; text: string } | null;
type Role = "admin" | "member";

/** Admin paneli: kullanıcı ekle / rol değiştir / devre dışı bırak / şifre sıfırla. */
export function Users({ me }: { me: AuthUser }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  // Ekleme formu
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [pass, setPass] = useState("");

  // Satır içi şifre sıfırlama
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwVal, setPwVal] = useState("");

  async function refresh() {
    setLoading(true);
    setRows(await adminApi.users());
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  function flash(m: Msg) { setMsg(m); if (m) setTimeout(() => setMsg(null), 4000); }

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) { flash({ kind: "ok", text: okText }); await refresh(); }
    else flash({ kind: "err", text: r.error });
    return r.ok;
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => adminApi.create(email.trim(), name.trim(), pass, role), `Eklendi: ${email.trim()}`);
    if (ok) { setEmail(""); setName(""); setPass(""); setRole("member"); }
  }

  async function submitPw(target: string) {
    const ok = await run(() => adminApi.setPassword(target, pwVal), `Şifre güncellendi: ${target}`);
    if (ok) { setPwFor(null); setPwVal(""); }
  }

  return (
    <div className="users">
      <div className="users-head">
        <h2>Kullanıcılar<small>{loading ? "yükleniyor…" : `${rows.length} hesap`}</small></h2>
      </div>

      {msg && <div className={`users-msg ${msg.kind}`} role="alert">{msg.kind === "ok" ? "✓" : "⚠"} {msg.text}</div>}

      <form className="users-add" onSubmit={add}>
        <input type="email" placeholder="e-posta" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        <input type="text" placeholder="görünen ad" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <input type="password" placeholder="şifre (min 8)" value={pass} onChange={(e) => setPass(e.target.value)} required autoComplete="new-password" />
        <button type="submit" disabled={busy || !email || pass.length < 8}>EKLE →</button>
      </form>

      <div className="users-table">
        <div className="usr-row usr-th">
          <span>E-POSTA</span><span>AD</span><span>ROL</span><span>DURUM</span><span>SON GİRİŞ</span><span>İŞLEM</span>
        </div>
        {rows.map((u) => {
          const self = u.id === me.id;
          return (
            <div key={u.id} className={`usr-row ${u.disabled ? "off" : ""}`}>
              <span className="usr-mail" title={u.email}>{u.email}{self && <i className="usr-you"> (sen)</i>}</span>
              <span>{u.displayName}</span>
              <span><span className={`usr-badge ${u.role}`}>{u.role}</span></span>
              <span className={u.disabled ? "usr-off" : "usr-on"}>{u.disabled ? "kapalı" : "aktif"}</span>
              <span className="num">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("tr-TR") : "—"}</span>
              <span className="usr-act">
                {pwFor === u.email ? (
                  <>
                    <input type="password" className="usr-pw" placeholder="yeni şifre" value={pwVal} autoFocus
                           onChange={(e) => setPwVal(e.target.value)} />
                    <button disabled={busy || pwVal.length < 8} onClick={() => submitPw(u.email)}>kaydet</button>
                    <button className="ghost" onClick={() => { setPwFor(null); setPwVal(""); }}>vazgeç</button>
                  </>
                ) : (
                  <>
                    <button disabled={busy || (self && u.role === "admin")}
                            onClick={() => run(() => adminApi.setRole(u.email, u.role === "admin" ? "member" : "admin"),
                                               `Rol: ${u.email} → ${u.role === "admin" ? "member" : "admin"}`)}
                            title={self && u.role === "admin" ? "Kendi admin rolünü düşüremezsin" : "Rolü değiştir"}>
                      {u.role === "admin" ? "member yap" : "admin yap"}
                    </button>
                    <button disabled={busy || (self && !u.disabled)}
                            onClick={() => run(() => adminApi.setDisabled(u.email, !u.disabled),
                                               `${u.email} → ${u.disabled ? "aktif" : "kapalı"}`)}
                            title={self && !u.disabled ? "Kendi hesabını kapatamazsın" : ""}>
                      {u.disabled ? "aktifleştir" : "devre dışı"}
                    </button>
                    <button className="ghost" onClick={() => { setPwFor(u.email); setPwVal(""); }}>şifre</button>
                  </>
                )}
              </span>
            </div>
          );
        })}
        {!loading && rows.length === 0 && <div className="usr-empty">Kullanıcı yok.</div>}
      </div>
    </div>
  );
}

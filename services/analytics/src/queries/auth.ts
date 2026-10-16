/**
 * Kimlik doğrulama: kullanıcılar + sunucu-taraflı oturumlar.
 * Şifreler node:crypto scrypt ile hashlenir (sıfır bağımlılık, native build yok).
 * Oturum token'ı DB'de tutulur → revoke edilebilir; API katmanı httpOnly cookie ile taşır.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { query } from "../db.js";

/** promisify, scrypt'in options'lı overload'ını görmez; options destekleyen async sarmalayıcı. */
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => (err ? reject(err) : resolve(derived)));
  });
}

/** Oturum ömrü (gün). */
export const SESSION_TTL_DAYS = 7;

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N — 2^14, interaktif login için makul
const SCRYPT_BLOCK = 8; // r
const SCRYPT_PAR = 1; // p

export type Role = "admin" | "member";

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  disabled: boolean;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: Role;
  disabled: boolean;
}

const toUser = (r: UserRow): User => ({
  id: Number(r.id),
  email: r.email,
  displayName: r.display_name,
  role: r.role,
  disabled: r.disabled,
});

/** "scrypt$N$r$p$saltB64$hashB64" — kendini tanımlayan, parametreli format. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK,
    p: SCRYPT_PAR,
  })) as Buffer;
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK}$${SCRYPT_PAR}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = (await scrypt(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* ───────── Kullanıcılar ───────── */

/** Yeni kullanıcı oluştur. E-posta çakışırsa hata fırlatır. */
export async function createUser(input: {
  email: string;
  displayName: string;
  password: string;
  role?: Role;
}): Promise<User> {
  const email = input.email.trim();
  if (!email) throw new Error("E-posta boş olamaz");
  if (input.password.length < 8) throw new Error("Şifre en az 8 karakter olmalı");

  const existing = await query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  if (existing.length) throw new Error(`Bu e-posta zaten kayıtlı: ${email}`);

  const passwordHash = await hashPassword(input.password);
  const rows = await query<UserRow>(
    `INSERT INTO users(email, display_name, password_hash, role)
     VALUES($1, $2, $3, $4)
     RETURNING id, email, display_name, password_hash, role, disabled`,
    [email, input.displayName.trim() || email, passwordHash, input.role ?? "member"],
  );
  return toUser(rows[0]);
}

/** Kimlik doğrula. Başarısızsa null (kullanıcı yok / şifre yanlış / devre dışı ayrımı dışarı sızmaz). */
export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const rows = await query<UserRow>(
    `SELECT id, email, display_name, password_hash, role, disabled FROM users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  const row = rows[0];
  if (!row || row.disabled) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  return toUser(row);
}

/** Şifre değiştir; güvenlik gereği kullanıcının tüm oturumlarını düşürür. */
export async function setPassword(email: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error("Şifre en az 8 karakter olmalı");
  const rows = await query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email.trim()]);
  if (!rows.length) throw new Error(`Kullanıcı bulunamadı: ${email}`);
  const passwordHash = await hashPassword(password);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, rows[0].id]);
  await query(`DELETE FROM sessions WHERE user_id = $1`, [rows[0].id]);
}

/** Rol ata (admin|member). */
export async function setRole(email: string, role: Role): Promise<void> {
  const rows = await query<{ id: string }>(`UPDATE users SET role = $1 WHERE lower(email) = lower($2) RETURNING id`, [role, email.trim()]);
  if (!rows.length) throw new Error(`Kullanıcı bulunamadı: ${email}`);
}

/** Hesabı devre dışı bırak / aç. Devre dışı bırakınca oturumları düşürür. */
export async function setDisabled(email: string, disabled: boolean): Promise<void> {
  const rows = await query<{ id: string }>(`UPDATE users SET disabled = $1 WHERE lower(email) = lower($2) RETURNING id`, [disabled, email.trim()]);
  if (!rows.length) throw new Error(`Kullanıcı bulunamadı: ${email}`);
  if (disabled) await query(`DELETE FROM sessions WHERE user_id = $1`, [rows[0].id]);
}

/** CLI / yönetim için kullanıcı listesi (secret'sız). */
export async function listUsers(): Promise<(User & { createdAt: string; lastLoginAt: string | null })[]> {
  const rows = await query<UserRow & { created_at: string; last_login_at: string | null }>(
    `SELECT id, email, display_name, password_hash, role, disabled, created_at, last_login_at
     FROM users ORDER BY created_at`,
  );
  return rows.map((r) => ({ ...toUser(r), createdAt: r.created_at, lastLoginAt: r.last_login_at }));
}

/** En az bir kullanıcı var mı? (Sıfır kullanıcıda açık kurulumu engellemek için.) */
export async function hasAnyUser(): Promise<boolean> {
  const rows = await query<{ n: string }>(`SELECT count(*)::text AS n FROM users`);
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * İlk admin'i env'den oluşturur (k8s'te Helm → Secret → ADMIN_EMAIL/ADMIN_PASSWORD).
 * Yalnızca tablo boşken çalışır; mevcut kurulumlara dokunmaz → idempotent, her açılışta güvenli.
 * Döner: oluşturulan e-posta, atlandıysa null.
 */
export async function bootstrapAdminFromEnv(): Promise<string | null> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) return null; // env verilmemiş → bootstrap kapalı
  if (await hasAnyUser()) return null; // zaten kullanıcı var → dokunma
  const displayName = process.env.ADMIN_NAME?.trim() || email.split("@")[0];
  await createUser({ email, displayName, password, role: "admin" });
  return email;
}

/* ───────── Oturumlar ───────── */

/** Yeni oturum oluştur; token + bitiş zamanını döner. */
export async function createSession(userId: number, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await query(
    `INSERT INTO sessions(token, user_id, expires_at, user_agent) VALUES($1, $2, $3, $4)`,
    [token, userId, expiresAt.toISOString(), userAgent ?? null],
  );
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
  return { token, expiresAt };
}

/** Token'dan oturum sahibini çöz; geçersiz/süresi dolmuş → null. */
export async function getSessionUser(token: string): Promise<User | null> {
  if (!token) return null;
  const rows = await query<UserRow & { expires_at: string }>(
    `SELECT u.id, u.email, u.display_name, u.password_hash, u.role, u.disabled, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.disabled || new Date(row.expires_at).getTime() < Date.now()) {
    await revokeSession(token);
    return null;
  }
  return toUser(row);
}

/** Oturumu kapat (logout). */
export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  await query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

/** Süresi dolmuş oturumları temizle (periyodik bakım / login sırasında çağrılabilir). */
export async function pruneExpiredSessions(): Promise<void> {
  await query(`DELETE FROM sessions WHERE expires_at < now()`);
}

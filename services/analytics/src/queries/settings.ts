/**
 * Dinamik bağlantı ayarları: Jira/GitLab. Öncelik DB > env (env fallback kalır).
 * Secret'lar (token) yalnızca sunucu-içi; UI'ya sadece "set mi" bilgisi gider.
 */
import { query } from "../db.js";

const KEYS = {
  jiraBase: "jira_base_url",
  jiraEmail: "jira_email",
  jiraAuthMode: "jira_auth_mode",
  jiraToken: "jira_token",
  gitlabBase: "gitlab_base_url",
  gitlabToken: "gitlab_token",
} as const;
type Field = keyof typeof KEYS;

async function dbMap(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>(`SELECT key, value FROM settings`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
const env = (k: string) => process.env[k] ?? "";
const trim = (u: string) => u.replace(/\/+$/, "");

/** Son senkronizasyon durumları: kaynak bazında son çalışma zamanı + sonuç. */
export async function syncState() {
  return query<{ source: string; entity: string; last_run_at: string | null; status: string | null; message: string | null }>(
    `SELECT source, entity, last_run_at, status, message FROM sync_state ORDER BY source, entity`,
  );
}

/** Etkin config (secret dahil) — sync/test için. */
export async function effectiveConfig() {
  const d = await dbMap();
  return {
    jiraBase: trim(d[KEYS.jiraBase] ?? env("JIRA_BASE_URL")),
    jiraEmail: d[KEYS.jiraEmail] ?? env("JIRA_EMAIL"),
    jiraAuthMode: d[KEYS.jiraAuthMode] ?? env("JIRA_AUTH_MODE") ?? "bearer",
    jiraToken: d[KEYS.jiraToken] ?? env("JIRA_API_TOKEN"),
    gitlabBase: trim(d[KEYS.gitlabBase] ?? env("GITLAB_BASE_URL")),
    gitlabToken: d[KEYS.gitlabToken] ?? env("GITLAB_TOKEN"),
  };
}

/** UI için — secret yerine sadece "ayarlı mı" + değerin kaynağı (db/env). */
export async function settingsView() {
  const c = await effectiveConfig();
  const d = await dbMap();
  return {
    jiraBase: c.jiraBase, jiraEmail: c.jiraEmail, jiraAuthMode: c.jiraAuthMode,
    gitlabBase: c.gitlabBase,
    jiraTokenSet: !!c.jiraToken, gitlabTokenSet: !!c.gitlabToken,
    jiraSource: d[KEYS.jiraBase] ? "db" : "env",
    gitlabSource: d[KEYS.gitlabBase] ? "db" : "env",
  };
}

/** Kaydet — verilmeyen alanlara dokunma; boş token = değiştirme. */
export async function saveSettings(p: Partial<Record<Field, string>>) {
  for (const [k, col] of Object.entries(KEYS) as [Field, string][]) {
    const v = p[k];
    if (v === undefined) continue;
    if ((k === "jiraToken" || k === "gitlabToken") && v === "") continue;
    await query(
      `INSERT INTO settings(key, value, updated_at) VALUES($1, $2, now())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = now()`,
      [col, v],
    );
  }
  return settingsView();
}

/** Canlı bağlantı testi (girilen/etkin kimlik bilgileriyle). */
export async function testConnection(service: "jira" | "gitlab") {
  const c = await effectiveConfig();
  try {
    if (service === "jira") {
      if (!c.jiraBase || !c.jiraToken) return { ok: false, detail: "Base URL veya token eksik" };
      const headers: Record<string, string> = c.jiraAuthMode === "basic"
        ? { Authorization: "Basic " + Buffer.from(`${c.jiraEmail}:${c.jiraToken}`).toString("base64") }
        : { Authorization: `Bearer ${c.jiraToken}` };
      const r = await fetch(`${c.jiraBase}/rest/api/2/myself`, { headers, signal: AbortSignal.timeout(7000) });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const j: any = await r.json();
      return { ok: true, detail: `Bağlandı: ${j.displayName ?? j.name ?? j.key ?? "?"}` };
    }
    if (!c.gitlabBase || !c.gitlabToken) return { ok: false, detail: "Base URL veya token eksik" };
    const r = await fetch(`${c.gitlabBase}/api/v4/user`, { headers: { "PRIVATE-TOKEN": c.gitlabToken }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j: any = await r.json();
    return { ok: true, detail: `Bağlandı: ${j.username ?? j.name ?? "?"}` };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "bağlantı hatası" };
  }
}

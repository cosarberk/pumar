/**
 * Config kaynakları:
 *  - DATABASE_URL + ISSUE_KEY_REGEX: env (bootstrap/parse — DB'ye bağlanmak için zorunlu).
 *  - Jira/GitLab bağlantıları: ORTAK store (settings: DB > env). Kodda statik yok.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { effectiveConfig } from "@pulse/analytics/settings";

// .env monorepo kökünde; komut hangi dizinden çalışırsa çalışsın oradan yükle.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Eksik ortam değişkeni: ${name}`);
  return v;
}

export const config = {
  databaseUrl: req("DATABASE_URL"),
  // initConfig() ile ortak store'dan doldurulur:
  jira: { baseUrl: "", email: "", apiToken: "", authMode: "bearer" as "bearer" | "basic" },
  gitlab: { baseUrl: "", token: "" },
  /** PROJ-123 yakalama deseni (global flag linking.ts'te eklenir). */
  issueKeyRegex: new RegExp(process.env.ISSUE_KEY_REGEX ?? "[A-Z][A-Z0-9]+-\\d+"),
};

export type Config = typeof config;

/** Jira/GitLab bağlantılarını ortak store'dan (DB > env) yükler. Sync'ten önce çağrılır. */
export async function initConfig() {
  const c = await effectiveConfig();
  config.jira.baseUrl = c.jiraBase;
  config.jira.email = c.jiraEmail;
  config.jira.apiToken = c.jiraToken;
  config.jira.authMode = (c.jiraAuthMode as "bearer" | "basic") || "bearer";
  config.gitlab.baseUrl = c.gitlabBase;
  config.gitlab.token = c.gitlabToken;
  if (!config.jira.baseUrl) throw new Error("Jira base URL yok — Ayarlar ekranından veya .env ile tanımla");
  if (!config.gitlab.baseUrl) throw new Error("GitLab base URL yok — Ayarlar ekranından veya .env ile tanımla");
}

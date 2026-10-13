/**
 * Collector orkestratörü.
 * Sıra önemli: önce Jira (work_item'lar oluşsun), sonra GitLab
 * (commit/MR'lar issue key ile mevcut work_item'lara bağlanabilsin).
 *
 * Kullanım:
 *   pnpm --filter @pumar/collector sync        # tam senkron
 *   pnpm --filter @pumar/collector sync:jira   # yalnız Jira
 *   pnpm --filter @pumar/collector sync:gitlab # yalnız GitLab
 */
import { pool } from "./db.js";
import { initConfig } from "./config.js";
import { syncJira } from "./jira/sync.js";
import { syncGitlab } from "./gitlab/sync.js";
import { syncReviewers } from "./gitlab/reviewers.js";

async function main() {
  const mode = process.argv[2] ?? "all";
  const started = Date.now();
  console.log(`[collector] başladı — mod: ${mode}`);

  try {
    await initConfig(); // Jira/GitLab bağlantılarını ortak store'dan (DB > env) yükle
    if (mode === "all" || mode === "jira") await syncJira();
    if (mode === "all" || mode === "gitlab") await syncGitlab();
    if (mode === "all" || mode === "reviewers") await syncReviewers();
    console.log(`[collector] bitti — ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.error("[collector] HATA:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

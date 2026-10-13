/** GitLab metinlerinden (branch/commit/MR) Jira issue key çıkarımı: PROJ-123. */
import { config } from "./config.js";

const globalKeyRegex = new RegExp(config.issueKeyRegex.source, "gi");

/** İlk eşleşen issue key'i döndürür (büyük harfe normalize). */
export function extractIssueKey(...texts: (string | undefined | null)[]): string | undefined {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(globalKeyRegex);
    if (m && m[0]) return m[0].toUpperCase();
  }
  return undefined;
}

/**
 * Analytics CLI — metric layer'ı komut satırından dener.
 *
 *   pnpm --filter @pumar/analytics metric throughput assignee
 *   pnpm --filter @pumar/analytics metric bug_ratio sprint
 *   pnpm --filter @pumar/analytics insight aging 5
 *   pnpm --filter @pumar/analytics catalog
 */
import { pool } from "./db.js";
import { runMetric } from "./engine.js";
import { catalog } from "./catalog.js";
import {
  agingItems, doneWithoutMr, unlinkedCode, busFactorRisk, reviewBottleneck,
} from "./queries/insights.js";

function table(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return console.log("(sonuç yok)");
  console.table(rows);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === "catalog") {
      console.log(JSON.stringify(catalog(), null, 2));
    } else if (cmd === "metric") {
      const rows = await runMetric({ measure: a, dimension: b });
      table(rows as unknown as Record<string, unknown>[]);
    } else if (cmd === "insight") {
      const map: Record<string, () => Promise<unknown[]>> = {
        aging: () => agingItems(Number(b) || 3),
        done_without_mr: () => doneWithoutMr(),
        unlinked_code: () => unlinkedCode(),
        bus_factor: () => busFactorRisk(),
        review_bottleneck: () => reviewBottleneck(),
      };
      const fn = map[a];
      if (!fn) throw new Error(`Bilinmeyen içgörü: ${a}`);
      table((await fn()) as Record<string, unknown>[]);
    } else {
      console.log("Kullanım: metric <measure> [dimension] | insight <id> [arg] | catalog");
    }
  } catch (e) {
    console.error("HATA:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

/**
 * Pumar API — analytics ve graf verisini web'e açar.
 *   GET  /health
 *   GET  /projects                      → picker için gerçek projeler + istatistik
 *   GET  /catalog                       → metrik/boyut kataloğu
 *   POST /metric      {measure,dimension,filters}
 *   GET  /insight/:id?arg=&project=
 *   GET  /graph/flow?project=
 *   GET  /graph/knowledge
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { runMetric, runCrosstab, runTrend, mrTrend, metricOptions, drillItems } from "@pumar/analytics/engine";
import { catalog } from "@pumar/analytics/catalog";
import {
  agingItems, doneWithoutMr, unlinkedCode, busFactorRisk, reviewBottleneck,
  cycleByStatus, statusTransitions, repoActivity, codeActivitySummary,
} from "@pumar/analytics/insights";
import { projectsList, knowledgeGraph, contributors } from "@pumar/analytics/overview";
import { cfd, cycleTime, velocity, weeklyThroughput, riskRadar, agingDistribution, wipItems, statusFlow, itemsByStatus, streamCards, itemsByTransition, filterOptions, flowSeries } from "@pumar/analytics/flow";
import { reviewerLoad, reviewGraph, reviewStats } from "@pumar/analytics/review";
import { collabBase, collabPerson } from "@pumar/analytics/collab";
import { effectiveConfig, settingsView, saveSettings, testConnection, syncState } from "@pumar/analytics/settings";
import { listTemplates, getTemplate, saveTemplate, deleteTemplate } from "@pumar/analytics/report";
import { roots as universeRoots, expand as universeExpand, search as universeSearch, allGraph as universeAll } from "@pumar/analytics/universe";
import { flowStages } from "./graph.js";
import type { QuerySpec } from "@pumar/analytics/types";

// Depo kökü (collector girişi + web build'i buradan çözülür).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// Prod'da web ve API aynı origin: tarayıcı /api/* çağırır, rotalar kökte durur.
// Bu yüzden yönlendirmeden önce baştaki /api önekini soyarız (dev'de vite
// zaten soyduğu için orada etkisizdir).
const app = Fastify({
  logger: true,
  rewriteUrl: (req) => {
    const u = req.url ?? "/";
    if (u === "/api") return "/";
    return u.startsWith("/api/") ? u.slice(4) : u;
  },
});
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));

app.get("/projects", async () => {
  const rows = await projectsList();
  return rows.map((r) => ({
    key: r.key,
    total: Number(r.total), wip: Number(r.wip), done: Number(r.done),
    people: Number(r.people), bugRatio: Number(r.bug_ratio ?? 0),
  }));
});

app.get("/catalog", async () => catalog());

// Bağlantı yapılandırması — DB > env (link tabanları; secret yok).
app.get("/config", async () => {
  const c = await effectiveConfig();
  return { jiraBase: c.jiraBase, gitlabBase: c.gitlabBase };
});

// Ayarlar ekranı: görüntüle / kaydet / canlı test
app.get("/settings", async () => settingsView());
app.post<{ Body: Record<string, string> }>("/settings", async (req) => saveSettings(req.body ?? {}));
app.post<{ Body: { service: "jira" | "gitlab" } }>("/settings/test", async (req) => testConnection(req.body?.service ?? "jira"));

/* ───────── Veri senkronizasyonu (collector'ı child process olarak tetikler) ───────── */
const SYNC_MODES = ["all", "jira", "gitlab", "reviewers"] as const;
type SyncMode = (typeof SYNC_MODES)[number];
const COLLECTOR_ENTRY = join(ROOT, "services/collector/src/index.ts");
const sync = { running: false, mode: "" as string, startedAt: 0, finishedAt: 0, ok: null as boolean | null, message: "", tail: "" };

function startSync(mode: SyncMode): boolean {
  if (sync.running) return false;
  Object.assign(sync, { running: true, mode, startedAt: Date.now(), finishedAt: 0, ok: null, message: "çalışıyor…", tail: "" });
  const child = spawn("npx", ["tsx", COLLECTOR_ENTRY, mode], { cwd: ROOT, env: process.env });
  const push = (b: Buffer) => { sync.tail = (sync.tail + b.toString()).slice(-2000); };
  child.stdout?.on("data", push);
  child.stderr?.on("data", push);
  child.on("error", (e) => { sync.running = false; sync.finishedAt = Date.now(); sync.ok = false; sync.message = `başlatılamadı: ${e.message}`; });
  child.on("close", (code) => {
    sync.running = false; sync.finishedAt = Date.now(); sync.ok = code === 0;
    sync.message = code === 0 ? "tamamlandı" : `hata (çıkış kodu ${code})`;
  });
  return true;
}

app.post<{ Body: { mode?: string } }>("/sync", async (req, reply) => {
  const mode = (SYNC_MODES as readonly string[]).includes(req.body?.mode ?? "all") ? (req.body?.mode as SyncMode) : "all";
  if (!startSync(mode)) return reply.code(409).send({ running: true, message: "Senkronizasyon zaten çalışıyor." });
  return { running: true, mode };
});

app.get("/sync/status", async () => ({
  running: sync.running,
  mode: sync.mode,
  startedAt: sync.startedAt || null,
  finishedAt: sync.finishedAt || null,
  ok: sync.ok,
  message: sync.message,
  sources: await syncState(),
}));

// Rapor şablonları (konfigürasyon; veri değil)
app.get("/report/templates", async () => listTemplates());
app.get<{ Params: { id: string } }>("/report/templates/:id", async (req) => getTemplate(req.params.id));
app.post<{ Body: { id?: string; name: string; description?: string; config: unknown } }>("/report/templates", async (req) => saveTemplate(req.body));
app.delete<{ Params: { id: string } }>("/report/templates/:id", async (req) => deleteTemplate(req.params.id));

app.post<{ Body: QuerySpec }>("/metric", async (req) => runMetric(req.body));

// Metrics filtrelerini querystring'den QuerySpec.filters'a çevir
type MQ = { project?: string; sprint?: string; type?: string; from?: string; to?: string };
function buildQF(q: MQ) {
  const f: Record<string, string> = {};
  if (q.project) f.projectKey = q.project;
  if (q.sprint) f.sprintKey = q.sprint;
  if (q.type) f.type = q.type;
  if (q.from) f.createdFrom = q.from;
  if (q.to) f.createdTo = q.to;
  return Object.keys(f).length ? (f as any) : undefined;
}

// Pivot: boyut × TÜM ölçüler (Metrics ekranı tablosu)
app.get<{ Querystring: { dimension?: string } & MQ }>("/metric/table", async (req) => {
  const dimension = req.query.dimension ?? "assignee";
  const filters = buildQF(req.query);
  const measures = catalog().measures;
  const map = new Map<string, Record<string, unknown>>();
  for (const m of measures) {
    const rows = await runMetric({ measure: m.id, dimension, filters });
    for (const r of rows) {
      const g = map.get(r.group) ?? { group: r.group };
      g[m.id] = r.value;
      map.set(r.group, g);
    }
  }
  return { measures: measures.map((m) => ({ id: m.id, title: m.title, unit: m.unit })), rows: [...map.values()] };
});

// Çapraz pivot: satır boyutu × sütun boyutu × tek ölçü
app.get<{ Querystring: { row?: string; col?: string; measure?: string } & MQ }>("/metric/crosstab", async (req) =>
  runCrosstab({
    measure: req.query.measure ?? "total",
    rowDim: req.query.row ?? "assignee",
    colDim: req.query.col ?? "type",
    filters: buildQF(req.query),
  }),
);

// Zaman trendi: aylık oluşturulan vs çözülen + biriken backlog
app.get<{ Querystring: MQ }>("/metric/trend", async (req) => runTrend({ filters: buildQF(req.query) }));
app.get("/metric/mr-trend", async () => mrTrend());

// Filtre çubuğu için dolu değerler
app.get<{ Querystring: { project?: string } }>("/metric/options", async (req) => metricOptions(req.query.project));

// Drill-down: bir hücredeki gerçek kartlar
app.get<{ Querystring: { dimension?: string; group?: string; measure?: string; col?: string; colGroup?: string } & MQ }>(
  "/metric/items",
  async (req) =>
    drillItems({
      dimension: req.query.dimension ?? "assignee",
      group: req.query.group ?? "",
      measure: req.query.measure,
      colDimension: req.query.col,
      colGroup: req.query.colGroup,
      filters: buildQF(req.query),
    }),
);

app.get<{ Params: { id: string }; Querystring: { arg?: string; project?: string } }>(
  "/insight/:id",
  async (req, reply) => {
    const { id } = req.params;
    const p = req.query.project;
    const arg = req.query.arg ? Number(req.query.arg) : undefined;
    switch (id) {
      case "aging": return agingItems(arg ?? 3, p);
      case "done_without_mr": return doneWithoutMr(p);
      case "unlinked_code": return unlinkedCode();
      case "bus_factor": return busFactorRisk();
      case "review_bottleneck": return reviewBottleneck();
      case "cycle_by_status": return cycleByStatus(p);
      case "status_transitions": return statusTransitions(p);
      case "repo_activity": return repoActivity();
      case "code_activity": return codeActivitySummary();
      default: return reply.code(404).send({ error: "bilinmeyen içgörü" });
    }
  },
);

app.get<{ Querystring: { project?: string } }>("/graph/flow", async (req) =>
  flowStages(req.query.project),
);

app.get("/graph/knowledge", async () => knowledgeGraph());

// --- Flow analitiği ---
app.get<{ Querystring: { project?: string; bucket?: "week" | "month" | "sprint" } }>("/flow/series", async (req) => flowSeries(req.query.project, req.query.bucket ?? "week"));
app.get<{ Querystring: { project?: string } }>("/flow/cfd", async (req) => cfd(req.query.project));
app.get<{ Querystring: { project?: string } }>("/flow/cycletime", async (req) => cycleTime(req.query.project));
app.get<{ Querystring: { project?: string; assignee?: string; sprint?: string; scope?: "all" | "wip" | "backlog" } }>("/flow/risk", async (req) => riskRadar(req.query.project, { assignee: req.query.assignee, sprint: req.query.sprint, scope: req.query.scope }));
app.get<{ Querystring: { project?: string } }>("/flow/aging", async (req) => agingDistribution(req.query.project));
app.get<{ Querystring: { project?: string } }>("/flow/throughput", async (req) => weeklyThroughput(req.query.project));
app.get<{ Querystring: { project?: string; cat?: string; status?: string; assignee?: string; sprint?: string } }>("/flow/items", async (req) => {
  const f = { assignee: req.query.assignee, sprint: req.query.sprint };
  return req.query.status ? itemsByStatus(req.query.project, req.query.status, f) : wipItems(req.query.project, req.query.cat ?? "in_progress", f);
});
app.get<{ Querystring: { project?: string; from: string; to: string; assignee?: string; sprint?: string } }>("/flow/transition", async (req) =>
  itemsByTransition(req.query.project, req.query.from, req.query.to, { assignee: req.query.assignee, sprint: req.query.sprint }),
);
app.get<{ Querystring: { project?: string; assignee?: string; sprint?: string } }>("/graph/statusflow", async (req) =>
  statusFlow(req.query.project, { assignee: req.query.assignee, sprint: req.query.sprint }),
);
app.get<{ Querystring: { project?: string } }>("/flow/filters", async (req) => filterOptions(req.query.project));
app.get<{ Querystring: { project?: string } }>("/stream/cards", async (req) => streamCards(req.query.project));

// --- Sprint / velocity ---
app.get<{ Querystring: { project?: string } }>("/sprints/velocity", async (req) => {
  const v = await velocity(req.query.project);
  // Sprint linki yoksa haftalık throughput'a düş
  if (v.length === 0) return { mode: "weekly", rows: await weeklyThroughput(req.query.project) };
  return { mode: "sprint", rows: v };
});

// --- Review işbirliği ---
app.get("/review/load", async () => reviewerLoad());
app.get("/review/graph", async () => reviewGraph());
app.get("/review/stats", async () => reviewStats());

app.get("/graph/contributors", async () => contributors());

// --- Collab (Knowledge + Review birleşik) ---
app.get("/graph/collab", async () => collabBase());
app.get<{ Querystring: { name: string } }>("/graph/collab/person", async (req) => collabPerson(req.query.name ?? ""));

// --- Kart Evreni (lazy) ---
app.get<{ Querystring: { project?: string } }>("/universe/roots", async (req) => universeRoots(req.query.project));
app.get<{ Querystring: { project?: string; sprint?: string } }>("/universe/all", async (req) => universeAll(req.query.project, req.query.sprint));
app.get<{ Querystring: { key: string } }>("/universe/expand", async (req) => universeExpand(req.query.key));
app.get<{ Querystring: { project?: string; q: string } }>("/universe/search", async (req) => universeSearch(req.query.project, req.query.q ?? ""));

// Web build'i varsa aynı origin'den serve et (tek image). Dev'de dist yoktur;
// vite kendi sunucusundan servis ettiği için burası atlanır.
const WEB_DIST = process.env.WEB_DIST ?? join(ROOT, "apps/web/dist");
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST });
  // SPA: bilinmeyen GET'ler index.html'e düşer (uygulama hash tabanlı yönlenir);
  // diğer metodlarda düz 404 JSON.
  app.setNotFoundHandler((req, reply) =>
    req.method === "GET" ? reply.sendFile("index.html") : reply.code(404).send({ error: "not found" }),
  );
  app.log.info(`Web dist: ${WEB_DIST}`);
}

const port = Number(process.env.API_PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).then(() => app.log.info(`Pumar API :${port}`));

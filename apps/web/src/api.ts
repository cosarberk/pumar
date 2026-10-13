/**
 * Pulse API istemcisi. Backend varsa gerçek veri; erişilemezse mock'a düşer.
 */
import { mockCatalog, mockMetric, mockInsight, mockKnowledge, mockFlow, projectStats } from "./mock";
import { setLinks } from "./jira";

const BASE = "/api";

export interface CatalogDim { id: string; title: string }
export interface CatalogMeasure { id: string; title: string; unit: string; betterWhen: string }
export interface Catalog { dimensions: CatalogDim[]; measures: CatalogMeasure[]; insights: { id: string; title: string }[] }
export interface MetricRow { group: string; value: number | null }
export interface MetricFilters { project?: string; sprint?: string; type?: string; from?: string; to?: string }
export interface DrillItem { key: string; summary: string; type: string; status: string; category: string | null; assignee: string | null }
export interface TrendPoint { period: string; created: number; resolved: number; backlog: number }
export interface SettingsView {
  jiraBase: string; jiraEmail: string; jiraAuthMode: string; gitlabBase: string;
  jiraTokenSet: boolean; gitlabTokenSet: boolean; jiraSource: string; gitlabSource: string;
}
export interface SettingsInput {
  jiraBase: string; jiraEmail: string; jiraAuthMode: string; jiraToken: string; gitlabBase: string; gitlabToken: string;
}
export type SyncMode = "all" | "jira" | "gitlab" | "reviewers";
export interface SyncSource { source: string; entity: string; last_run_at: string | null; status: string | null; message: string | null }
export interface SyncStatus { running: boolean; mode: string; startedAt: number | null; finishedAt: number | null; ok: boolean | null; message: string; sources: SyncSource[] }
export interface ReportTemplateMeta { id: string; name: string; description: string; updated_at: string }
export interface ReportTemplateFull extends ReportTemplateMeta { config: unknown }
export interface Project { key: string; total: number; wip: number; done: number; people: number; bugRatio: number }
export interface Stage { id: string; label: string; count: number }

export let liveBackend = false;

async function tryFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    liveBackend = true;
    return (await r.json()) as T;
  } catch { return null; }
}

const qp = (p?: string) => (p ? `?project=${encodeURIComponent(p)}` : "");
const qs = (o: Record<string, string | undefined>) =>
  Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");

export const api = {
  async catalog(): Promise<Catalog> {
    return (await tryFetch<Catalog>("/catalog")) ?? (mockCatalog() as Catalog);
  },
  async config(): Promise<{ jiraBase: string; gitlabBase: string }> {
    const c = await tryFetch<{ jiraBase: string; gitlabBase: string }>("/config");
    if (c) setLinks(c);
    return c ?? { jiraBase: "", gitlabBase: "" };
  },
  async settings(): Promise<SettingsView | null> {
    return await tryFetch<SettingsView>("/settings");
  },
  async saveSettings(p: Partial<SettingsInput>): Promise<SettingsView | null> {
    const r = await tryFetch<SettingsView>("/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    await this.config(); // link tabanlarını tazele
    return r;
  },
  async testConnection(service: "jira" | "gitlab"): Promise<{ ok: boolean; detail: string }> {
    return (await tryFetch<{ ok: boolean; detail: string }>("/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service }) })) ?? { ok: false, detail: "API erişilemedi" };
  },
  async startSync(mode: SyncMode = "all"): Promise<{ running: boolean; message?: string }> {
    return (await tryFetch<{ running: boolean; message?: string }>("/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) })) ?? { running: false, message: "API erişilemedi" };
  },
  async syncStatus(): Promise<SyncStatus | null> {
    return await tryFetch<SyncStatus>("/sync/status");
  },
  async reportTemplates(): Promise<ReportTemplateMeta[]> {
    return (await tryFetch<ReportTemplateMeta[]>("/report/templates")) ?? [];
  },
  async reportTemplate(id: string): Promise<ReportTemplateFull | null> {
    return await tryFetch<ReportTemplateFull>(`/report/templates/${id}`);
  },
  async saveReportTemplate(t: { id?: string; name: string; description?: string; config: unknown }): Promise<ReportTemplateFull | null> {
    return await tryFetch<ReportTemplateFull>("/report/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
  },
  async deleteReportTemplate(id: string): Promise<void> {
    await tryFetch(`/report/templates/${id}`, { method: "DELETE" });
  },
  async projects(): Promise<Project[]> {
    const r = await tryFetch<Project[]>("/projects");
    if (r) return r;
    return projectStats().map((p) => ({ key: p.key, total: p.total, wip: p.wip, done: p.done, people: p.people, bugRatio: p.bugRatio }));
  },
  async flow(project?: string): Promise<Stage[]> {
    return (await tryFetch<Stage[]>(`/graph/flow${qp(project)}`)) ?? mockFlow();
  },
  async metric(measure: string, dimension?: string, project?: string): Promise<MetricRow[]> {
    const r = await tryFetch<MetricRow[]>("/metric", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ measure, dimension, filters: project ? { projectKey: project } : undefined }),
    });
    return r ?? mockMetric(measure, dimension);
  },
  async insight(id: string, project?: string, arg?: number): Promise<Record<string, unknown>[]> {
    return (await tryFetch<Record<string, unknown>[]>(`/insight/${id}?${qs({ project, arg: arg != null ? String(arg) : undefined })}`)) ?? mockInsight(id);
  },
  async knowledge() {
    return (await tryFetch<{ nodes: any[]; links: any[] }>("/graph/knowledge")) ?? mockKnowledge();
  },

  // --- Flow analitiği ---
  async flowSeries(project?: string, bucket: "week" | "month" | "sprint" = "week") {
    return (await tryFetch<any[]>(`/flow/series?${qs({ project, bucket })}`)) ?? [];
  },
  async cfd(project?: string) {
    return (await tryFetch<{ week: string; created: number; done: number; wip: number }[]>(`/flow/cfd${qp(project)}`)) ?? [];
  },
  async cycleTime(project?: string) {
    return (await tryFetch<{ count: number; p50: number; p85: number; p95: number; avg: number; buckets: { label: string; count: number }[] }>(`/flow/cycletime${qp(project)}`))
      ?? { count: 0, p50: 0, p85: 0, p95: 0, avg: 0, buckets: [] };
  },
  async risk(project?: string, f: { assignee?: string; sprint?: string; scope?: string } = {}) {
    return (await tryFetch<{ key: string; summary: string; assignee: string | null; type: string; sprint: string | null; kind: string; days: number; impact: number; blocked: number; overdue: boolean; reasons: string[]; score: number; risk: string }[]>(`/flow/risk?${qs({ project, ...f })}`)) ?? [];
  },
  async velocity(project?: string) {
    return (await tryFetch<{ mode: string; rows: any[] }>(`/sprints/velocity${qp(project)}`)) ?? { mode: "sprint", rows: [] };
  },

  async aging(project?: string) {
    return (await tryFetch<{ count: number; buckets: { label: string; count: number }[] }>(`/flow/aging${qp(project)}`)) ?? { count: 0, buckets: [] };
  },
  async throughput(project?: string) {
    return (await tryFetch<{ week: string; done: string }[]>(`/flow/throughput${qp(project)}`)) ?? [];
  },
  async items(project?: string, cat = "in_progress", f: { assignee?: string; sprint?: string } = {}) {
    return (await tryFetch<Record<string, unknown>[]>(`/flow/items?${qs({ project, cat, ...f })}`)) ?? [];
  },
  async itemsByStatus(project: string | undefined, status: string, f: { assignee?: string; sprint?: string } = {}) {
    return (await tryFetch<Record<string, unknown>[]>(`/flow/items?${qs({ project, status, ...f })}`)) ?? [];
  },
  async itemsByTransition(project: string | undefined, from: string, to: string, f: { assignee?: string; sprint?: string } = {}) {
    return (await tryFetch<Record<string, unknown>[]>(`/flow/transition?${qs({ project, from, to, ...f })}`)) ?? [];
  },
  async streamFilters(project?: string) {
    return (await tryFetch<{ assignees: string[]; sprints: string[] }>(`/flow/filters${qp(project)}`)) ?? { assignees: [], sprints: [] };
  },
  async streamCards(project?: string) {
    return (await tryFetch<{ nodes: any[]; edges: any[] }>(`/stream/cards${qp(project)}`)) ?? { nodes: [], edges: [] };
  },
  async statusFlow(project?: string, f: { assignee?: string; sprint?: string } = {}) {
    return (await tryFetch<{ nodes: { status: string; category: string | null; count: number }[]; edges: { from: string; to: string; count: number }[] }>(`/graph/statusflow?${qs({ project, ...f })}`))
      ?? { nodes: [], edges: [] };
  },
  async metricTable(dimension: string, f: MetricFilters = {}) {
    return (await tryFetch<{ measures: { id: string; title: string; unit: string }[]; rows: Record<string, unknown>[] }>(`/metric/table?${qs({ dimension, ...f })}`))
      ?? { measures: [], rows: [] };
  },
  async metricData(measure: string, dimension: string | undefined, f: MetricFilters = {}): Promise<MetricRow[]> {
    const filters: Record<string, string> = {};
    if (f.project) filters.projectKey = f.project;
    if (f.sprint) filters.sprintKey = f.sprint;
    if (f.type) filters.type = f.type;
    if (f.from) filters.createdFrom = f.from;
    if (f.to) filters.createdTo = f.to;
    const r = await tryFetch<MetricRow[]>("/metric", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ measure, dimension, filters: Object.keys(filters).length ? filters : undefined }),
    });
    return r ?? [];
  },
  async metricCrosstab(measure: string, row: string, col: string, f: MetricFilters = {}) {
    return (await tryFetch<{ row: string; col: string; value: number | null }[]>(`/metric/crosstab?${qs({ measure, row, col, ...f })}`)) ?? [];
  },
  async metricOptions(project?: string) {
    return (await tryFetch<{ sprints: string[]; types: string[] }>(`/metric/options${qp(project)}`)) ?? { sprints: [], types: [] };
  },
  async metricTrend(f: MetricFilters = {}): Promise<TrendPoint[]> {
    return (await tryFetch<TrendPoint[]>(`/metric/trend?${qs({ ...f })}`)) ?? [];
  },
  async metricMrTrend(): Promise<TrendPoint[]> {
    return (await tryFetch<TrendPoint[]>(`/metric/mr-trend`)) ?? [];
  },
  async metricItems(p: { dimension: string; group: string; measure?: string; col?: string; colGroup?: string } & MetricFilters) {
    return (await tryFetch<DrillItem[]>(`/metric/items?${qs(p as Record<string, string | undefined>)}`)) ?? [];
  },
  async contributors() {
    return (await tryFetch<{ person: string; repos: string; mrs: string }[]>("/graph/contributors")) ?? [];
  },

  // --- Kart Evreni ---
  async universeRoots(project?: string) {
    return (await tryFetch<{ nodes: any[]; edges: any[] }>(`/universe/roots${qp(project)}`)) ?? { nodes: [], edges: [] };
  },
  async universeExpand(key: string) {
    return (await tryFetch<{ nodes: any[]; edges: any[] }>(`/universe/expand?key=${encodeURIComponent(key)}`)) ?? { nodes: [], edges: [] };
  },
  async universeSearch(project: string | undefined, q: string) {
    return (await tryFetch<{ key: string; summary: string; type: string }[]>(`/universe/search?${qs({ project, q })}`)) ?? [];
  },
  async universeAll(project?: string, sprint?: string) {
    return (await tryFetch<{ nodes: any[]; edges: any[] }>(`/universe/all?${qs({ project, sprint })}`)) ?? { nodes: [], edges: [] };
  },

  // --- Review ---
  async reviewStats() {
    return (await tryFetch<{ merged: number; reviewed: number; unreviewed: number; reviewedPct: number; avgApprovers: number }>("/review/stats"))
      ?? { merged: 0, reviewed: 0, unreviewed: 0, reviewedPct: 0, avgApprovers: 0 };
  },
  async reviewLoad() {
    return (await tryFetch<{ reviewer: string; approvals: string; authors: string }[]>("/review/load")) ?? [];
  },
  async reviewGraph() {
    return (await tryFetch<{ nodes: any[]; links: any[] }>("/review/graph")) ?? { nodes: [], links: [] };
  },

  // --- Collab (Knowledge + Review birleşik graf) ---
  async collab() {
    return (await tryFetch<{ nodes: any[]; links: any[] }>("/graph/collab")) ?? { nodes: [], links: [] };
  },
  async collabPerson(name: string) {
    return (await tryFetch<{ nodes: any[]; links: any[] }>(`/graph/collab/person?name=${encodeURIComponent(name)}`)) ?? { nodes: [], links: [] };
  },
};

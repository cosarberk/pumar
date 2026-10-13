/**
 * Mock veri katmanı — API/collector olmadan da web zengin render etsin diye.
 * Gerçek kurulumda api.ts önce backend'i dener, erişemezse buraya düşer.
 * Gerçek engine mantığını (group-by + measure) tarayıcıda birebir taklit eder.
 */
export const PEOPLE = ["Elif Yılmaz", "Burak Demir", "Ayşe Kaya", "Mert Aydın", "Seda Çelik", "Can Öztürk", "Deniz Ak"];
export const PROJECTS = ["CRM", "PAY", "CORE"];
export const SPRINTS = ["Sprint 18", "Sprint 19", "Sprint 20"];
export const REPOS = ["crm-web", "crm-mobile", "pay-core", "pay-gateway", "core-api", "core-infra"];
const TYPES = ["Story", "Bug", "Task", "Sub-task"];
const CATS = ["todo", "in_progress", "review", "done"] as const;

function pick<T>(a: readonly T[], seed: number): T { return a[seed % a.length]; }

export interface Item {
  key: string; type: string; cat: string; assignee: string;
  project: string; sprint: string; repo: string; lead: number; sp: number; aging: number;
}

// Deterministik üretim (her yüklemede aynı tablo).
export const ITEMS: Item[] = Array.from({ length: 72 }, (_, i) => {
  const r = (i * 9301 + 49297) % 233280;
  const type = r % 100 < 28 ? "Bug" : pick(TYPES, r);
  return {
    key: `${pick(PROJECTS, r)}-${100 + i}`,
    type,
    cat: pick(CATS, r >> 2),
    assignee: pick(PEOPLE, r >> 3),
    project: pick(PROJECTS, r >> 4),
    sprint: pick(SPRINTS, r >> 5),
    repo: pick(REPOS, r >> 6),
    lead: +(1 + (r % 110) / 10).toFixed(1),
    sp: pick([1, 2, 3, 5, 8], r >> 7),
    aging: +((r % 130) / 10).toFixed(1),
  };
});

// --- Seçili proje filtresi (picker → konsol) ---
let _project: string | null = null;
export const setProject = (p: string | null) => { _project = p; };
export const getProject = () => _project;
/** Aktif projenin item'ları (seçilmemişse tümü). */
export const currentItems = (): Item[] => (_project ? ITEMS.filter((i) => i.project === _project) : ITEMS);

/** Picker için proje kartı istatistikleri. */
export function projectStats() {
  return PROJECTS.map((key) => {
    const g = ITEMS.filter((i) => i.project === key);
    const people = new Set(g.map((i) => i.assignee)).size;
    const bugRatio = g.length ? Math.round((100 * g.filter((i) => i.type === "Bug").length) / g.length) : 0;
    // deterministik sparkline (8 nokta)
    const seed = key.charCodeAt(0);
    const spark = Array.from({ length: 8 }, (_, n) => 20 + ((seed * (n + 3) * 7) % 60));
    return {
      key,
      total: g.length,
      wip: g.filter((i) => i.cat === "in_progress").length,
      done: g.filter((i) => i.cat === "done").length,
      people,
      bugRatio,
      spark,
    };
  });
}

const DIM_KEY: Record<string, (i: Item) => string> = {
  assignee: (i) => i.assignee, sprint: (i) => i.sprint,
  project: (i) => i.project, type: (i) => i.type, status: (i) => i.cat,
};
const MEASURE_FN: Record<string, (g: Item[]) => number> = {
  total: (g) => g.length,
  throughput: (g) => g.filter((i) => i.cat === "done").length,
  wip: (g) => g.filter((i) => i.cat === "in_progress").length,
  bug_count: (g) => g.filter((i) => i.type === "Bug").length,
  bug_ratio: (g) => (g.length ? Math.round((100 * g.filter((i) => i.type === "Bug").length) / g.length) : 0),
  avg_lead_days: (g) => (g.length ? +(g.reduce((s, i) => s + i.lead, 0) / g.length).toFixed(1) : 0),
  avg_story_points: (g) => (g.length ? +(g.reduce((s, i) => s + i.sp, 0) / g.length).toFixed(1) : 0),
};

export const mockCatalog = () => ({
  dimensions: [
    { id: "assignee", title: "Kişi" }, { id: "sprint", title: "Sprint" },
    { id: "project", title: "Proje" }, { id: "type", title: "Tür" }, { id: "status", title: "Durum" },
  ],
  measures: [
    { id: "throughput", title: "Teslim (Done)", unit: "adet", betterWhen: "higher" },
    { id: "wip", title: "WIP (In Progress)", unit: "adet", betterWhen: "lower" },
    { id: "total", title: "Toplam iş", unit: "adet", betterWhen: "neutral" },
    { id: "bug_ratio", title: "Bug/İş oranı", unit: "%", betterWhen: "lower" },
    { id: "bug_count", title: "Bug sayısı", unit: "adet", betterWhen: "lower" },
    { id: "avg_lead_days", title: "Ort. lead time", unit: "gün", betterWhen: "lower" },
    { id: "avg_story_points", title: "Ort. story point", unit: "sp", betterWhen: "neutral" },
  ],
  insights: [],
});

export function mockMetric(measure: string, dimension?: string) {
  const dk = dimension ? DIM_KEY[dimension] : () => "Toplam";
  const mf = MEASURE_FN[measure] ?? MEASURE_FN.total;
  const groups: Record<string, Item[]> = {};
  for (const i of currentItems()) { const k = dk(i); (groups[k] = groups[k] || []).push(i); }
  return Object.entries(groups).map(([group, g]) => ({ group, value: mf(g) })).sort((a, b) => b.value - a.value);
}

export function mockInsight(id: string): Record<string, unknown>[] {
  if (id === "aging")
    return currentItems().filter((i) => i.cat === "in_progress")
      .map((i) => ({ key: i.key, özet: `${i.type} · ${i.project}`, kişi: i.assignee, days: i.aging }))
      .sort((a, b) => (b.days as number) - (a.days as number)).slice(0, 12);
  if (id === "done_without_mr")
    return currentItems().filter((i) => i.cat === "done").slice(0, 7)
      .map((i) => ({ key: i.key, kişi: i.assignee, durum: "merge eksik" }));
  if (id === "bus_factor")
    return REPOS.map((repo, n) => ({ repo, "tek_kişi_payı": [82, 68, 76, 41, 90, 55][n], commit: [340, 210, 512, 880, 150, 420][n] }))
      .sort((a, b) => (b["tek_kişi_payı"] as number) - (a["tek_kişi_payı"] as number));
  if (id === "review_bottleneck")
    return REPOS.slice(0, 4).map((repo, n) => ({ repo, ilk_review: [2.8, 1.1, 3.9, 0.6][n], merge_days: [5.4, 2.2, 7.1, 1.4][n], merged: [22, 41, 13, 60][n] }));
  return [];
}

/** Deterministik sparkline (8 nokta) — picker kartları için. */
export function sparkFor(key: string): number[] {
  const seed = key.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return Array.from({ length: 8 }, (_, n) => 20 + ((seed * (n + 3) * 7) % 60));
}

/** Akış aşamaları (mock fallback). */
export function mockFlow() {
  const g = currentItems();
  const cats = [
    { id: "todo", label: "To Do" },
    { id: "in_progress", label: "In Progress" },
    { id: "review", label: "Review" },
    { id: "done", label: "Done" },
  ];
  return cats.map((c) => ({ ...c, count: g.filter((i) => i.cat === c.id).length }));
}

/** Knowledge graph: kişi ↔ repo katkı bağları (force-directed). */
export function mockKnowledge() {
  const nodes = [
    ...PEOPLE.map((id) => ({ id, kind: "person" as const })),
    ...REPOS.map((id) => ({ id, kind: "repo" as const })),
  ];
  const links: { source: string; target: string; value: number }[] = [];
  currentItems().forEach((i) => {
    const ex = links.find((l) => l.source === i.assignee && l.target === i.repo);
    if (ex) ex.value++; else links.push({ source: i.assignee, target: i.repo, value: 1 });
  });
  return { nodes, links };
}

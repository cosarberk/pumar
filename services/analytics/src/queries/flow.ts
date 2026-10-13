/** Akış analitiği: CFD, cycle time dağılımı, velocity, risk radarı. */
import { query } from "../db.js";

function projFilter(projectKey: string | undefined, params: unknown[], col = "w.project_id"): string {
  if (!projectKey) return "";
  params.push(projectKey);
  return `AND ${col} = (SELECT id FROM jira_projects WHERE key = $${params.length})`;
}

/** Cumulative Flow: haftalık kümülatif oluşturulan vs tamamlanan (WIP = fark). */
export async function cfd(projectKey?: string) {
  const params: unknown[] = [];
  const pf = projFilter(projectKey, params);
  const rows = await query<{ week: string; created: string; done: string }>(
    `WITH base AS (SELECT * FROM work_items w WHERE 1=1 ${pf}),
          bounds AS (SELECT date_trunc('week', min(created_at)) a, date_trunc('week', now()) b FROM base),
          weeks AS (SELECT generate_series(a, b, interval '1 week') wk FROM bounds)
     SELECT to_char(wk, 'YYYY-MM-DD') AS week,
            (SELECT count(*) FROM base WHERE created_at < wk + interval '1 week') AS created,
            (SELECT count(*) FROM base WHERE resolved_at IS NOT NULL AND resolved_at < wk + interval '1 week') AS done
     FROM weeks ORDER BY wk`,
    params,
  );
  return rows.map((r) => {
    const created = Number(r.created), done = Number(r.done);
    return { week: r.week, created, done, wip: created - done };
  });
}

const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

/** Cycle time (lead) dağılımı: histogram kovaları + p50/p85/p95. */
export async function cycleTime(projectKey?: string) {
  const params: unknown[] = [];
  const pf = projFilter(projectKey, params, "project_id");
  const rows = await query<{ lead_days: string }>(
    `SELECT lead_days FROM v_lead_time WHERE lead_days >= 0 ${pf} ORDER BY lead_days`,
    params,
  );
  const vals = rows.map((r) => Number(r.lead_days));
  const edges = [1, 2, 3, 5, 8, 13, 21, 34, 55];
  const buckets = [
    ...edges.map((e, i) => ({ label: i === 0 ? `≤${e}g` : `${edges[i - 1]}–${e}g`, hi: e, count: 0 })),
    { label: `>${edges[edges.length - 1]}g`, hi: Infinity, count: 0 },
  ];
  for (const v of vals) { (buckets.find((b) => v <= b.hi) ?? buckets[buckets.length - 1]).count++; }
  return {
    count: vals.length,
    p50: +pct(vals, 50).toFixed(1), p85: +pct(vals, 85).toFixed(1), p95: +pct(vals, 95).toFixed(1),
    avg: vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : 0,
    buckets: buckets.map((b) => ({ label: b.label, count: b.count })),
  };
}

/**
 * Sprint velocity: tamamlanan iş + kapsam + SÖZ TUTMA (committed vs added).
 * committed = sprint başında (start_at) planlanan; added = sonradan eklenen (scope creep).
 */
export async function velocity(projectKey?: string) {
  const params: unknown[] = [];
  const pf = projFilter(projectKey, params);
  const rows = await query<any>(
    `SELECT s.name AS sprint, s.start_at, s.end_at,
            COUNT(w.*)                                           AS total,
            COUNT(w.*) FILTER (WHERE w.status_category = 'done')  AS done,
            COUNT(w.*) FILTER (WHERE w.sprint_added_at <= s.start_at) AS committed,
            COUNT(w.*) FILTER (WHERE w.sprint_added_at > s.start_at OR w.sprint_added_at IS NULL) AS added,
            COUNT(w.*) FILTER (WHERE w.status_category = 'done' AND w.sprint_added_at <= s.start_at) AS done_committed,
            COALESCE(SUM(w.story_points) FILTER (WHERE w.status_category = 'done'), 0) AS points
     FROM sprints s JOIN work_items w ON w.sprint_id = s.id
     WHERE 1=1 ${pf}
     GROUP BY s.id, s.name, s.start_at, s.end_at
     ORDER BY s.start_at NULLS LAST, s.name`,
    params,
  );
  return rows.map((r: any) => {
    const committed = Number(r.committed), added = Number(r.added), done = Number(r.done), total = Number(r.total), doneCommitted = Number(r.done_committed);
    const lengthDays = r.start_at && r.end_at ? Math.round((new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 86400000) : null;
    return {
      sprint: r.sprint, done, total, committed, added, doneCommitted,
      points: Number(r.points),
      commitmentPct: committed ? Math.round((doneCommitted / committed) * 100) : null, // sözün % kaçı tutuldu
      scopePct: committed ? Math.round((added / committed) * 100) : null,               // sonradan eklenen oranı
      completionPct: total ? Math.round((done / total) * 100) : 0,
      lengthDays,
    };
  });
}

/** Haftalık throughput (sprint linkli olmasa da çalışan velocity alternatifi). */
export async function weeklyThroughput(projectKey?: string) {
  const params: unknown[] = [];
  const pf = projFilter(projectKey, params);
  return query<{ week: string; done: string }>(
    `SELECT to_char(date_trunc('week', resolved_at), 'YYYY-MM-DD') AS week, COUNT(*) AS done
     FROM work_items w
     WHERE resolved_at IS NOT NULL ${pf}
     GROUP BY 1 ORDER BY 1`,
    params,
  );
}

const TODO_STATUSES = ["To Do", "Open", "Reopened", "Backlog", "Yapılacak", "Açık", "Beklemede"];

/**
 * Zaman serisi: dönem başına (hafta/ay/sprint) akış metrikleri.
 * Gerçek cycle time = ilk "aktif statüye geçiş" → çözüm (backlog beklemesi hariç).
 * Yönteme nötr: Kanban da Scrum da aynı tanımla doğru okur; bucket sadece görünüm.
 */
export async function flowSeries(projectKey?: string, bucket: "week" | "month" | "sprint" = "week") {
  const params: unknown[] = [TODO_STATUSES];
  const wf = wiFilter(projectKey, {}, params, "w");
  const isSprint = bucket === "sprint";
  const periodSel = isSprint ? "s.name" : `to_char(date_trunc('${bucket}', w.resolved_at), '${bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD"}')`;
  const periodOrd = isSprint ? "min(s.start_at)" : `min(date_trunc('${bucket}', w.resolved_at))`;
  const sprintJoin = isSprint ? "JOIN sprints s ON s.id = w.sprint_id" : "";

  // Dönem başına: tamamlanan (throughput), bug, cycle p50/p85, lead p50
  const done = await query<any>(
    `WITH b AS (
       SELECT w.*, ${isSprint ? "s.name AS sprint_name, s.start_at AS sprint_start," : ""}
              (SELECT min(t.at) FROM work_item_transitions t WHERE t.work_item_id = w.id AND NOT (t.to_status = ANY($1))) AS cyc_start
       FROM work_items w ${sprintJoin} WHERE w.resolved_at IS NOT NULL ${wf}
     )
     SELECT ${isSprint ? "sprint_name" : `to_char(date_trunc('${bucket}', resolved_at), '${bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD"}')`} AS period,
            ${isSprint ? "min(sprint_start)" : `min(date_trunc('${bucket}', resolved_at))`} AS ord,
            COUNT(*) AS done,
            COUNT(*) FILTER (WHERE type ILIKE 'bug' OR type ILIKE 'hata') AS bugs,
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - cyc_start)) / 86400) FILTER (WHERE cyc_start IS NOT NULL)::numeric, 1) AS cyc_p50,
            ROUND(percentile_cont(0.85) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - cyc_start)) / 86400) FILTER (WHERE cyc_start IS NOT NULL)::numeric, 1) AS cyc_p85,
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)::numeric, 1) AS lead_p50
     FROM b ${isSprint ? "WHERE sprint_name IS NOT NULL" : ""}
     GROUP BY 1 ORDER BY 2`,
    params,
  );

  // Dönem başına "açılan" (CFD için):
  //  - week/month: created_at tarihine göre
  //  - sprint: o sprint'e dahil edilen kapsam (sprint'teki tüm kart), WIP negatif olmasın diye
  let created: any[] = [];
  if (isSprint) {
    const cp: unknown[] = [];
    const cwf = wiFilter(projectKey, {}, cp, "w");
    created = await query<any>(
      `SELECT s.name AS period, min(s.start_at) AS ord, COUNT(*) AS created
       FROM work_items w JOIN sprints s ON s.id = w.sprint_id WHERE 1=1 ${cwf}
       GROUP BY s.name ORDER BY min(s.start_at) NULLS FIRST`,
      cp,
    );
  } else {
    const cp: unknown[] = [];
    const cwf = wiFilter(projectKey, {}, cp, "w");
    created = await query<any>(
      `SELECT to_char(date_trunc('${bucket}', w.created_at), '${bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD"}') AS period, COUNT(*) AS created
       FROM work_items w WHERE w.created_at IS NOT NULL ${cwf} GROUP BY 1`,
      cp,
    );
  }
  const createdMap = new Map(created.map((r) => [r.period, Number(r.created)]));

  // Zaman çizgisini birleştir + kümülatif + WIP (JS'te)
  const periods = [...new Set([...done.map((d) => d.period), ...created.map((c) => c.period)])];
  // sprint: TÜM sprint'ler start sırasına göre (created tüm sprint'leri içerir); week/month: tarih sırası
  const ordered = isSprint ? created.map((c) => c.period) : periods.sort();
  const doneMap = new Map(done.map((d) => [d.period, d]));
  let cumC = 0, cumD = 0;
  return ordered.map((p) => {
    const d = doneMap.get(p);
    const createdN = createdMap.get(p) ?? 0;
    const doneN = d ? Number(d.done) : 0;
    cumC += createdN; cumD += doneN;
    return {
      period: p, created: createdN, done: doneN, cumCreated: cumC, cumDone: cumD, wip: Math.max(0, cumC - cumD),
      bugRatio: doneN ? Math.round((Number(d.bugs) / doneN) * 100) : 0,
      cycP50: d?.cyc_p50 != null ? Number(d.cyc_p50) : null,
      cycP85: d?.cyc_p85 != null ? Number(d.cyc_p85) : null,
      leadP50: d?.lead_p50 != null ? Number(d.lead_p50) : null,
    };
  });
}

/** Aging WIP dağılımı: In Progress kartların bekleme süresi histogramı. */
export async function agingDistribution(projectKey?: string) {
  const params: unknown[] = [];
  const pf = projFilter(projectKey, params);
  const rows = await query<{ d: string }>(
    `SELECT a.days_in_status AS d FROM v_aging_wip a
     JOIN work_items w ON w.id = a.work_item_id WHERE 1=1 ${pf}`,
    params,
  );
  const vals = rows.map((r) => Number(r.d));
  const edges = [1, 3, 7, 14, 30, 60];
  const buckets = [
    ...edges.map((e, i) => ({ label: i === 0 ? `≤${e}g` : `${edges[i - 1]}–${e}g`, hi: e, count: 0 })),
    { label: `>${edges[edges.length - 1]}g`, hi: Infinity, count: 0 },
  ];
  for (const v of vals) (buckets.find((b) => v <= b.hi) ?? buckets[buckets.length - 1]).count++;
  return { count: vals.length, buckets: buckets.map((b) => ({ label: b.label, count: b.count })) };
}

/**
 * Eşanlamlı/çevrilmiş statüleri tek kanonik ada indirger (workflow İngilizce→Türkçe
 * geçişinden kalan tekrarlar). Yeni eşleşme çıkarsa buraya eklenir.
 */
const STATUS_ALIAS: Record<string, string> = {
  "In Progress": "Devam Ediyor",
  "Open": "To Do",
  "Reopened": "To Do",
  "Closed": "Done",
  "Resolved": "Done",
};
const canon = (s: string) => STATUS_ALIAS[s] ?? s;
/** Kanonik ada eşlenen tüm ham statüler (geçiş sorgularında eşleştirmek için). */
const rawAliases = (canonical: string) => [canonical, ...Object.keys(STATUS_ALIAS).filter((k) => STATUS_ALIAS[k] === canonical)];

export interface FlowFilter { assignee?: string; sprint?: string }

/** work_items filtre cümlesi: proje + kişi + sprint. */
function wiFilter(projectKey: string | undefined, f: FlowFilter, params: unknown[], alias = "w"): string {
  let c = "";
  if (projectKey) { params.push(projectKey); c += ` AND ${alias}.project_id = (SELECT id FROM jira_projects WHERE key = $${params.length})`; }
  if (f.assignee) { params.push(f.assignee); c += ` AND ${alias}.assignee_id = (SELECT id FROM people WHERE display_name = $${params.length})`; }
  if (f.sprint) { params.push(f.sprint); c += ` AND ${alias}.sprint_id = (SELECT id FROM sprints WHERE name = $${params.length})`; }
  return c;
}

/** Filtre seçenekleri: projedeki kişiler + sprintler. */
export async function filterOptions(projectKey?: string) {
  const p1: unknown[] = []; const f1 = wiFilter(projectKey, {}, p1);
  const assignees = await query<{ name: string }>(
    `SELECT DISTINCT p.display_name AS name FROM people p JOIN work_items w ON w.assignee_id = p.id WHERE 1=1 ${f1} ORDER BY p.display_name`, p1);
  const p2: unknown[] = []; const f2 = wiFilter(projectKey, {}, p2);
  const sprints = await query<{ name: string }>(
    `SELECT DISTINCT s.name FROM sprints s JOIN work_items w ON w.sprint_id = s.id WHERE 1=1 ${f2} ORDER BY s.name`, p2);
  return { assignees: assignees.map((a) => a.name), sprints: sprints.map((s) => s.name) };
}

/** Belirli bir geçişi (from→to) yapan kartlar — kenara tıklayınca. */
export function itemsByTransition(projectKey: string | undefined, from: string, to: string, f: FlowFilter = {}, limit = 120) {
  const params: unknown[] = [rawAliases(from), rawAliases(to)];
  const wf = wiFilter(projectKey, f, params);
  return query(
    `SELECT DISTINCT w.key, w.summary, w.type, w.status, pp.display_name AS assignee,
            to_char(w.updated_at,'YYYY-MM-DD') AS updated
     FROM work_item_transitions t
     JOIN work_items w ON w.id = t.work_item_id
     LEFT JOIN people pp ON pp.id = w.assignee_id
     WHERE t.from_status = ANY($1) AND t.to_status = ANY($2) ${wf}
     ORDER BY updated DESC NULLS LAST`,
    params,
  );
}

/**
 * Gerçek statü-akış grafiği: changelog'dan türeyen statüler düğüm (kanonikleştirilmiş),
 * aralarındaki geçişler (from→to) kenar (hacim = geçiş sayısı).
 */
export async function statusFlow(projectKey?: string, f: FlowFilter = {}) {
  const np: unknown[] = [];
  const npf = wiFilter(projectKey, f, np);
  const rawNodes = await query<{ status: string; category: string | null; count: string }>(
    `SELECT w.status, w.status_category AS category, COUNT(*) AS count
     FROM work_items w WHERE w.status IS NOT NULL ${npf}
     GROUP BY w.status, w.status_category`,
    np,
  );
  const ep: unknown[] = [];
  const epf = wiFilter(projectKey, f, ep);
  const rawEdges = await query<{ from: string; to: string; count: string }>(
    `SELECT t.from_status AS from, t.to_status AS to, COUNT(*) AS count
     FROM work_item_transitions t JOIN work_items w ON w.id = t.work_item_id
     WHERE t.from_status IS NOT NULL ${epf}
     GROUP BY t.from_status, t.to_status`,
    ep,
  );

  // Düğümleri kanonik ada göre topla (kategori: en çok kartı olan kazanır)
  const nodeMap = new Map<string, { count: number; category: string | null }>();
  for (const n of rawNodes) {
    const k = canon(n.status), cur = nodeMap.get(k);
    if (!cur) nodeMap.set(k, { count: Number(n.count), category: n.category });
    else { cur.count += Number(n.count); if (!cur.category) cur.category = n.category; }
  }
  // Kenarları kanonikleştir, self-loop'ları at, yeniden topla
  const edgeMap = new Map<string, number>();
  for (const e of rawEdges) {
    const f = canon(e.from), t = canon(e.to);
    if (f === t) continue;
    edgeMap.set(`${f}\u0000${t}`, (edgeMap.get(`${f}\u0000${t}`) ?? 0) + Number(e.count));
  }

  return {
    nodes: [...nodeMap.entries()].map(([status, v]) => ({ status, category: v.category, count: v.count })),
    edges: [...edgeMap.entries()].map(([k, count]) => { const [from, to] = k.split("\u0000"); return { from, to, count }; }),
  };
}

/** Belirli bir statüdeki kartlar (düğüme tıklayınca dock). */
export function itemsByStatus(projectKey: string | undefined, status: string, f: FlowFilter = {}, limit = 120) {
  const params: unknown[] = [rawAliases(status)];
  const pf = wiFilter(projectKey, f, params);
  return query(
    `SELECT w.key, w.summary, w.status, w.type, pp.display_name AS assignee,
            to_char(w.updated_at, 'YYYY-MM-DD') AS updated
     FROM work_items w LEFT JOIN people pp ON pp.id = w.assignee_id
     WHERE w.status = ANY($1) ${pf}
     ORDER BY w.updated_at DESC NULLS LAST`,
    params,
  );
}

/** Bir statü kategorisindeki kartlar (Stream dock listesi). */
export function wipItems(projectKey?: string, cat = "in_progress", f: FlowFilter = {}, limit = 80) {
  const params: unknown[] = [cat];
  const pf = wiFilter(projectKey, f, params);
  return query(
    `SELECT w.key, w.summary, w.status, w.type, pp.display_name AS assignee,
            to_char(w.updated_at, 'YYYY-MM-DD') AS updated
     FROM work_items w LEFT JOIN people pp ON pp.id = w.assignee_id
     WHERE w.status_category = $1 ${pf}
     ORDER BY w.updated_at DESC NULLS LAST`,
    params,
  );
}

/**
 * Stream kart-node görünümü: AKTİF kartlar (To Do + In Progress ailesi) düğüm,
 * aşama şeridine yerleşir; aralarındaki gerçek bağımlılıklar (issue-link + parent) kenar.
 * Done arşivi hariç (akışı değil birikmiş geçmişi şişirmesin).
 */
export async function streamCards(projectKey?: string) {
  const np: unknown[] = [];
  const npf = projFilter(projectKey, np);
  const nodes = await query<any>(
    `SELECT w.key, w.summary, w.type, w.status, w.status_category AS category,
            pp.display_name AS assignee,
            ROUND((EXTRACT(EPOCH FROM (now() - COALESCE(
              (SELECT max(t.at) FROM work_item_transitions t WHERE t.work_item_id = w.id),
              w.created_at))) / 86400.0)::numeric, 1) AS age_days,
            CASE WHEN w.status_category = 'todo' THEN 0
                 WHEN w.status ILIKE '%review%' OR w.status ILIKE '%test%' THEN 2
                 ELSE 1 END AS lane
     FROM work_items w LEFT JOIN people pp ON pp.id = w.assignee_id
     WHERE w.status_category IN ('todo','in_progress') ${npf}
     ORDER BY lane, age_days DESC`,
    np,
  );
  const ep: unknown[] = [];
  const epf = projFilter(projectKey, ep);
  const edges = await query<any>(
    `WITH act AS (SELECT w.key FROM work_items w WHERE w.status_category IN ('todo','in_progress') ${epf})
     SELECT il.from_key AS "from", il.to_key AS "to", COALESCE(il.type,'link') AS rel
       FROM issue_links il
      WHERE il.from_key IN (SELECT key FROM act) AND il.to_key IN (SELECT key FROM act)
     UNION ALL
     SELECT c.parent_key AS "from", c.key AS "to", 'alt-görev' AS rel
       FROM work_items c
      WHERE c.parent_key IS NOT NULL
        AND c.status_category IN ('todo','in_progress')
        AND c.parent_key IN (SELECT key FROM act)
        AND c.key IN (SELECT key FROM act)`,
    ep,
  );
  return {
    nodes: nodes.map((n: any) => ({
      key: n.key, summary: n.summary, type: n.type, status: n.status, category: n.category,
      assignee: n.assignee ?? null, age: Number(n.age_days), lane: Number(n.lane),
    })),
    edges,
  };
}

/** Risk radarı: In Progress'te bekleyen kartlar, cycle time persentillerine göre skorlanır. */
export async function riskRadar(projectKey?: string, f: FlowFilter & { scope?: "all" | "wip" | "backlog" } = {}) {
  const ct = await cycleTime(projectKey);
  const scope = f.scope ?? "all";
  const cats = scope === "wip" ? ["in_progress"] : scope === "backlog" ? ["todo"] : ["in_progress", "todo"];
  const params: unknown[] = [cats];
  const wf = wiFilter(projectKey, { assignee: f.assignee, sprint: f.sprint }, params, "w");
  const rows = await query<any>(
    `SELECT w.key, w.summary, w.type, w.status, w.status_category AS cat, p.display_name AS assignee, w.assignee_id,
            s.name AS sprint, s.end_at AS sprint_end,
            ROUND((EXTRACT(EPOCH FROM (now() - COALESCE(
              (SELECT max(t.at) FROM work_item_transitions t WHERE t.work_item_id = w.id), w.created_at))) / 86400.0)::numeric, 1) AS days
     FROM work_items w
     LEFT JOIN people p ON p.id = w.assignee_id
     LEFT JOIN sprints s ON s.id = w.sprint_id
     WHERE w.status_category = ANY($1) ${wf}
     ORDER BY days DESC`,
    params,
  );

  // Blocker / bağımlılık linkleri
  const blockRows = await query<any>(
    `SELECT l.from_key, l.to_key, l.type, wf.status_category AS fcat, wt.status_category AS tcat
     FROM issue_links l LEFT JOIN work_items wf ON wf.key = l.from_key LEFT JOIN work_items wt ON wt.key = l.to_key
     WHERE l.type ILIKE '%block%' OR l.type ILIKE '%engel%'`,
  );
  const blockers = new Map<string, number>();   // kart -> onu bloklayan açık iş (RİSK)
  const dependents = new Map<string, number>();  // kart -> ona bağlı açık iş (ETKİ)
  for (const l of blockRows) {
    const t = (l.type || "").toLowerCase();
    let blocked: string | null = null, blocker: string | null = null, blockerOpen = false, dependentOpen = false;
    if (t.includes("is blocked by") || t.includes("engelleniyor")) { blocked = l.from_key; blocker = l.to_key; blockerOpen = l.tcat !== "done"; dependentOpen = l.fcat !== "done"; }
    else if (t.includes("block") || t.includes("engel")) { blocked = l.to_key; blocker = l.from_key; blockerOpen = l.fcat !== "done"; dependentOpen = l.tcat !== "done"; }
    if (blocked && blockerOpen) blockers.set(blocked, (blockers.get(blocked) ?? 0) + 1);
    if (blocker && dependentOpen) dependents.set(blocker, (dependents.get(blocker) ?? 0) + 1);
  }
  // açık alt-görev sayısı (etki)
  const cp: unknown[] = []; const cwf = wiFilter(projectKey, {}, cp, "c");
  const childRows = await query<any>(
    `SELECT c.parent_key AS k, COUNT(*) AS n FROM work_items c
     WHERE c.parent_key IS NOT NULL AND c.status_category <> 'done' ${cwf} GROUP BY c.parent_key`, cp);
  const children = new Map<string, number>(childRows.map((r: any) => [r.k, Number(r.n)]));

  const now = Date.now();
  return rows.map((r: any) => {
    const days = Number(r.days);
    const backlog = r.cat === "todo";
    const blocked = blockers.get(r.key) ?? 0;
    const impact = (dependents.get(r.key) ?? 0) + (children.get(r.key) ?? 0);
    const overdue = r.sprint_end ? new Date(r.sprint_end).getTime() < now : false;
    const aged = days >= (ct.p85 || 20);
    const noOwner = !r.assignee_id;
    const reasons: string[] = [];
    if (blocked) reasons.push(`bloklu (${blocked})`);
    if (overdue) reasons.push(backlog ? "sprint'te kaldı, başlanmadı" : "sprint aştı");
    if (aged) reasons.push(backlog ? "çok eski" : "uzun bekliyor");
    if (impact) reasons.push(`${impact} işi etkiliyor`);
    if (noOwner) reasons.push("sahipsiz");
    const score = (blocked ? 3 : 0) + (overdue ? 3 : 0) + (aged ? 2 : 0) + impact * 0.6 + (noOwner ? 0.5 : 0);
    const risk = score >= 3 ? "yüksek" : score >= 1 ? "orta" : "düşük";
    return { key: r.key, summary: r.summary, assignee: r.assignee, type: r.type, sprint: r.sprint, kind: backlog ? "backlog" : "wip", days, impact, blocked, overdue, reasons, score: +score.toFixed(1), risk };
  }).sort((a: any, b: any) => b.score - a.score);
}

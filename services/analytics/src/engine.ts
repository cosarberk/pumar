/**
 * Sorgu motoru: bir QuerySpec'i (measure + dimension + filters) güvenli SQL'e
 * derler ve çalıştırır. Dinamik rapor motorunun çağıracağı tek giriş noktası.
 *
 * Güvenlik: measure/dimension yalnızca registry'den gelir (serbest SQL değil);
 * filtre değerleri parametre ($1..) olarak bağlanır.
 */
import { query } from "./db.js";
import { DIMENSIONS, MEASURES } from "./metrics/registry.js";
import type { MetricRow, QuerySpec } from "./metrics/types.js";

type Filters = NonNullable<QuerySpec["filters"]>;

/** Ortak WHERE/JOIN/param kurucusu — tüm metrik sorguları bunu paylaşır. */
function buildFilters(f: Filters = {}) {
  const joins = new Set<string>();
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.sprintKey) { joins.add(DIMENSIONS.sprint.joinSql!); params.push(f.sprintKey); where.push(`s.name = $${params.length}`); }
  if (f.projectKey) { joins.add(DIMENSIONS.project.joinSql!); params.push(f.projectKey); where.push(`jp.key = $${params.length}`); }
  if (f.type) { params.push(f.type); where.push(`w.type ILIKE $${params.length}`); }
  if (f.createdFrom) { params.push(f.createdFrom); where.push(`w.created_at >= $${params.length}`); }
  if (f.createdTo) { params.push(f.createdTo); where.push(`w.created_at <= $${params.length}`); }
  return { joins, where, params };
}

/** Tek boyut × tek ölçü. */
export async function runMetric(spec: QuerySpec): Promise<MetricRow[]> {
  const measure = MEASURES[spec.measure];
  if (!measure) throw new Error(`Bilinmeyen ölçü: ${spec.measure}`);

  const dim = spec.dimension ? DIMENSIONS[spec.dimension] : undefined;
  if (spec.dimension && !dim) throw new Error(`Bilinmeyen boyut: ${spec.dimension}`);

  const { joins, where, params } = buildFilters(spec.filters);
  if (dim?.joinSql) joins.add(dim.joinSql);

  const selectGroup = dim ? dim.selectSql : `'Toplam'`;
  const groupBy = dim ? `GROUP BY ${dim.groupBySql}` : "";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = spec.limit ? `LIMIT ${Math.max(1, Math.floor(spec.limit))}` : "";
  // boyutun mantıksal sırası varsa (ör. sprint kronolojik) onu kullan; yoksa değere göre.
  const orderBy = dim?.orderSql ? `ORDER BY ${dim.orderSql} ASC NULLS LAST` : "ORDER BY value DESC NULLS LAST";

  const sql = `
    SELECT ${selectGroup} AS group, ${measure.aggSql} AS value
    FROM work_items w
    ${[...joins].join("\n    ")}
    ${whereSql}
    ${groupBy}
    ${orderBy}
    ${limit}
  `;

  const rows = await query<{ group: string; value: string | number | null }>(sql, params);
  return rows.map((r) => ({
    group: r.group,
    value: r.value === null ? null : Number(r.value),
  }));
}

/** Çapraz pivot: satır boyutu × sütun boyutu × tek ölçü (kesişim matrisi). */
export async function runCrosstab(spec: {
  measure: string;
  rowDim: string;
  colDim: string;
  filters?: Filters;
}): Promise<{ row: string; col: string; value: number | null }[]> {
  const measure = MEASURES[spec.measure];
  if (!measure) throw new Error(`Bilinmeyen ölçü: ${spec.measure}`);
  const rd = DIMENSIONS[spec.rowDim];
  if (!rd) throw new Error(`Bilinmeyen boyut: ${spec.rowDim}`);
  const cd = DIMENSIONS[spec.colDim];
  if (!cd) throw new Error(`Bilinmeyen boyut: ${spec.colDim}`);

  const { joins, where, params } = buildFilters(spec.filters);
  if (rd.joinSql) joins.add(rd.joinSql);
  if (cd.joinSql) joins.add(cd.joinSql);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // satır/sütun mantıksal sırası (ör. sprint kronolojik) — yoksa grup ifadesine göre.
  const rowOrder = rd.orderSql ?? rd.groupBySql;
  const colOrder = cd.orderSql ?? cd.groupBySql;

  const sql = `
    SELECT ${rd.selectSql} AS row, ${cd.selectSql} AS col, ${measure.aggSql} AS value
    FROM work_items w
    ${[...joins].join("\n    ")}
    ${whereSql}
    GROUP BY ${rd.groupBySql}, ${cd.groupBySql}
    ORDER BY ${rowOrder} ASC NULLS LAST, ${colOrder} ASC NULLS LAST
  `;
  const rows = await query<{ row: string; col: string; value: string | number | null }>(sql, params);
  return rows.map((r) => ({ row: r.row, col: r.col, value: r.value === null ? null : Number(r.value) }));
}

/**
 * Zaman trendi: aylık oluşturulan vs çözülen iş + biriken backlog (kümülatif).
 * Teslim/akış grafikleri (CFD, burn) bunu kullanır. Boşluk ayları 0 ile doldurulur.
 */
export async function runTrend(spec: { filters?: Filters } = {}): Promise<
  { period: string; created: number; resolved: number; backlog: number }[]
> {
  const { joins, where, params } = buildFilters(spec.filters);
  const joinSql = [...joins].join("\n    ");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const createdRows = await query<{ period: string; n: string }>(
    `SELECT to_char(date_trunc('month', w.created_at), 'YYYY-MM') AS period, COUNT(*) AS n
       FROM work_items w ${joinSql} ${whereSql}
      GROUP BY 1`,
    params,
  );
  const resolvedRows = await query<{ period: string; n: string }>(
    `SELECT to_char(date_trunc('month', w.resolved_at), 'YYYY-MM') AS period, COUNT(*) AS n
       FROM work_items w ${joinSql}
      ${whereSql ? whereSql + " AND" : "WHERE"} w.resolved_at IS NOT NULL
      GROUP BY 1`,
    params,
  );

  return fillTrend(createdRows, resolvedRows);
}

/**
 * İki aylık seriyi (açılan/çözülen) birleştirip boşluk aylarını 0 ile doldurur,
 * kümülatif biriken (backlog) hesaplar. runTrend ve mrTrend paylaşır.
 */
function fillTrend(
  createdRows: { period: string; n: string }[],
  resolvedRows: { period: string; n: string }[],
): { period: string; created: number; resolved: number; backlog: number }[] {
  const cMap = new Map(createdRows.filter((r) => r.period).map((r) => [r.period, Number(r.n)]));
  const rMap = new Map(resolvedRows.filter((r) => r.period).map((r) => [r.period, Number(r.n)]));
  const keys = [...new Set([...cMap.keys(), ...rMap.keys()])].sort();
  if (!keys.length) return [];

  const [y0, m0] = keys[0].split("-").map(Number);
  const [y1, m1] = keys[keys.length - 1].split("-").map(Number);
  const months: string[] = [];
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); ) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }

  let backlog = 0;
  return months.map((period) => {
    const created = cMap.get(period) ?? 0;
    const resolved = rMap.get(period) ?? 0;
    backlog += created - resolved;
    return { period, created, resolved, backlog: Math.max(0, backlog) };
  });
}

/**
 * MR akış trendi: aylık açılan (created_at) vs merge edilen (merged_at) + açık MR birikimi.
 * Proje geneli (repo↔proje bağı seyrek null olduğu için global okunur).
 */
export async function mrTrend(): Promise<
  { period: string; created: number; resolved: number; backlog: number }[]
> {
  const createdRows = await query<{ period: string; n: string }>(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS period, COUNT(*) AS n
       FROM merge_requests WHERE created_at IS NOT NULL GROUP BY 1`,
  );
  const mergedRows = await query<{ period: string; n: string }>(
    `SELECT to_char(date_trunc('month', merged_at), 'YYYY-MM') AS period, COUNT(*) AS n
       FROM merge_requests WHERE merged_at IS NOT NULL GROUP BY 1`,
  );
  return fillTrend(createdRows, mergedRows);
}

/** Filtre çubuğu için dolu değerler: proje bağlamındaki sprint'ler + türler. */
export async function metricOptions(projectKey?: string) {
  const p1: unknown[] = []; let pf1 = "";
  if (projectKey) { p1.push(projectKey); pf1 = `AND jp.key = $${p1.length}`; }
  const sprints = await query<{ name: string }>(
    `SELECT DISTINCT s.name FROM work_items w
       JOIN sprints s ON s.id = w.sprint_id
       LEFT JOIN jira_projects jp ON jp.id = w.project_id
      WHERE s.name IS NOT NULL ${pf1}
      ORDER BY s.name`,
    p1,
  );
  const p2: unknown[] = []; let pf2 = "";
  if (projectKey) { p2.push(projectKey); pf2 = `AND jp.key = $${p2.length}`; }
  const types = await query<{ type: string }>(
    `SELECT DISTINCT w.type FROM work_items w
       LEFT JOIN jira_projects jp ON jp.id = w.project_id
      WHERE w.type IS NOT NULL ${pf2}
      ORDER BY w.type`,
    p2,
  );
  return { sprints: sprints.map((s) => s.name), types: types.map((t) => t.type) };
}

/** Drill-down: bir pivot hücresindeki (boyut değeri + ölçü) gerçek kartlar. */
export async function drillItems(spec: {
  measure?: string;
  dimension: string;
  group: string;
  colDimension?: string;
  colGroup?: string;
  filters?: Filters;
}): Promise<{ key: string; summary: string; type: string; status: string; category: string | null; assignee: string | null }[]> {
  const dim = DIMENSIONS[spec.dimension];
  if (!dim) throw new Error(`Bilinmeyen boyut: ${spec.dimension}`);

  const { joins, where, params } = buildFilters(spec.filters);
  if (dim.joinSql) joins.add(dim.joinSql);
  joins.add("LEFT JOIN people pa ON pa.id = w.assignee_id"); // assignee adı (assignee boyutuyla aynı string → tekilleşir)

  params.push(spec.group);
  where.push(`${dim.selectSql} = $${params.length}`);

  if (spec.colDimension && spec.colGroup != null) {
    const cd = DIMENSIONS[spec.colDimension];
    if (cd) {
      if (cd.joinSql) joins.add(cd.joinSql);
      params.push(spec.colGroup);
      where.push(`${cd.selectSql} = $${params.length}`);
    }
  }

  if (spec.measure) {
    const m = MEASURES[spec.measure];
    if (m?.rowFilterSql) where.push(m.rowFilterSql);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT w.key, w.summary, w.type, w.status, w.status_category AS category, pa.display_name AS assignee
    FROM work_items w
    ${[...joins].join("\n    ")}
    ${whereSql}
    ORDER BY w.updated_at DESC NULLS LAST
  `;
  const rows = await query<{ key: string; summary: string; type: string; status: string; category: string | null; assignee: string | null }>(sql, params);
  return rows;
}

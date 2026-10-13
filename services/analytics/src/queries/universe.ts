/**
 * Kart Evreni: her iş kalemi bir düğüm; bağlar = parent↔alt-görev, epic↔üye,
 * issue-link (blocks/relates), issue→MR. Binlerce kart olduğu için LAZY:
 * roots() tohum düğümleri verir, expand(key) tıklanan düğümün komşularını getirir.
 */
import { query } from "../db.js";

export interface UNode {
  id: string; kind: "issue" | "mr"; label: string;
  type?: string; status?: string; category?: string | null;
  assignee?: string | null; summary?: string; degree?: number; state?: string;
}
export interface UEdge { source: string; target: string; rel: string }

const DEGREE_SQL = `
  (SELECT count(*) FROM work_items c WHERE c.parent_key = w.key)
+ (SELECT count(*) FROM work_items e WHERE e.epic_key = w.key)
+ (SELECT count(*) FROM issue_links il WHERE il.from_key = w.key OR il.to_key = w.key)
+ (CASE WHEN w.parent_key IS NOT NULL THEN 1 ELSE 0 END)
+ (CASE WHEN w.epic_key IS NOT NULL THEN 1 ELSE 0 END)
+ (SELECT count(*) FROM merge_requests m WHERE m.work_item_id = w.id)`;

function toNode(r: any): UNode {
  return {
    id: r.key, kind: "issue", label: r.key, type: r.type, status: r.status,
    category: r.status_category, assignee: r.assignee ?? null, summary: r.summary,
    degree: Number(r.degree ?? 0),
  };
}

/** Tüm evren (veya sprint seçiliyse o sprint'in kartları) düğüm + aralarındaki ilişkiler. */
export async function allGraph(projectKey?: string, sprint?: string, limit = 5000) {
  const np: unknown[] = [];
  let pf = "";
  if (projectKey) { np.push(projectKey); pf += ` AND w.project_id = (SELECT id FROM jira_projects WHERE key = $${np.length})`; }
  if (sprint) { np.push(sprint); pf += ` AND w.sprint_id = (SELECT id FROM sprints WHERE name = $${np.length})`; }
  const rows = await query<any>(
    `SELECT w.key, w.summary, w.type, w.status, w.status_category, pp.display_name AS assignee
     FROM work_items w LEFT JOIN people pp ON pp.id = w.assignee_id
     WHERE 1=1 ${pf}`,
    np,
  );
  const keyset = new Set(rows.map((r: any) => r.key));
  const nodes: UNode[] = rows.map(toNode);

  const ep: unknown[] = [];
  let epf = "";
  if (projectKey) { ep.push(projectKey); epf = `AND w.project_id = (SELECT id FROM jira_projects WHERE key = $${ep.length})`; }
  const parent = await query<any>(`SELECT w.parent_key AS "from", w.key AS "to", 'alt-görev' AS rel FROM work_items w WHERE w.parent_key IS NOT NULL ${epf}`, ep);
  const ep2: unknown[] = [];
  let epf2 = "";
  if (projectKey) { ep2.push(projectKey); epf2 = `AND w.project_id = (SELECT id FROM jira_projects WHERE key = $${ep2.length})`; }
  const epic = await query<any>(`SELECT w.epic_key AS "from", w.key AS "to", 'epic-üye' AS rel FROM work_items w WHERE w.epic_key IS NOT NULL ${epf2}`, ep2);
  const links = await query<any>(`SELECT il.from_key AS "from", il.to_key AS "to", COALESCE(il.type,'link') AS rel FROM issue_links il`);

  const edges: UEdge[] = [...parent, ...epic, ...links]
    .filter((e: any) => keyset.has(e.from) && keyset.has(e.to))
    .map((e: any) => ({ source: e.from, target: e.to, rel: e.rel }));
  return { nodes, edges };
}

/** Issue arama (key veya başlık) — merkeze almak için. */
export function search(projectKey: string | undefined, q: string, limit = 20) {
  const params: unknown[] = [`%${q}%`];
  let pf = "";
  if (projectKey) { params.push(projectKey); pf = `AND w.project_id = (SELECT id FROM jira_projects WHERE key = $${params.length})`; }
  return query<{ key: string; summary: string; type: string }>(
    `SELECT w.key, w.summary, w.type FROM work_items w
     WHERE (w.key ILIKE $1 OR w.summary ILIKE $1) ${pf}
     ORDER BY (w.key ILIKE $1) DESC, w.updated_at DESC NULLS LAST`,
    params,
  );
}

/** Tohum düğümler: epic'ler + en çok bağlantılı kök kartlar (hub). */
export async function roots(projectKey?: string, limit = 60) {
  const params: unknown[] = [];
  let pf = "";
  if (projectKey) { params.push(projectKey); pf = `AND w.project_id = (SELECT id FROM jira_projects WHERE key = $${params.length})`; }
  const rows = await query(
    `SELECT w.key, w.summary, w.type, w.status, w.status_category, pp.display_name AS assignee,
            ${DEGREE_SQL} AS degree
     FROM work_items w LEFT JOIN people pp ON pp.id = w.assignee_id
     WHERE (w.type ILIKE 'epic' OR w.parent_key IS NULL) ${pf}
     ORDER BY degree DESC`,
    params,
  );
  return { nodes: rows.map(toNode), edges: [] as UEdge[] };
}

/** Bir düğümün komşuları: parent, alt-görevler, epic, epic üyeleri, linkler, MR'lar. */
export async function expand(key: string) {
  const selfRows = await query<any>(
    `SELECT w.id, w.key, w.summary, w.type, w.status, w.status_category, w.parent_key, w.epic_key,
            pp.display_name AS assignee, ${DEGREE_SQL} AS degree
     FROM work_items w LEFT JOIN people pp ON pp.id = w.assignee_id WHERE w.key = $1`,
    [key],
  );
  if (selfRows.length === 0) return { nodes: [], edges: [] };
  const self = selfRows[0];
  const nodes: UNode[] = [toNode(self)];
  const edges: UEdge[] = [];
  const seen = new Set<string>([key]);
  const addItem = (r: any, rel: string, from: string, to: string) => {
    if (!seen.has(r.key)) { nodes.push(toNode(r)); seen.add(r.key); }
    edges.push({ source: from, target: to, rel });
  };

  // parent
  if (self.parent_key) {
    const p = await query<any>(`SELECT w.key,w.summary,w.type,w.status,w.status_category,pp.display_name assignee, ${DEGREE_SQL} degree FROM work_items w LEFT JOIN people pp ON pp.id=w.assignee_id WHERE w.key=$1`, [self.parent_key]);
    if (p[0]) addItem(p[0], "parent", p[0].key, key);
  }
  // alt-görevler
  const children = await query<any>(`SELECT w.key,w.summary,w.type,w.status,w.status_category,pp.display_name assignee, ${DEGREE_SQL} degree FROM work_items w LEFT JOIN people pp ON pp.id=w.assignee_id WHERE w.parent_key=$1`, [key]);
  for (const c of children) addItem(c, "alt-görev", key, c.key);
  // epic (üstü)
  if (self.epic_key) {
    const e = await query<any>(`SELECT w.key,w.summary,w.type,w.status,w.status_category,pp.display_name assignee, ${DEGREE_SQL} degree FROM work_items w LEFT JOIN people pp ON pp.id=w.assignee_id WHERE w.key=$1`, [self.epic_key]);
    if (e[0]) addItem(e[0], "epic", e[0].key, key);
  }
  // epic üyeleri (bu bir epic ise)
  const members = await query<any>(`SELECT w.key,w.summary,w.type,w.status,w.status_category,pp.display_name assignee, ${DEGREE_SQL} degree FROM work_items w LEFT JOIN people pp ON pp.id=w.assignee_id WHERE w.epic_key=$1`, [key]);
  for (const mbr of members) addItem(mbr, "epic-üye", key, mbr.key);
  // issue linkleri (iki yön)
  const links = await query<any>(
    `SELECT il.to_key AS other, il.type, 'out' AS dir FROM issue_links il WHERE il.from_key=$1
     UNION ALL SELECT il.from_key AS other, il.type, 'in' AS dir FROM issue_links il WHERE il.to_key=$1`,
    [key],
  );
  const linkKeys = [...new Set(links.map((l: any) => l.other))];
  if (linkKeys.length) {
    const lrows = await query<any>(`SELECT w.key,w.summary,w.type,w.status,w.status_category,pp.display_name assignee, ${DEGREE_SQL} degree FROM work_items w LEFT JOIN people pp ON pp.id=w.assignee_id WHERE w.key = ANY($1)`, [linkKeys]);
    const byKey = new Map(lrows.map((r: any) => [r.key, r]));
    for (const l of links) {
      const r = byKey.get(l.other); if (!r) continue;
      if (l.dir === "out") addItem(r, l.type ?? "link", key, l.other);
      else addItem(r, l.type ?? "link", l.other, key);
    }
  }
  // MR'lar
  const mrs = await query<any>(
    `SELECT m.iid, m.title, m.state, r.path AS repo FROM merge_requests m JOIN repositories r ON r.id=m.repo_id WHERE m.work_item_id=$1`,
    [self.id],
  );
  for (const mr of mrs) {
    const id = `mr:${mr.repo}!${mr.iid}`;
    if (!seen.has(id)) { nodes.push({ id, kind: "mr", label: `!${mr.iid}`, state: mr.state, summary: mr.title }); seen.add(id); }
    edges.push({ source: key, target: id, rel: "MR" });
  }

  return { nodes, edges };
}

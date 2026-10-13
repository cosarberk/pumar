/** Proje listesi (picker) + gerçek knowledge graph (commit katkılarından). */
import { query } from "../db.js";

/** Picker için gerçek Jira projeleri + istatistik. */
export function projectsList() {
  return query<{
    key: string; total: string; wip: string; done: string; people: string; bug_ratio: string | null;
  }>(
    `SELECT jp.key,
            COUNT(w.id)                                               AS total,
            COUNT(*) FILTER (WHERE w.status_category='in_progress')   AS wip,
            COUNT(*) FILTER (WHERE w.status_category='done')          AS done,
            COUNT(DISTINCT w.assignee_id)                            AS people,
            ROUND(100.0 * COUNT(*) FILTER (WHERE w.type ILIKE 'bug' OR w.type ILIKE 'hata')
                  / NULLIF(COUNT(w.id),0), 0)                        AS bug_ratio
     FROM jira_projects jp
     LEFT JOIN work_items w ON w.project_id = jp.id
     GROUP BY jp.key
     HAVING COUNT(w.id) > 0
     ORDER BY total DESC`,
  );
}

/** Katkıcı tablosu: kişi başına dokunduğu repo + MR sayısı (Knowledge dock). */
export function contributors(limit = 60) {
  return query(
    `SELECT p.display_name AS person,
            COUNT(DISTINCT m.repo_id) AS repos,
            COUNT(*)                  AS mrs
     FROM merge_requests m JOIN people p ON p.id = m.author_id
     GROUP BY p.display_name ORDER BY mrs DESC`,
  );
}

/** Gerçek knowledge graph: kişi ↔ repo bağları (MR yazarlığından — commit author_id boş). */
export async function knowledgeGraph() {
  const rows = await query<{ person: string; repo: string; value: string }>(
    `SELECT p.display_name AS person, r.path AS repo, COUNT(*) AS value
     FROM merge_requests m
     JOIN people p ON p.id = m.author_id
     JOIN repositories r ON r.id = m.repo_id
     GROUP BY p.display_name, r.path
     HAVING COUNT(*) >= 1
     ORDER BY value DESC`,
  );
  const persons = new Set<string>(), repos = new Set<string>();
  const links = rows.map((r) => {
    persons.add(r.person); repos.add(r.repo);
    return { source: r.person, target: r.repo, value: Number(r.value) };
  });
  const nodes = [
    ...[...persons].map((id) => ({ id, kind: "person" as const })),
    ...[...repos].map((id) => ({ id, kind: "repo" as const })),
  ];
  return { nodes, links };
}

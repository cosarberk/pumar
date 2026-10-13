/**
 * Liste tipi içgörüler (satır döndürür). View'lar (0002_views.sql) üzerinden.
 * aging ve doneWithoutMr proje-filtreli; bus-factor/review global (repo↔proje bağı yok).
 */
import { query } from "../db.js";

/** In Progress'te en çok çürüyen kartlar. */
export function agingItems(minDays = 3, projectKey?: string, limit = 50) {
  const params: unknown[] = [minDays];
  let proj = "";
  if (projectKey) { params.push(projectKey); proj = `AND jp.key = $${params.length}`; }
  return query(
    `SELECT a.key, a.summary, a.status, p.display_name AS assignee,
            ROUND(a.days_in_status::numeric, 1) AS days
     FROM v_aging_wip a
     LEFT JOIN people p ON p.id = a.assignee_id
     JOIN work_items w ON w.id = a.work_item_id
     LEFT JOIN jira_projects jp ON jp.id = w.project_id
     WHERE a.days_in_status >= $1 ${proj}
     ORDER BY a.days_in_status DESC`,
    params,
  );
}

/** "Done ama merge olmuş MR yok" tutarsızlıkları. */
export function doneWithoutMr(projectKey?: string, limit = 50) {
  const params: unknown[] = [];
  let proj = "";
  if (projectKey) { params.push(projectKey); proj = `AND jp.key = $${params.length}`; }
  return query(
    `SELECT d.key, d.summary, p.display_name AS assignee, d.resolved_at
     FROM v_done_without_mr d
     LEFT JOIN people p ON p.id = d.assignee_id
     JOIN work_items w ON w.id = d.work_item_id
     LEFT JOIN jira_projects jp ON jp.id = w.project_id
     WHERE 1=1 ${proj}
     ORDER BY d.resolved_at DESC NULLS LAST`,
    params,
  );
}

/** Issue'ya bağlanamamış kod (başıboş commit/MR) özeti. */
export function unlinkedCode(limit = 50) {
  return query(
    `SELECT kind, COUNT(*) AS count FROM v_unlinked_code GROUP BY kind ORDER BY count DESC`,
  );
}

/** Bus-factor riski (global) — MR yazarlığına göre repo başına tek kişi payı. */
export function busFactorRisk(limit = 50) {
  return query(
    `WITH contrib AS (
       SELECT m.repo_id, m.author_id, COUNT(*) AS c
       FROM merge_requests m WHERE m.author_id IS NOT NULL
       GROUP BY m.repo_id, m.author_id
     ), ranked AS (
       SELECT repo_id, c,
              SUM(c) OVER (PARTITION BY repo_id) AS total,
              ROW_NUMBER() OVER (PARTITION BY repo_id ORDER BY c DESC) AS rn
       FROM contrib
     )
     SELECT r.path AS repo,
            ROUND(100.0 * ranked.c / NULLIF(ranked.total,0), 0) AS tek_kişi_payı,
            ranked.total AS mr
     FROM ranked JOIN repositories r ON r.id = ranked.repo_id
     WHERE ranked.rn = 1 AND ranked.total >= 3
     ORDER BY tek_kişi_payı DESC`,
  );
}

/**
 * Durumda ortalama bekleme (döngü süresi): her statüye giriş→çıkış arası ort. gün.
 * Ardışık geçişler LEAD ile eşleştirilir; son (açık) durum next_at=NULL olduğu için hariç.
 */
export function cycleByStatus(projectKey?: string) {
  const params: unknown[] = [];
  let proj = "";
  if (projectKey) { params.push(projectKey); proj = `AND jp.key = $${params.length}`; }
  return query(
    `WITH f AS (
       SELECT w.id FROM work_items w
       LEFT JOIN jira_projects jp ON jp.id = w.project_id
       WHERE 1=1 ${proj}
     ), seq AS (
       SELECT t.to_status AS durum, t.at,
              LEAD(t.at) OVER (PARTITION BY t.work_item_id ORDER BY t.at) AS next_at
       FROM work_item_transitions t
       WHERE t.work_item_id IN (SELECT id FROM f)
     )
     SELECT durum,
            ROUND(AVG(EXTRACT(EPOCH FROM (next_at - at)) / 86400.0)::numeric, 1) AS ort_gün,
            COUNT(*) AS geçiş
     FROM seq WHERE next_at IS NOT NULL
     GROUP BY durum ORDER BY ort_gün DESC`,
    params,
  );
}

/**
 * Durum geçişleri (hacim): from→to başına kaç kez. Done → To Do satırı = reopen (yeniden açılan).
 */
export function statusTransitions(projectKey?: string, limit = 12) {
  const params: unknown[] = [];
  let proj = "";
  if (projectKey) { params.push(projectKey); proj = `AND jp.key = $${params.length}`; }
  params.push(limit);
  return query(
    `SELECT (t.from_status || ' → ' || t.to_status) AS geçiş, COUNT(*) AS sayı
     FROM work_item_transitions t
     JOIN work_items w ON w.id = t.work_item_id
     LEFT JOIN jira_projects jp ON jp.id = w.project_id
     WHERE t.from_status IS NOT NULL AND t.from_status <> t.to_status ${proj}
     GROUP BY 1 ORDER BY sayı DESC LIMIT $${params.length}`,
    params,
  );
}

/** En aktif repolar: commit ve MR sayısı (proje geneli). */
export function repoActivity(limit = 15) {
  const params: unknown[] = [limit];
  return query(
    `SELECT r.path AS repo,
            (SELECT COUNT(*) FROM commits c WHERE c.repo_id = r.id)        AS commit,
            (SELECT COUNT(*) FROM merge_requests m WHERE m.repo_id = r.id) AS mr
     FROM repositories r
     ORDER BY commit DESC NULLS LAST LIMIT $1`,
    params,
  );
}

/** Kod aktivite özeti: toplamlar + merge oranı + kod hacmi (gösterge/değer satırları). */
export function codeActivitySummary() {
  return query(
    `WITH m AS (
       SELECT COUNT(*) AS mr_total,
              COUNT(*) FILTER (WHERE merged_at IS NOT NULL) AS mr_merged
       FROM merge_requests
     ), c AS (
       SELECT COUNT(*) AS commit_total,
              COALESCE(SUM(COALESCE(additions,0) + COALESCE(deletions,0)), 0) AS lines_total,
              ROUND(AVG(COALESCE(additions,0) + COALESCE(deletions,0))::numeric, 0) AS avg_commit
       FROM commits
     )
     SELECT 'Toplam commit'                 AS gösterge, c.commit_total::text AS değer FROM c
     UNION ALL SELECT 'Toplam MR',           m.mr_total::text FROM m
     UNION ALL SELECT 'Merge edilen MR',     m.mr_merged::text FROM m
     UNION ALL SELECT 'Merge oranı (%)',     ROUND(100.0 * m.mr_merged / NULLIF(m.mr_total,0), 0)::text FROM m
     UNION ALL SELECT 'Değişen satır (commit)', c.lines_total::text FROM c
     UNION ALL SELECT 'Ort. commit boyutu (satır)', c.avg_commit::text FROM c`,
  );
}

/** Review darboğazı (global). */
export function reviewBottleneck(limit = 50) {
  return query(
    `SELECT r.path AS repo,
            ROUND(AVG(v.first_review_days)::numeric, 1) AS ilk_review,
            ROUND(AVG(v.merge_days)::numeric, 1)        AS merge_days,
            COUNT(*)                                     AS merged
     FROM v_mr_cycle v JOIN repositories r ON r.id = v.repo_id
     WHERE v.state = 'merged'
     GROUP BY r.path
     HAVING COUNT(*) >= 3
     ORDER BY merge_days DESC NULLS LAST`,
  );
}

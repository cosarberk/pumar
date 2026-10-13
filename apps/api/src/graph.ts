/** Value Stream akış verisi — proje-filtreli, gerçek work_items durumlarından. */
import { query } from "@pulse/analytics/db";

export interface Stage { id: string; label: string; count: number }

const LABELS: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };
const ORDER = ["todo", "in_progress", "done"];

/** Statü kategorisi bazında bekleyen iş sayısı (opsiyonel proje filtresi). */
export async function flowStages(projectKey?: string): Promise<Stage[]> {
  const params: unknown[] = [];
  let where = "WHERE w.status_category IS NOT NULL";
  if (projectKey) {
    params.push(projectKey);
    where += ` AND w.project_id = (SELECT id FROM jira_projects WHERE key = $${params.length})`;
  }
  const rows = await query<{ status_category: string; n: string }>(
    `SELECT w.status_category, COUNT(*) AS n FROM work_items w ${where} GROUP BY w.status_category`,
    params,
  );
  return ORDER.map((c) => ({
    id: c, label: LABELS[c] ?? c,
    count: Number(rows.find((r) => r.status_category === c)?.n ?? 0),
  }));
}

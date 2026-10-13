/**
 * Metric Layer kaydı: boyutlar + ölçüler.
 * Rapor motoru yalnızca bu kaydı kompoze eder; yeni metrik = buraya bir satır.
 */
import type { Dimension, Measure } from "./types.js";

export const DIMENSIONS: Record<string, Dimension> = {
  assignee: {
    id: "assignee",
    title: "Kişi",
    selectSql: "COALESCE(pa.display_name, '— atanmamış —')",
    groupBySql: "pa.display_name",
    joinSql: "LEFT JOIN people pa ON pa.id = w.assignee_id",
  },
  sprint: {
    id: "sprint",
    title: "Sprint",
    selectSql: "COALESCE(s.name, '— sprintsiz —')",
    groupBySql: "s.name",
    joinSql: "LEFT JOIN sprints s ON s.id = w.sprint_id",
    // kronolojik: başlangıç tarihine göre (isimler tutarsız — "Sprint 01 - Platform" vs "Sprint 1")
    orderSql: "MIN(s.start_at)",
  },
  project: {
    id: "project",
    title: "Proje",
    selectSql: "COALESCE(jp.key, '—')",
    groupBySql: "jp.key",
    joinSql: "LEFT JOIN jira_projects jp ON jp.id = w.project_id",
  },
  type: {
    id: "type",
    title: "Tür",
    selectSql: "COALESCE(w.type, '—')",
    groupBySql: "w.type",
  },
  status: {
    id: "status",
    title: "Durum",
    selectSql: "COALESCE(w.status, '—')",
    groupBySql: "w.status",
  },
  priority: {
    id: "priority",
    title: "Öncelik",
    selectSql: "COALESCE(w.priority, '—')",
    groupBySql: "w.priority",
  },
};

export const MEASURES: Record<string, Measure> = {
  total: {
    id: "total",
    title: "Toplam iş",
    unit: "adet",
    aggSql: "COUNT(*)",
    betterWhen: "neutral",
  },
  throughput: {
    id: "throughput",
    title: "Teslim (Done)",
    unit: "adet",
    aggSql: "COUNT(*) FILTER (WHERE w.status_category = 'done')",
    betterWhen: "higher",
    rowFilterSql: "w.status_category = 'done'",
  },
  wip: {
    id: "wip",
    title: "WIP (In Progress)",
    unit: "adet",
    aggSql: "COUNT(*) FILTER (WHERE w.status_category = 'in_progress')",
    betterWhen: "lower",
    rowFilterSql: "w.status_category = 'in_progress'",
  },
  bug_count: {
    id: "bug_count",
    title: "Bug sayısı",
    unit: "adet",
    aggSql: "COUNT(*) FILTER (WHERE w.type ILIKE 'bug' OR w.type ILIKE 'hata')",
    betterWhen: "lower",
    rowFilterSql: "(w.type ILIKE 'bug' OR w.type ILIKE 'hata')",
  },
  bug_ratio: {
    id: "bug_ratio",
    title: "Bug/İş oranı",
    unit: "%",
    aggSql:
      "ROUND(100.0 * COUNT(*) FILTER (WHERE w.type ILIKE 'bug' OR w.type ILIKE 'hata') / NULLIF(COUNT(*), 0), 1)",
    betterWhen: "lower",
  },
  total_story_points: {
    id: "total_story_points",
    title: "Toplam story point",
    unit: "sp",
    aggSql: "COALESCE(SUM(w.story_points), 0)",
    betterWhen: "neutral",
  },
  velocity: {
    id: "velocity",
    title: "Teslim SP (velocity)",
    unit: "sp",
    aggSql: "COALESCE(SUM(w.story_points) FILTER (WHERE w.status_category = 'done'), 0)",
    betterWhen: "higher",
    rowFilterSql: "w.status_category = 'done'",
  },
  avg_story_points: {
    id: "avg_story_points",
    title: "Ortalama story point",
    unit: "sp",
    aggSql: "ROUND(AVG(w.story_points)::numeric, 1)",
    betterWhen: "neutral",
  },
  avg_lead_days: {
    id: "avg_lead_days",
    title: "Ortalama lead time",
    unit: "gün",
    aggSql:
      "ROUND(AVG(EXTRACT(EPOCH FROM (w.resolved_at - w.created_at)) / 86400.0) FILTER (WHERE w.resolved_at IS NOT NULL)::numeric, 1)",
    betterWhen: "lower",
    rowFilterSql: "w.resolved_at IS NOT NULL",
  },
};

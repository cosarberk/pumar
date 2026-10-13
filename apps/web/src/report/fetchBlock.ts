import { api, type MetricFilters } from "../api";
import type { Block } from "./types";

/** Bir veri bloğunun canlı verisini çeker (mevcut Metrics/Signals motorları). */
export async function fetchBlock(block: Block, filters: MetricFilters): Promise<any> {
  switch (block.type) {
    case "kpi": {
      const ms = block.measures?.length ? block.measures : block.measure ? [block.measure] : ["total"];
      return Promise.all(ms.map((m) => api.metricData(m, undefined, filters).then((r) => ({ id: m, value: r[0]?.value ?? 0 }))));
    }
    case "callout": {
      const ms = block.measures?.length ? block.measures : block.measure ? [block.measure] : ["total"];
      const vals = await Promise.all(ms.map((m) => api.metricData(m, undefined, filters).then((r) => [m, r[0]?.value ?? 0] as const)));
      return Object.fromEntries(vals);
    }
    case "chart": {
      if (block.chartType === "trend" || block.chartType === "area")
        return block.trendSrc === "mr" ? api.metricMrTrend() : api.metricTrend(filters);
      if (block.chartType === "stacked") return api.metricCrosstab(block.measure ?? "total", block.dimension ?? "assignee", block.col ?? "type", filters);
      return api.metricData(block.measure ?? "total", block.dimension, filters);
    }
    case "table": return block.columns?.length ? api.metricTable(block.dimension ?? "assignee", filters) : null;
    case "pivot": return api.metricCrosstab(block.measure ?? "total", block.dimension ?? "assignee", block.col ?? "type", filters);
    case "signal": return api.insight(block.signalId ?? "aging", filters.project);
    default: return null;
  }
}

/** Bir bloğun config imzası — değişince yeniden çekilir. */
export const blockSig = (b: Block) =>
  JSON.stringify([b.type, b.measure, b.measures, b.dimension, b.col, b.columns, b.signalId, b.chartType, b.trendSrc, b.filter]);

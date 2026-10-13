/**
 * Varsayılan (dolu) rapor — editör açılınca bununla gelir. Düz blok akışı;
 * içerik A4'lere OTOMATİK bölünür, "pagebreak" bölümleri elle ayırır.
 * Veri canlı; global filtre değişince bloklar yeniden dolar.
 */
import type { Catalog } from "../api";
import { uid, type Block, type ReportDoc } from "./types";

export function buildDefaultDoc(project: string, cat: Catalog | null): ReportDoc {
  const ids = new Set((cat?.measures ?? []).map((m) => m.id));
  const keep = (arr: string[]) => arr.filter((x) => ids.has(x));
  const br = (): Block => ({ id: uid(), type: "pagebreak" });

  const blocks: Block[] = [
    { id: uid(), type: "heading", text: `${project} — Proje Raporu`, level: 1, align: "left" },
    { id: uid(), type: "text", text: `Otomatik oluşturulmuş rapor · ${new Date().toLocaleDateString("tr-TR")} · Global filtrelere göre güncellenir.`, align: "left" },
    { id: uid(), type: "kpi", caption: "Özet göstergeler", measures: keep(["total", "throughput", "wip", "bug_count"]) },
    { id: uid(), type: "chart", caption: "Kişi bazında teslim", measure: "throughput", dimension: "assignee", chartType: "bar" },
    br(),
    { id: uid(), type: "heading", text: "Kişi bazında detay", level: 2, align: "left" },
    { id: uid(), type: "table", caption: "Kişi × ölçüler", dimension: "assignee", columns: keep(["total", "throughput", "wip", "bug_count", "bug_ratio", "velocity"]) },
    br(),
    { id: uid(), type: "heading", text: "Tür ve durum kırılımı", level: 2, align: "left" },
    { id: uid(), type: "pivot", caption: "Kişi × Tür (toplam iş)", measure: "total", dimension: "assignee", col: "type" },
    { id: uid(), type: "chart", caption: "Tür bazında bug", measure: "bug_count", dimension: "type", chartType: "bar" },
    br(),
    { id: uid(), type: "heading", text: "Risk sinyalleri", level: 2, align: "left" },
    { id: uid(), type: "signal", caption: "Çürüyen kartlar", signalId: "aging" },
    { id: uid(), type: "signal", caption: "Bus-factor riski", signalId: "bus_factor" },
  ];

  return {
    name: `${project} Raporu`,
    description: "Otomatik oluşturulan rapor — filtreye göre güncellenir.",
    pageSize: "A4", orientation: "portrait", margin: 18, showPageNumbers: true,
    blocks,
  };
}

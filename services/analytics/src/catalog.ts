/**
 * Metrik kataloğu: UI ve rapor motoru "hangi ölçü hangi boyutla kesilebilir"i
 * buradan okur. Böylece PO arayüzde metrik+boyut seçince motor sorguyu kurar.
 */
import { DIMENSIONS, MEASURES } from "./metrics/registry.js";

export function catalog() {
  return {
    dimensions: Object.values(DIMENSIONS).map((d) => ({ id: d.id, title: d.title })),
    measures: Object.values(MEASURES).map((m) => ({
      id: m.id,
      title: m.title,
      unit: m.unit,
      betterWhen: m.betterWhen,
    })),
    insights: [
      { id: "aging", title: "Çürüyen kartlar (aging WIP)" },
      { id: "done_without_mr", title: "Done ama MR yok (tutarsızlık)" },
      { id: "unlinked_code", title: "Issue'suz kod (başıboş commit/MR)" },
      { id: "bus_factor", title: "Bus-factor riski" },
      { id: "review_bottleneck", title: "Review darboğazı" },
    ],
  };
}

/**
 * Semantic / Metric Layer — tipler.
 *
 * Fikir: metrikler ve boyutlar BİR KEZ tanımlanır; dinamik rapor motoru (Faz 4)
 * bunları kompoze ederek "son 3 sprint'in bug/task oranını ekip bazında" gibi
 * sorguları kod yazmadan üretir. Yani bu dosya, raporların "sorgu dili"dir.
 */

/** Gruplama boyutu: SELECT/GROUP BY/JOIN parçalarını üretir. */
export interface Dimension {
  id: string;
  title: string;
  /** Grup etiketi için SELECT ifadesi (ör. pa.display_name). */
  selectSql: string;
  /** GROUP BY ifadesi. */
  groupBySql: string;
  /** Gerekli JOIN (opsiyonel). */
  joinSql?: string;
  /**
   * Mantıksal sıralama ifadesi (ORDER BY). Verilirse boyut değerleri değere göre
   * değil buna göre sıralanır — ör. sprint kronolojik (start_at), öncelik seviye sırası.
   * GROUP BY altında çalışacağı için toplulaştırma (MIN(...) vb.) olmalıdır.
   */
  orderSql?: string;
}

/** Ölçü: work_items (w) üzerinden bir toplulaştırma ifadesi. */
export interface Measure {
  id: string;
  title: string;
  unit: string;
  /** Toplulaştırma SQL'i (ör. COUNT(*) FILTER (WHERE ...)). */
  aggSql: string;
  /** Daha iyi olan yön (rapor/renk mantığı için). */
  betterWhen: "higher" | "lower" | "neutral";
  /** Drill-down için satır düzeyi filtre (bu ölçüye giren kartlar). Yoksa tüm kartlar. */
  rowFilterSql?: string;
}

/** Rapor motorunun çalıştıracağı sorgu isteği. */
export interface QuerySpec {
  measure: string;         // Measure.id
  dimension?: string;      // Dimension.id (yoksa tek satır toplam)
  filters?: {
    sprintKey?: string;
    projectKey?: string;
    type?: string;
    createdFrom?: string;
    createdTo?: string;
  };
  limit?: number;
}

export interface MetricRow {
  group: string;
  value: number | null;
}

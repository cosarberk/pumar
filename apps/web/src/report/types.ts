/**
 * Rapor Stüdyosu — Document modeli (Faz 0: içerik blokları).
 * Document = kaydedilen konfigürasyon (şablon). Veri bloklari Faz 1'de eklenecek.
 */
export type BlockType = "heading" | "text" | "spacer" | "pagebreak" | "toc" | "divider" | "callout" | "image" | "kpi" | "table" | "pivot" | "chart" | "signal";
export const DATA_TYPES: BlockType[] = ["kpi", "table", "pivot", "chart", "signal", "callout"];
export type ChartKind = "bar" | "line" | "area" | "donut" | "hbar" | "stacked" | "trend";
export type Tone = "info" | "good" | "warn" | "bad";
export const isData = (t: BlockType) => DATA_TYPES.includes(t);
/** Satır bazında sayfalar arası bölünebilen bloklar (uzun tablo/sinyal). */
export const isSplittable = (t: BlockType) => t === "table" || t === "signal";

export interface Block {
  id: string;
  type: BlockType;
  text?: string;                       // heading / text içeriği
  level?: 1 | 2 | 3;                   // heading seviyesi
  align?: "left" | "center" | "right";
  size?: number;                       // px (text/heading geçersiz kılma)
  height?: number;                     // spacer (mm)
  hidden?: boolean;                    // outline'dan görünürlük
  breakBefore?: boolean;               // bu bloktan ÖNCE sayfa sonu (yeni sayfada başlat)
  // --- veri blokları ---
  caption?: string;                    // blok başlığı (üstte)
  note?: string;                       // başlık altı açıklama (ne gösterir / neye bakılır)
  src?: string;                        // image — görsel kaynağı (data-URI veya URL)
  measure?: string;                    // pivot / chart ölçüsü
  measures?: string[];                 // kpi — satırdaki ölçü kutuları
  dimension?: string;                  // table / pivot(satır) / chart
  col?: string;                        // pivot (sütun boyutu) / stacked (kırılım boyutu)
  columns?: string[];                  // table — CUSTOM: kullanıcının seçtiği ölçü sütunları (boş=hiç veri)
  chartType?: ChartKind;               // chart
  trendSrc?: "work" | "mr";            // trend/area kaynağı: iş kalemleri (vars.) / merge request'ler
  signalId?: string;                   // signal
  signalView?: "summary" | "table";    // raporda sinyal gösterimi: özet grafik (vars.) / ham tablo
  tone?: Tone;                         // callout / divider rengi
  span?: "full" | "half";             // yerleşim: tam genişlik / yarım (yan yana)
  hideIfEmpty?: boolean;               // koşullu: veri boşsa bloğu gizle
  filter?: { sprint?: string; type?: string; from?: string; to?: string }; // blok başına global filtre ezme
  pos?: { page: number; x: number; y: number; w: number; h: number; z?: number }; // SERBEST konum (mm) — varsa akıştan çıkar
}

export type PageSize = "A4" | "A3" | "Letter";
export type Orientation = "portrait" | "landscape";

/** Düz blok akışı — sayfalara OTOMATİK bölünür (yüksekliğe göre). "pagebreak" = elle sayfa sonu. */
export interface ReportTheme {
  accent?: string;                     // vurgu rengi (#hex)
  font?: "sans" | "serif" | "mono";    // gövde yazı tipi
  paper?: string;                      // kağıt arka plan (#hex)
}

export interface ReportDoc {
  name: string;
  description: string;
  pageSize: PageSize;
  orientation: Orientation;
  margin: number;                      // mm (tüm kenarlar)
  showPageNumbers: boolean;
  header?: string;                     // üst bilgi (token destekli)
  footer?: string;                     // alt bilgi (token destekli)
  cover?: boolean;                     // kapak sayfası
  coverSubtitle?: string;
  watermark?: string;                  // filigran metni (TASLAK vb.)
  theme?: ReportTheme;
  blocks: Block[];
}

/** Token değişimi: {{proje}} {{tarih}} {{sayfa}} {{toplamSayfa}} {{raporAdı}} */
export function applyTokens(s: string, ctx: { project: string; name: string; page: number; pages: number }): string {
  return (s ?? "")
    .replace(/\{\{\s*proje\s*\}\}/gi, ctx.project)
    .replace(/\{\{\s*rapor(Adı|adi)?\s*\}\}/gi, ctx.name)
    .replace(/\{\{\s*tarih\s*\}\}/gi, new Date().toLocaleDateString("tr-TR"))
    .replace(/\{\{\s*sayfa\s*\}\}/gi, String(ctx.page))
    .replace(/\{\{\s*toplam(Sayfa)?\s*\}\}/gi, String(ctx.pages));
}

/** mm cinsinden sayfa boyutları (portre). */
export const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 216, h: 279 },
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyDoc(name = "Yeni Rapor"): ReportDoc {
  return { name, description: "", pageSize: "A4", orientation: "portrait", margin: 20, showPageNumbers: true, blocks: [] };
}

export function newBlock(type: BlockType): Block {
  if (type === "heading") return { id: uid(), type, text: "Başlık", level: 1, align: "left" };
  if (type === "text") return { id: uid(), type, text: "Metin buraya… (sağ panelden düzenle)", align: "left" };
  if (type === "pagebreak") return { id: uid(), type };
  if (type === "divider") return { id: uid(), type, text: "Bölüm", caption: "", tone: "info" };
  if (type === "callout") return { id: uid(), type, tone: "info", text: "Bu dönemde {{total}} iş kaydı var; {{bug_count}} tanesi hata.", measures: ["total", "bug_count"] };
  if (type === "toc") return { id: uid(), type, caption: "İçindekiler" };
  if (type === "image") return { id: uid(), type, align: "center" };
  if (type === "kpi") return { id: uid(), type, caption: "", measures: ["throughput"] };
  if (type === "table") return { id: uid(), type, caption: "Tablo", dimension: "assignee", columns: [] };
  if (type === "pivot") return { id: uid(), type, caption: "Çapraz pivot", measure: "total", dimension: "assignee", col: "type" };
  if (type === "chart") return { id: uid(), type, caption: "Grafik", measure: "throughput", dimension: "assignee", chartType: "bar" };
  if (type === "signal") return { id: uid(), type, caption: "", signalId: "aging" };
  return { id: uid(), type: "spacer", height: 12 };
}

export const SIGNAL_LABELS: Record<string, string> = {
  aging: "Çürüyen kartlar", done_without_mr: "Done ama MR yok", bus_factor: "Bus-factor riski",
  review_bottleneck: "Review darboğazı", unlinked_code: "Issue'suz kod",
  cycle_by_status: "Durumda ortalama bekleme", status_transitions: "Durum geçişleri (hacim)",
  repo_activity: "En aktif repolar", code_activity: "Kod aktivite özeti",
};

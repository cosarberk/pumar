/**
 * Hazır rapor şablonları — her biri (project, cat) alıp canlı veriyle dolan
 * tam bir ReportDoc üretir. "Yeni" modalındaki galeri bunları listeler.
 * Şablon = KONFİGÜRASYON; veri editörde canlı çekilir, filtreyle güncellenir.
 */
import type { Catalog } from "../api";
import { uid, type Block, type ReportDoc, type Tone, type ChartKind } from "./types";

type B = Partial<Block> & { type: Block["type"] };
const mk = (b: B): Block => ({ id: uid(), ...b } as Block);
const br = (): Block => mk({ type: "pagebreak" });

export interface ReportTemplate {
  id: string;
  name: string;
  desc: string;
  icon: string;          // Reports.tsx Icon adı
  pages: string;         // tahmini kapsam (metin)
  build(project: string, cat: Catalog | null): ReportDoc;
}

/** Yardımcılar — var olmayan ölçüleri eler, dimension'lar registry'de sabit. */
const has = (cat: Catalog | null, id: string) => (cat?.measures ?? []).some((m) => m.id === id);
const keep = (cat: Catalog | null, arr: string[]) => arr.filter((x) => has(cat, x));

const divider = (eyebrow: string, title: string, tone: Tone = "info"): Block =>
  mk({ type: "divider", caption: eyebrow, text: title, tone });
const heading = (text: string, level: 1 | 2 | 3 = 2): Block => mk({ type: "heading", text, level });
const callout = (text: string, measures: string[], tone: Tone = "info"): Block =>
  mk({ type: "callout", text, measures, tone });
const chart = (caption: string, chartType: ChartKind, measure: string, dimension?: string, note?: string, extra: Partial<Block> = {}): Block =>
  mk({ type: "chart", caption, chartType, measure, dimension, note, ...extra });
const kpi = (caption: string, measures: string[], note?: string): Block => mk({ type: "kpi", caption, measures, note });
const pivot = (caption: string, measure: string, dimension: string, col: string, note?: string): Block =>
  mk({ type: "pivot", caption, measure, dimension, col, note });
const signal = (caption: string, signalId: string, note?: string): Block => mk({ type: "signal", caption, signalId, note, hideIfEmpty: false });
const half = (b: Block): Block => ({ ...b, span: "half" });

const baseDoc = (name: string, description: string, blocks: Block[]): ReportDoc => ({
  name, description,
  pageSize: "A4", orientation: "portrait", margin: 18, showPageNumbers: true,
  cover: true, coverSubtitle: description,
  header: "{{raporAdı}} · {{proje}}", footer: "Pulse · {{tarih}}",
  theme: { accent: "#c99a3b", font: "sans" },
  blocks,
});

/* ───────────────────────── TÜM PROJE RAPORU ───────────────────────── */
function buildFullProject(project: string, cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    mk({ type: "toc", caption: "İçindekiler" }),
    br(),
    // Yoğunlaştırma: bölümler arası zorunlu sayfa sonu YOK; ayraçlar ayrımı korur,
    // içerik sayfaları doldurur (başlıklar sayfa dibinde yalnız kalmaz — keep-with-next).

    // 01 — Yönetici Özeti
    divider("01 · GENEL DURUM", "Yönetici Özeti"),
    kpi("Özet göstergeler", keep(cat, ["total", "throughput", "wip", "velocity", "bug_ratio", "avg_lead_days"]),
      "Projenin tek bakışta sağlık panosu. Yüksek WIP (aynı anda çok açık iş) ve yüksek ortalama lead time birlikte görülüyorsa akışta darboğaz var demektir."),
    callout("Projede toplam {{total}} iş kaydı var; {{throughput}} tanesi tamamlandı, {{wip}} tanesi şu an devam ediyor. Teslim edilen story point (velocity): {{velocity}}.", ["total", "throughput", "wip", "velocity"], "good"),
    callout("Toplam {{bug_count}} hata kaydı bulunuyor; bu iş hacminin yaklaşık %{{bug_ratio}}'sine denk geliyor. Ortalama teslim süresi (lead time) {{avg_lead_days}} gün.", ["bug_count", "bug_ratio", "avg_lead_days"], "warn"),
    half(chart("Durum dağılımı", "donut", "total", "status",
      "İşlerin yaşam döngüsündeki dağılımı. 'Done' payının büyük, 'To Do' yığılmasının küçük olması beklenir; iri 'In Progress' dilimi aşırı eşzamanlı işe (WIP şişmesi) işaret eder.")),
    half(chart("Tür dağılımı", "donut", "total", "type",
      "İş kalemlerinin türe göre kırılımı. Hata diliminin büyüklüğü kalite yükünü, Alt görev oranı planlama granülasyonunu gösterir.")),
    // 02 — Teslim & Akış  (trend bu bölüme özgü — özetten çıkarıldı)
    divider("02 · AKIŞ", "Teslim & Akış Performansı"),
    callout("Aşağıdaki akış grafiği, her ay açılan ve çözülen iş sayısını ve biriken backlog'u gösterir. Çözülen çizgisi açılanın altında kaldıkça backlog büyür.", [], "info"),
    chart("Teslim akışı — aylık açılan / çözülen / biriken backlog", "trend", "throughput", undefined,
      "Her ay açılan (yeni) ve çözülen (kapanan) iş ile biriken backlog. Çözülen çizgisi sürekli açılanın altında kalırsa backlog alanı büyür — kapasite yetersizliğinin erken sinyalidir. Backlog eğrisinin eğimine bakın."),
    half(chart("Sprint bazında ortalama lead time (gün)", "bar", "avg_lead_days", "sprint",
      "Bir işin açılıştan teslime ortalama süresi, sprint bazında. Düşük ve istikrarlı olması iyidir; ani sıçrama o sprintte takılan/bekleyen işe işaret eder.")),
    half(chart("Kişi bazında WIP", "hbar", "wip", "assignee",
      "Kişi başına şu an devam eden (In Progress) iş sayısı. Tek kişide çok sayıda açık iş bölünmüş dikkat ve gecikme riskidir; dengeli dağılım hedeflenir.")),
    // 03 — Sprint Performansı
    divider("03 · SPRINT", "Sprint Performansı"),
    chart("Sprint bazında teslim SP (velocity)", "bar", "velocity", "sprint",
      "Sprint başına teslim edilen story point — takımın gerçek kapasitesi. Sonraki sprint planını son sprintlerin ortalamasına göre yapın; istikrar tahmin edilebilirlik demektir. (Sprintler kronolojik sıralı.)"),
    chart("Sprint × durum kırılımı (yığılmış)", "stacked", "total", "sprint",
      "Her sprintteki işlerin durum kırılımı. Son sprintlere doğru 'Done' payının artması sağlıklı kapanıştır; 'To Do'nun taşması sprint hedefinin tutmadığını gösterir.",
      { col: "status" }),
    pivot("Sprint × Tür — iş adedi", "total", "sprint", "type",
      "Sprint × tür matrisi: her sprintte hangi tür işin ne kadar yer aldığı. Belirli sprintlerde Hata yoğunlaşması kalite dalgalarını, Story ağırlığı özellik odağını gösterir."),
    // 04 — Backlog & Öncelik
    divider("04 · BACKLOG", "Backlog & Öncelik Dağılımı"),
    half(chart("Öncelik dağılımı", "donut", "total", "priority",
      "Açık işlerin öncelik dağılımı. 'Highest/High' payının yüksekliği risk baskısıdır; neredeyse her şeyin 'Medium' olması önceliklendirmenin yapılmadığına işaret olabilir.")),
    half(chart("Önceliğe göre iş (sıralı)", "hbar", "total", "priority",
      "Donut'un sayısal karşılığı: her öncelik seviyesinde ne kadar yük biriktiğini net okutur.")),
    pivot("Durum × Tür matrisi", "total", "status", "type",
      "Hangi tür işin hangi aşamada takıldığını gösterir. Örneğin 'To Do'daki Hata birikimi, giderilmemiş kusur borcudur."),
    signal("Çürüyen kartlar (uzun süredir hareketsiz)", "aging",
      "Uzun süredir durum değiştirmemiş kartlar, kişi bazında. Unutulmuş veya tıkanmış işi ortaya çıkarır; sprint planlamasında kapatılmalı ya da yeniden önceliklendirilmelidir."),
    // 05 — Kalite / Hata
    divider("05 · KALİTE", "Kalite & Hata Analizi", "bad"),
    kpi("Hata göstergeleri", keep(cat, ["bug_count", "bug_ratio"]),
      "Hata hacmi ve iş hacmine oranı. Oranın zamanla düşmesi beklenir; yükseliş teknik borç veya yetersiz test kapsamına işaret eder."),
    callout("Hata oranı %{{bug_ratio}} seviyesinde. Toplam {{bug_count}} hata kaydı mevcut. Aşağıda hataların duruma, önceliğe ve kişiye dağılımı yer alıyor.", ["bug_count", "bug_ratio"], "bad"),
    half({ ...chart("Hata — durum dağılımı", "donut", "total", "status",
      "Yalnızca hata kayıtlarının durum dağılımı. Açık (To Do/In Progress) hata payının yüksekliği giderilmemiş kusur yükünü gösterir."), filter: { type: "Hata" } }),
    half({ ...chart("Hata — öncelik dağılımı", "hbar", "total", "priority",
      "Hataların öncelik dağılımı. 'Highest/High' hatalar acil müdahale gereken kusurlardır."), filter: { type: "Hata" } }),
    chart("Kişi bazında hata sayısı", "hbar", "bug_count", "assignee",
      "Kişi bazında hata sayısı. 'Suçlu' aramak için değil; hata yoğun alanları (karmaşık modül, yeni alan) ve ek gözden geçirme ihtiyacını saptamak için okunur."),
    // 06 — Takım & Katkı  (üstüne 3 boşluk: bölümü aşağı it)
    mk({ type: "spacer", height: 12 }),
    mk({ type: "spacer", height: 12 }),
    mk({ type: "spacer", height: 12 }),
    divider("06 · TAKIM", "Takım & Katkı"),
    chart("Kişi bazında teslim (throughput)", "hbar", "throughput", "assignee",
      "Kişi bazında teslim edilen (Done) iş adedi. Katkı dağılımını gösterir; tek kişiye aşırı bağımlılık veya atıl kapasite burada görünür."),
    chart("Kişi bazında teslim SP (velocity)", "hbar", "velocity", "assignee",
      "Adet yerine 'büyüklük' olarak katkı: teslim edilen story point. Büyük işleri taşıyan kişileri ortaya çıkarır."),
    pivot("Kişi × Tür — toplam iş", "total", "assignee", "type",
      "Kimin ağırlıkla hangi tür işi yaptığı. Belirli kişilerde Hata yoğunlaşması uzmanlık alanını ya da bir darboğazı gösterir."),
    mk({ type: "table", caption: "Kişi performans tablosu", dimension: "assignee",
      note: "Her kişi için toplam iş, teslim, WIP, hata, teslim SP ve ortalama lead time bir arada. Yüksek WIP + yüksek lead time birlikteyse o kişi tıkanmış demektir.",
      columns: keep(cat, ["total", "throughput", "wip", "bug_count", "velocity", "avg_lead_days"]) }),
    signal("Bus-factor riski — tek kişiye bağlı alanlar", "bus_factor",
      "Tek kişiye bağlı repo/alanlar — o kişi ayrılırsa bilgi kaybı riski ('bus-factor'). 'tek_kişi_payı' yüksek repolar eşli çalışma ve kod gözden geçirme ile dağıtılmalı."),
    // 07 — Kod & Geliştirme
    divider("07 · KOD", "Kod & Geliştirme Sinyalleri"),
    callout("Bu bölüm kod tarafındaki risk sinyallerini özetler: issue'ya bağlanmamış kod, review darboğazı ve kod üretmeden 'done' işaretlenen kartlar.", [], "info"),
    signal("Issue'suz kod (MR ↔ kart bağı yok)", "unlinked_code",
      "Hiçbir Jira kartına bağlanmamış commit/MR sayısı. İzlenebilirlik açığıdır — neyin neden değiştiği sonradan takip edilemez. Commit/MR başlıklarına kart anahtarı yazılmalı."),
    signal("Review darboğazı", "review_bottleneck",
      "Repo bazında ilk review ve merge süreleri + merge edilen MR sayısı. 'merge_days' yüksek repolar kod gözden geçirmenin tıkandığı yerlerdir; bekleyen MR'lar hatırlatılmalı."),
    signal("Done ama MR yok", "done_without_mr",
      "'Done' işaretlenmiş ama ilişkili MR'ı bulunmayan kartlar, kişi bazında. Çoğunlukla kart↔MR bağının kurulmadığını (zayıf izlenebilirlik) gösterir; doğrudan bir kalite sorunu değildir."),

    // 08 — Döngü Süresi & Akış (changelog / durum geçişleri)
    divider("08 · DÖNGÜ", "Döngü Süresi & Akış Verimliliği"),
    callout("Bu bölüm kartların durumlar arası gerçek hareketini (changelog) analiz eder: her durumda ne kadar beklendiği ve hangi geçişlerin ne sıklıkta yapıldığı. İdeal akış tek yönlüdür; geriye dönüşler (ör. Done → To Do) yeniden iş demektir.", [], "info"),
    signal("Durumda ortalama bekleme (gün)", "cycle_by_status",
      "Bir kartın her durumda geçirdiği ortalama süre. 'In Progress' veya 'In Review' süresinin yüksekliği darboğazın nerede olduğunu gösterir; backlog bekleme süresi akış dışıdır."),
    signal("Durum geçişleri — hacim", "status_transitions",
      "Hangi geçişin kaç kez yapıldığı. İleri geçişler (To Do → In Progress → In Review → Done) sağlıklıdır. 'Done → To Do' satırı yeniden açılan (reopen) kartlardır — yüksekse kabul/kalite kriterleri gözden geçirilmeli."),

    // 09 — Kod & MR Aktivitesi (merge_requests + commits)
    divider("09 · AKTİVİTE", "Kod & MR Aktivitesi"),
    callout("Jira tarafının yanında GitLab tarafı: aylık MR akışı, en aktif repolar ve genel kod hacmi. Bu veriler kartlardan bağımsız, doğrudan depo aktivitesini yansıtır.", [], "info"),
    chart("Aylık MR akışı — açılan / merge edilen / açık birikim", "trend", "throughput", undefined,
      "Her ay açılan ve merge edilen MR ile açık MR birikimi. Merge çizgisi açılanın gerisinde kalırsa açık MR yığılır — review kapasitesi darboğazıdır. (Proje geneli.)",
      { trendSrc: "mr" }),
    signal("En aktif repolar — commit & MR", "repo_activity",
      "Commit ve MR sayısına göre en hareketli depolar. Aktivitenin birkaç repoda toplanması mimari yoğunlaşmayı; çok sayıda düşük-aktif repo ise dağınıklığı gösterebilir."),
    signal("Kod aktivite özeti", "code_activity",
      "Toplam commit/MR, merge oranı ve ortalama MR boyutu. Düşük merge oranı açıkta kalan/iptal edilen çok MR'a; çok büyük ortalama MR boyutu ise gözden geçirmesi zor, riskli değişikliklere işaret eder."),

    // 10 — Riskler & Aksiyon Önerileri (sinyaller tekrarlanmaz; bölümlere referanslı özet)
    divider("10 · RİSK", "Riskler & Aksiyon Önerileri", "warn"),
    callout("Aşağıdaki başlıklar, raporun ilgili bölümlerinde tespit edilen risklerin özeti ve önerilen aksiyonlardır. Her madde ilgili bölüme referans verir.", [], "info"),
    callout("Backlog sağlığı — Uzun süredir hareketsiz çürüyen kartlar sprint planlamasında gözden geçirilmeli; artık geçerli olmayan kayıtlar kapatılmalı veya arşivlenmeli. (bkz. 04 · Backlog)", [], "warn"),
    callout("Bilgi yoğunlaşması — Tek kişiye bağlı repo ve alanlar bus-factor riski taşır; eşli çalışma ve düzenli kod gözden geçirme ile bilgi takıma dağıtılmalı. (bkz. 06 · Takım)", [], "warn"),
    callout("Kod izlenebilirliği — Kart ↔ MR bağı kurulamayan teslimlerde kök-neden takibi zorlaşır; commit ve MR başlıklarına Jira anahtarı yazılmalı, review darboğazları MR sahiplerine hatırlatılmalı. (bkz. 07 · Kod)", [], "bad"),
    callout("Kalite — Hata oranı %{{bug_ratio}} seviyesinde; hata yoğun alanlarda önleyici gözden geçirme ve test kapsamı artırılmalı. (bkz. 05 · Kalite)", ["bug_ratio"], "bad"),
  ];
  return baseDoc(`${project} — Tüm Proje Raporu`, "Birleşik proje, akış ve kalite analizi", blocks);
}

/* ───────────────────────── YÖNETİCİ ÖZETİ ───────────────────────── */
function buildExec(project: string, cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    divider("ÖZET", "Yönetici Özeti"),
    kpi("Projenin nabzı", keep(cat, ["total", "throughput", "wip", "velocity", "bug_ratio", "avg_lead_days"]),
      "Tek bakışta sağlık panosu. Yüksek WIP + yüksek lead time birlikteyse akışta darboğaz vardır; artan hata oranı kalite baskısıdır."),
    callout("Toplam {{total}} iş kaydının {{throughput}} tanesi tamamlandı, {{wip}} tanesi devam ediyor; teslim edilen story point {{velocity}}.", ["total", "throughput", "wip", "velocity"], "good"),
    callout("Toplam {{bug_count}} hata (iş hacminin ~%{{bug_ratio}}'si), ortalama teslim süresi {{avg_lead_days}} gün.", ["bug_count", "bug_ratio", "avg_lead_days"], "warn"),
    half(chart("Durum dağılımı", "donut", "total", "status",
      "'Done' payı büyük, 'To Do' yığılması küçük olmalı; iri 'In Progress' WIP şişmesidir.")),
    half(chart("Tür dağılımı", "donut", "total", "type",
      "Hata diliminin büyüklüğü kalite yükünü gösterir.")),
    chart("Teslim akışı — aylık açılan / çözülen / biriken backlog", "trend", "throughput", undefined,
      "Çözülen çizgisi sürekli açılanın altında kalırsa backlog büyür — kapasite sinyali."),
    divider("AKSİYON", "Öne Çıkan Riskler", "warn"),
    callout("Çürüyen kartlar sprint planında gözden geçirilmeli; bus-factor yüksek repolar bilgi paylaşımıyla dağıtılmalı; hata yoğun alanlarda önleyici gözden geçirme artırılmalı.", [], "warn"),
  ];
  return baseDoc(`${project} — Yönetici Özeti`, "Liderlik için tek sayfalık durum özeti", blocks);
}

/* ───────────────────────── SPRINT RAPORU ───────────────────────── */
function buildSprint(project: string, cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    divider("SPRINT", "Sprint Performansı"),
    kpi("Sprint göstergeleri", keep(cat, ["velocity", "throughput", "wip", "avg_lead_days"]),
      "Teslim edilen story point (velocity), tamamlanan iş, devam eden iş ve ortalama teslim süresi."),
    callout("Aşağıdaki grafikler sprint bazında teslim kapasitesini ve durum kırılımını gösterir. Sprintler kronolojik (başlangıç tarihine göre) sıralı.", [], "info"),
    chart("Sprint bazında teslim SP (velocity)", "bar", "velocity", "sprint",
      "Takımın gerçek kapasitesi. Sonraki sprint planını son sprintlerin ortalamasına göre yap; istikrar tahmin edilebilirliktir."),
    chart("Sprint × durum kırılımı (yığılmış)", "stacked", "total", "sprint",
      "Son sprintlere doğru 'Done' payının artması sağlıklı kapanıştır; 'To Do' taşması hedefin tutmadığını gösterir.",
      { col: "status" }),
    half(chart("Sprint bazında ortalama lead time (gün)", "bar", "avg_lead_days", "sprint",
      "Ani sıçrama o sprintte takılan işe işaret eder.")),
    half(chart("Sprint bazında teslim (adet)", "bar", "throughput", "sprint",
      "Story point yerine adet olarak teslim hacmi.")),
    pivot("Sprint × Tür — iş adedi", "total", "sprint", "type",
      "Belirli sprintlerde Hata yoğunlaşması kalite dalgalarını, Story ağırlığı özellik odağını gösterir."),
    signal("Sprintte takılan / çürüyen kartlar", "aging",
      "Uzun süredir hareketsiz kartlar; sprint planlamasında kapatılmalı ya da yeniden önceliklendirilmelidir."),
  ];
  return baseDoc(`${project} — Sprint Raporu`, "Sprint bazında teslim kapasitesi ve sağlığı", blocks);
}

/* ───────────────────────── BACKLOG & ÖNCELİK ───────────────────────── */
function buildBacklog(project: string, cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    divider("BACKLOG", "Backlog & Öncelik Dağılımı"),
    kpi("Backlog göstergeleri", keep(cat, ["total", "wip", "throughput"]),
      "Toplam iş, devam eden (WIP) ve tamamlanan. Büyük açık backlog + düşük throughput birikme riskidir."),
    callout("Aşağıda açık işlerin önceliğe ve türe göre dağılımı, hangi tür işin hangi aşamada takıldığı ve uzun süredir bekleyen kartlar yer alır.", [], "info"),
    half(chart("Öncelik dağılımı", "donut", "total", "priority",
      "'Highest/High' payının yüksekliği risk baskısıdır; her şeyin 'Medium' olması önceliklendirme yapılmadığına işarettir.")),
    half(chart("Önceliğe göre iş (sıralı)", "hbar", "total", "priority",
      "Donut'un sayısal karşılığı.")),
    pivot("Durum × Tür matrisi", "total", "status", "type",
      "'To Do'daki Hata birikimi giderilmemiş kusur borcudur."),
    chart("Duruma göre iş dağılımı", "hbar", "total", "status",
      "Hangi aşamada ne kadar iş birikmiş; 'To Do'/'Backlog' yığılması planlama yükünü gösterir."),
    signal("Çürüyen kartlar (uzun süredir hareketsiz)", "aging",
      "Unutulmuş veya tıkanmış işi ortaya çıkarır; kapatılmalı ya da yeniden önceliklendirilmelidir."),
  ];
  return baseDoc(`${project} — Backlog Raporu`, "Backlog sağlığı, öncelik ve yığılma analizi", blocks);
}

/* ───────────────────────── KALİTE & HATA ───────────────────────── */
function buildQuality(project: string, cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    divider("KALİTE", "Kalite & Hata Analizi", "bad"),
    kpi("Kalite göstergeleri", keep(cat, ["bug_count", "bug_ratio", "total"]),
      "Hata hacmi ve iş hacmine oranı. Oranın zamanla düşmesi beklenir; yükseliş teknik borç veya yetersiz test kapsamıdır."),
    callout("Hata oranı %{{bug_ratio}} seviyesinde, toplam {{bug_count}} hata kaydı. Aşağıda hataların duruma, önceliğe, kişiye ve sprinte dağılımı var.", ["bug_count", "bug_ratio"], "bad"),
    half({ ...chart("Hata — durum dağılımı", "donut", "total", "status",
      "Açık (To Do/In Progress) hata payının yüksekliği giderilmemiş kusur yüküdür."), filter: { type: "Hata" } }),
    half({ ...chart("Hata — öncelik dağılımı", "hbar", "total", "priority",
      "'Highest/High' hatalar acil müdahale gereken kusurlardır."), filter: { type: "Hata" } }),
    chart("Kişi bazında hata sayısı", "hbar", "bug_count", "assignee",
      "'Suçlu' aramak için değil; hata yoğun alanları ve ek gözden geçirme ihtiyacını saptamak için."),
    chart("Sprint bazında hata sayısı", "bar", "bug_count", "sprint",
      "Hata üretiminin sprintlere göre seyri; belirli sprintlerde sıçrama kalite dalgasıdır."),
    signal("Review darboğazı", "review_bottleneck",
      "Merge süresi yüksek repolar kod gözden geçirmenin tıkandığı yerlerdir — kalitenin geciktiği noktalar."),
    signal("Done ama MR yok", "done_without_mr",
      "'Done' işaretli ama MR'ı olmayan kartlar; çoğunlukla izlenebilirlik açığıdır, doğrudan kalite sorunu değildir."),
  ];
  return baseDoc(`${project} — Kalite Raporu`, "Hata dağılımı, yoğunluk ve kod kalitesi sinyalleri", blocks);
}

/* ───────────────────────── AKIŞ & DÖNGÜ ───────────────────────── */
function buildFlow(project: string, cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    divider("AKIŞ", "Teslim Akışı & Döngü Süresi"),
    callout("Bu rapor işin sisteme giriş→çıkış akışını ve durumlar arası gerçek hareketini (changelog) analiz eder.", [], "info"),
    chart("Teslim akışı — aylık açılan / çözülen / biriken backlog", "trend", "throughput", undefined,
      "Çözülen çizgisi sürekli açılanın altında kalırsa backlog alanı büyür — kapasite yetersizliğinin erken sinyali."),
    half(chart("Sprint bazında ortalama lead time (gün)", "bar", "avg_lead_days", "sprint",
      "Açılıştan teslime ortalama süre; düşük ve istikrarlı olması iyidir.")),
    half(chart("Kişi bazında WIP", "hbar", "wip", "assignee",
      "Tek kişide çok açık iş, bölünmüş dikkat ve gecikme riskidir.")),
    divider("DÖNGÜ", "Durum Geçişleri & Döngü Süresi"),
    signal("Durumda ortalama bekleme (gün)", "cycle_by_status",
      "Bir kartın her durumda geçirdiği ortalama süre. 'In Progress' / 'In Review' yüksekliği darboğazın yerini gösterir."),
    signal("Durum geçişleri — hacim", "status_transitions",
      "İleri geçişler sağlıklıdır. 'Done → To Do' satırı yeniden açılan (reopen) kartlardır — yüksekse kabul kriterleri gözden geçirilmeli."),
  ];
  return baseDoc(`${project} — Akış Raporu`, "Teslim akışı, lead time ve döngü süresi analizi", blocks);
}

/* ───────────────────────── TAKIM & KATKI ───────────────────────── */
function buildTeam(project: string, cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    divider("TAKIM", "Takım & Katkı"),
    callout("Katkı dağılımı adet ve büyüklük (story point) olarak; kimin ne tür işi yaptığı ve kişi başına yük. Amaç kıyas değil denge ve risk görünürlüğü.", [], "info"),
    chart("Kişi bazında teslim (throughput)", "hbar", "throughput", "assignee",
      "Teslim edilen (Done) iş adedi. Tek kişiye aşırı bağımlılık veya atıl kapasite burada görünür."),
    chart("Kişi bazında teslim SP (velocity)", "hbar", "velocity", "assignee",
      "Adet yerine büyüklük olarak katkı; büyük işleri taşıyan kişileri ortaya çıkarır."),
    chart("Kişi bazında WIP", "hbar", "wip", "assignee",
      "Şu an devam eden iş; tek kişide yığılma gecikme riskidir."),
    pivot("Kişi × Tür — toplam iş", "total", "assignee", "type",
      "Kimin ağırlıkla hangi tür işi yaptığı; belirli kişilerde Hata yoğunlaşması uzmanlık/darboğaz işaretidir."),
    mk({ type: "table", caption: "Kişi performans tablosu", dimension: "assignee",
      note: "Her kişi için toplam iş, teslim, WIP, hata, teslim SP ve ortalama lead time bir arada. Yüksek WIP + yüksek lead time birlikteyse o kişi tıkanmış demektir.",
      columns: keep(cat, ["total", "throughput", "wip", "bug_count", "velocity", "avg_lead_days"]) }),
    signal("Bus-factor riski — tek kişiye bağlı alanlar", "bus_factor",
      "Tek kişiye bağlı repolar; eşli çalışma ve kod gözden geçirme ile bilgi dağıtılmalı."),
  ];
  return baseDoc(`${project} — Takım Raporu`, "Kişi bazında katkı, yük dengesi ve bilgi riski", blocks);
}

/* ───────────────────────── KOD & MR ───────────────────────── */
function buildCode(project: string, _cat: Catalog | null): ReportDoc {
  const blocks: Block[] = [
    divider("AKTİVİTE", "Kod & MR Aktivitesi"),
    callout("GitLab tarafı: aylık MR akışı, en aktif repolar ve kod hacmi. Veriler kartlardan bağımsız, doğrudan depo aktivitesini yansıtır (proje geneli).", [], "info"),
    chart("Aylık MR akışı — açılan / merge edilen / açık birikim", "trend", "throughput", undefined,
      "Merge çizgisi açılanın gerisinde kalırsa açık MR yığılır — review kapasitesi darboğazı.",
      { trendSrc: "mr" }),
    signal("En aktif repolar — commit & MR", "repo_activity",
      "Aktivitenin birkaç repoda toplanması mimari yoğunlaşmayı, çok sayıda düşük-aktif repo dağınıklığı gösterebilir."),
    signal("Kod aktivite özeti", "code_activity",
      "Toplam commit/MR, merge oranı ve kod hacmi. Düşük merge oranı açıkta kalan MR'a işaret eder."),
    divider("RİSK", "Kod Riskleri", "warn"),
    signal("Issue'suz kod (MR ↔ kart bağı yok)", "unlinked_code",
      "Hiçbir karta bağlanmamış commit/MR; izlenebilirlik açığıdır. Commit/MR başlıklarına kart anahtarı yazılmalı."),
    signal("Review darboğazı", "review_bottleneck",
      "Merge süresi yüksek repolar; bekleyen MR'lar sahiplerine hatırlatılmalı."),
    signal("Done ama MR yok", "done_without_mr",
      "'Done' ama MR'ı olmayan kartlar; kart↔MR bağının kurulmadığını gösterir."),
  ];
  return baseDoc(`${project} — Kod & MR Raporu`, "GitLab aktivitesi, repo yoğunluğu ve kod riskleri", blocks);
}

export const TEMPLATES: ReportTemplate[] = [
  {
    id: "full",
    name: "Tüm Proje Raporu",
    desc: "Kapak, içindekiler ve 10 bölüm: genel durum, akış, sprint, backlog, kalite, takım, kod, döngü süresi, kod/MR aktivitesi ve riskler. Kapsamlı yönetim raporu.",
    icon: "report",
    pages: "~12–16 sayfa",
    build: buildFullProject,
  },
  {
    id: "exec",
    name: "Yönetici Özeti",
    desc: "Liderlik için kısa durum özeti: nabız göstergeleri, durum/tür dağılımı, teslim akışı ve öne çıkan riskler.",
    icon: "kpi",
    pages: "~2 sayfa",
    build: buildExec,
  },
  {
    id: "sprint",
    name: "Sprint Raporu",
    desc: "Sprint bazında teslim kapasitesi: velocity, durum kırılımı, lead time, tür dağılımı ve takılan kartlar.",
    icon: "chart",
    pages: "~3–4 sayfa",
    build: buildSprint,
  },
  {
    id: "backlog",
    name: "Backlog Raporu",
    desc: "Backlog sağlığı: öncelik dağılımı, durum×tür matrisi, yığılma ve uzun süredir bekleyen kartlar.",
    icon: "pivot",
    pages: "~3 sayfa",
    build: buildBacklog,
  },
  {
    id: "quality",
    name: "Kalite Raporu",
    desc: "Hata analizi: hata göstergeleri, durum/öncelik/kişi/sprint dağılımı ve kod kalitesi sinyalleri.",
    icon: "callout",
    pages: "~3–4 sayfa",
    build: buildQuality,
  },
  {
    id: "flow",
    name: "Akış Raporu",
    desc: "Teslim akışı ve döngü süresi: aylık akış, lead time, WIP, durumda bekleme ve geçiş hacmi (reopen).",
    icon: "signal",
    pages: "~3 sayfa",
    build: buildFlow,
  },
  {
    id: "team",
    name: "Takım Raporu",
    desc: "Kişi bazında katkı: throughput, velocity, WIP, kişi×tür, performans tablosu ve bus-factor riski.",
    icon: "table",
    pages: "~3 sayfa",
    build: buildTeam,
  },
  {
    id: "code",
    name: "Kod & MR Raporu",
    desc: "GitLab aktivitesi: aylık MR akışı, en aktif repolar, kod hacmi ve kod riskleri (issue'suz kod, review darboğazı).",
    icon: "report",
    pages: "~3 sayfa",
    build: buildCode,
  },
];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);

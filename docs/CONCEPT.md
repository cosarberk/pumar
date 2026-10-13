# Pumar — Konsept & Mimari

> Kod adı: **Pumar** (değiştirilebilir). Self-hosted GitLab (`gitlab.crudfab.com`) +
> self-hosted Jira (`jira.crudfab.com`) verisini birleştirip, PO'nun ekip ve projeyi
> tek yerden yönettiği; canlı, görsel ve **kendi raporunu üreten** bir platform.

Bu basit bir Jira-GitLab dashboard'u DEĞİLDİR. Hedef: ham veriyi tek bir bağlı graf
olarak tutmak ve üstüne ileri görsel dil + generatif rapor motoru kurmak.

---

## 1. Temel Fikir: Her şey tek bir bağlı graf

```
Sprint → Epic → Issue → Branch → Commit → MR → Pipeline → Deploy → Release
```

Çoğu araç bunları ayrı tablolar olarak gösterir. Pumar bunların hepsini **tek bir
graf** (düğümler + kenarlar + zaman damgalı durum geçişleri) olarak modeller.
"Uçuran" her özellik bu graftan doğar.

---

## 2. Ham madde (API'lerden çekilebilenler)

### Jira (asıl altın: changelog)
- Issue'nun **her durum geçişi, zaman damgasıyla** (To Do → In Progress → Review → Done)
- Sprint, Epic, Story Point, assignee/reporter, priority, worklog, custom field, workflow tanımı

### GitLab
- Commit (yazar, zaman, dosya, +/- satır), branch
- MR (açılış/merge/kapanış zamanı, reviewer, approval, yorum sayısı, diff boyutu)
- Pipeline/CI (süre, başarı/fail, patlayan stage), deploy/environment, release/tag

### Köprü (Jira ↔ GitLab eşleşmesi)
- Branch/commit/MR mesajındaki `PROJ-123` issue anahtarı ile eşleşme
- Bu eşleşme grafın en kritik kenarı: "iş" ile "kod"u birbirine bağlar

---

## 3. Seni uçuracak görsel dil (tablo/bar DEĞİL)

1. **Value Stream Graph (canlı akış):** işin durumlar arası akışı, flow animasyonu;
   darboğaz düğüm şişer/kızarır; tıkla → o an orada bekleyen gerçek kartlar.
2. **Knowledge / Bus-factor grafiği:** force-directed node ağacı; kim hangi kod alanına
   dokunuyor; tek kişiye bağımlı modüller görsel olarak patlar.
3. **Flow / Sankey:** işin states arası akışı ve geri dönüşleri (rework = kötü sinyal).
4. **Risk radar / öngörü:** geçmiş geçiş sürelerinden tahmin — "bu issue sprint'i
   kaçıracak", "bu MR çürüyor", "bu kişi overloaded".

---

## 4. Dinamik Rapor Motoru (en kıymetli parça)

Hardcoded "ekip hızı raporu" YOK. PO raporu kendi kurgular, sistem generatif üretir.

- **Semantic / Metric Layer:** metrikler (cycle time, throughput, bug/task oranı, WIP…)
  ve boyutlar (kişi, takım, sprint, epic, zaman) **bir kez** tanımlanır.
- **Rapor = kompozisyon:** PO metrik + boyut + görsel blok seçer/tarif eder → sistem
  template üretir → PDF render eder.
- **Hedef seviye:** "son 3 sprint'in bug/task oranını ekip bazında göster" → sistem
  metric layer'dan sorguyu kurar, görseli seçer, raporu basar.

---

## 5. Mimari (k8s/Helm hedefine uygun, mikroservis-dostu)

```
apps/
  api/            → GraphQL API (graf modeline doğal uyar)
  web/            → React + ileri görselleştirme (react-flow / d3 / sigma / WebGL)
services/
  collector/      → GitLab + Jira sync (webhook canlı + periyodik full sync)
  analytics/      → metric layer, flow/cycle time hesapları, öngörü
  report-worker/  → dinamik rapor render + PDF üretimi (kuyruk tabanlı)
packages/
  shared/         → ortak tipler, domain modeli, API istemcileri
deploy/helm/      → Helm chart (final hedef: Kubernetes)
infra/            → docker-compose (lokal geliştirme), migration, seed
```

### Teknoloji
- **Dil:** TypeScript (tek dil, uçtan uca tip güvenliği)
- **Store:** PostgreSQL (ana) + zaman serisi/graf sorguları için ek katman (ileride)
- **Queue:** Redis/BullMQ (sync + rapor işleri)
- **Frontend:** React + Vite + graf/akış kütüphaneleri
- **Deploy:** container-native baştan → Helm → k8s

---

## 6. Yol Haritası (taslak)

- **Faz 0 — Temel:** monorepo iskeleti, domain modeli, Postgres şema (graf), config.
- **Faz 1 — Collector:** Jira + GitLab'den ilk senkron; changelog + MR verisi DB'ye.
- **Faz 2 — Analytics:** cycle time, WIP, flow metrikleri; Jira↔GitLab tutarsızlık tespiti.
- **Faz 3 — Görsel dil:** Value Stream Graph + Knowledge graph (ilk "uçuran" ekran).
- **Faz 4 — Rapor motoru:** metric layer + kompozisyon + PDF.
- **Faz 5 — Öngörü & Helm/k8s:** risk radar, Helm chart, prod.

> Sürüm notu: Jira tarafı eski — collector'da API sürüm farklarına dayanıklı bir
> uyarlama katmanı (adapter) tutulacak.

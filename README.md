# Pulse

Self-hosted GitLab + Jira verisini tek bir bağlı graf olarak birleştiren; canlı görsel
akış yönetimi ve generatif rapor motoru sunan ekip/proje yönetim platformu.

- Vizyon ve mimari: [`docs/CONCEPT.md`](docs/CONCEPT.md)
- Ortam: `gitlab.crudfab.com`, `jira.crudfab.com` (self-hosted)
- Hedef deploy: Kubernetes (Helm)

## Monorepo yapısı

| Yol | Açıklama |
|-----|----------|
| `apps/api` | GraphQL API |
| `apps/web` | React + ileri görselleştirme arayüzü |
| `services/collector` | GitLab + Jira senkronizasyonu |
| `services/analytics` | Metric layer, flow/cycle time, öngörü |
| `services/report-worker` | Dinamik rapor + PDF üretimi |
| `packages/shared` | Ortak domain modeli ve tipler |
| `deploy/helm` | Helm chart |
| `infra` | Lokal geliştirme (docker-compose), migration |

## Durum

Faz 0 — iskelet. Bkz. `docs/CONCEPT.md` yol haritası.

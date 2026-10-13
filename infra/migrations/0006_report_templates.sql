-- Rapor şablonları: kaydedilen şey raporun KONFİGÜRASYONU (veri değil). config = JSONB Document.
CREATE TABLE IF NOT EXISTS report_templates (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

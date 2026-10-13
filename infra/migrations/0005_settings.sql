-- Dinamik bağlantı ayarları (Jira/GitLab) — anahtar/değer. DB > env önceliği.
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

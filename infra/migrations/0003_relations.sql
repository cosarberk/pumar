-- Pulse — Faz: kart ilişki evreni (parent/epic/issue-link)
BEGIN;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS parent_key TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS epic_key TEXT;
CREATE INDEX IF NOT EXISTS idx_wi_parent_key ON work_items(parent_key);
CREATE INDEX IF NOT EXISTS idx_wi_epic_key ON work_items(epic_key);

-- Jira issue linkleri (blocks / relates / duplicates ...), anahtar bazlı
CREATE TABLE IF NOT EXISTS issue_links (
    id       BIGSERIAL PRIMARY KEY,
    from_key TEXT NOT NULL,
    to_key   TEXT NOT NULL,
    type     TEXT,
    UNIQUE (from_key, to_key, type)
);
COMMIT;

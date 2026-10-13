-- Pulse — Faz 2: türetilmiş analitik view'lar
-- changelog (work_item_transitions) ham veriden flow/cycle/aging hesaplar.

BEGIN;

-- Her work_item için durum aralıkları: bir statüye girip bir sonrakine geçene dek
-- geçen süre. "In Progress'te ne kadar kaldı" sorusunun temeli.
CREATE OR REPLACE VIEW v_status_intervals AS
WITH ordered AS (
    SELECT
        t.work_item_id,
        t.to_status AS status,
        t.at        AS entered_at,
        LEAD(t.at) OVER (PARTITION BY t.work_item_id ORDER BY t.at, t.id) AS left_at
    FROM work_item_transitions t
)
SELECT
    o.work_item_id,
    o.status,
    o.entered_at,
    COALESCE(o.left_at, now()) AS left_at,
    EXTRACT(EPOCH FROM (COALESCE(o.left_at, now()) - o.entered_at)) / 86400.0 AS days_in_status
FROM ordered o;

-- Lead time: oluşturulmadan çözülene kadar (gün).
CREATE OR REPLACE VIEW v_lead_time AS
SELECT
    w.id AS work_item_id,
    w.key,
    w.type,
    w.sprint_id,
    w.project_id,
    w.assignee_id,
    EXTRACT(EPOCH FROM (w.resolved_at - w.created_at)) / 86400.0 AS lead_days
FROM work_items w
WHERE w.resolved_at IS NOT NULL AND w.created_at IS NOT NULL;

-- Aging WIP: şu an In Progress olan kartlar ve mevcut statüde ne kadar bekledikleri.
-- "Çürüyen kart" tespitinin kalbi.
CREATE OR REPLACE VIEW v_aging_wip AS
SELECT
    w.id AS work_item_id,
    w.key,
    w.summary,
    w.type,
    w.status,
    w.assignee_id,
    w.sprint_id,
    li.entered_at AS in_status_since,
    EXTRACT(EPOCH FROM (now() - li.entered_at)) / 86400.0 AS days_in_status
FROM work_items w
JOIN LATERAL (
    SELECT at AS entered_at
    FROM work_item_transitions t
    WHERE t.work_item_id = w.id
    ORDER BY at DESC, id DESC
    LIMIT 1
) li ON TRUE
WHERE w.status_category = 'in_progress';

-- MR döngü süresi: açılıştan merge'e; review bekleme süresi.
CREATE OR REPLACE VIEW v_mr_cycle AS
SELECT
    m.id AS mr_id,
    m.repo_id,
    m.author_id,
    m.work_item_id,
    m.state,
    EXTRACT(EPOCH FROM (m.merged_at - m.created_at)) / 86400.0 AS merge_days,
    EXTRACT(EPOCH FROM (m.first_review_at - m.created_at)) / 86400.0 AS first_review_days
FROM merge_requests m
WHERE m.created_at IS NOT NULL;

-- Jira ↔ GitLab tutarsızlık: "Done ama merge olmuş MR yok".
CREATE OR REPLACE VIEW v_done_without_mr AS
SELECT w.id AS work_item_id, w.key, w.summary, w.assignee_id, w.resolved_at
FROM work_items w
WHERE w.status_category = 'done'
  AND NOT EXISTS (
      SELECT 1 FROM merge_requests m
      WHERE m.work_item_id = w.id AND m.state = 'merged'
  );

-- Tutarsızlık: issue'ya bağlanamamış kod (başıboş commit/MR).
CREATE OR REPLACE VIEW v_unlinked_code AS
SELECT 'merge_request' AS kind, m.id AS id, m.repo_id, m.title AS label, m.created_at
FROM merge_requests m WHERE m.work_item_id IS NULL
UNION ALL
SELECT 'commit' AS kind, c.id, c.repo_id, LEFT(c.message, 80), c.authored_at
FROM commits c WHERE c.work_item_id IS NULL;

-- Bus-factor proxy'si: repo başına katkı veren kişi dağılımı.
CREATE OR REPLACE VIEW v_repo_contributors AS
SELECT
    c.repo_id,
    c.author_id,
    COUNT(*)                         AS commit_count,
    SUM(COALESCE(c.additions, 0))    AS additions,
    SUM(COALESCE(c.deletions, 0))    AS deletions
FROM commits c
WHERE c.author_id IS NOT NULL
GROUP BY c.repo_id, c.author_id;

COMMIT;

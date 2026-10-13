-- Pumar — Faz 0 graf şeması
-- Her şey tek bir bağlı graf: Sprint → Epic → Issue → Branch → Commit → MR → Pipeline → Deploy
-- Kaynaklar: Jira (jira.crudfab.com) + GitLab (gitlab.crudfab.com), self-hosted.

BEGIN;

-- =============================================================
-- 0. Ortak / kimlik
-- =============================================================

-- İki sistemdeki kişileri tek bir kimlikte birleştirir (bus-factor, yük analizi için şart).
CREATE TABLE people (
    id              BIGSERIAL PRIMARY KEY,
    display_name    TEXT NOT NULL,
    email           TEXT,
    jira_account_id TEXT UNIQUE,         -- Jira kullanıcı anahtarı/accountId (eski Jira: "key")
    gitlab_user_id  BIGINT UNIQUE,       -- GitLab numeric user id
    gitlab_username TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
    team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    person_id   BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role        TEXT,
    PRIMARY KEY (team_id, person_id)
);

-- =============================================================
-- 1. Jira tarafı (iş / "ne & neden")
-- =============================================================

-- Jira projesi <-> GitLab deposu eşleşmesi burada köprülenir (bkz. repositories.jira_project_id).
CREATE TABLE jira_projects (
    id          BIGSERIAL PRIMARY KEY,
    jira_id     TEXT NOT NULL UNIQUE,    -- Jira internal project id
    key         TEXT NOT NULL UNIQUE,    -- örn. "PROJ"
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sprints (
    id              BIGSERIAL PRIMARY KEY,
    jira_id         TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    state           TEXT,                -- future | active | closed
    start_at        TIMESTAMPTZ,
    end_at          TIMESTAMPTZ,
    complete_at     TIMESTAMPTZ,
    goal            TEXT
);

CREATE TABLE epics (
    id              BIGSERIAL PRIMARY KEY,
    jira_id         TEXT NOT NULL UNIQUE,
    key             TEXT NOT NULL,
    name            TEXT,
    summary         TEXT,
    project_id      BIGINT REFERENCES jira_projects(id) ON DELETE SET NULL
);

CREATE TABLE work_items (
    id              BIGSERIAL PRIMARY KEY,
    jira_id         TEXT NOT NULL UNIQUE,     -- Jira internal issue id
    key             TEXT NOT NULL UNIQUE,     -- örn. "PROJ-123" (GitLab eşleşmesinin anahtarı)
    project_id      BIGINT REFERENCES jira_projects(id) ON DELETE SET NULL,
    epic_id         BIGINT REFERENCES epics(id) ON DELETE SET NULL,
    sprint_id       BIGINT REFERENCES sprints(id) ON DELETE SET NULL,
    parent_id       BIGINT REFERENCES work_items(id) ON DELETE SET NULL, -- sub-task hiyerarşisi
    type            TEXT,                     -- Story | Bug | Task | Sub-task ...
    status          TEXT,                     -- anlık durum (geçmiş: work_item_transitions)
    status_category TEXT,                     -- todo | in_progress | done
    priority        TEXT,
    summary         TEXT,
    story_points    NUMERIC,
    assignee_id     BIGINT REFERENCES people(id) ON DELETE SET NULL,
    reporter_id     BIGINT REFERENCES people(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ
);
CREATE INDEX idx_work_items_sprint   ON work_items(sprint_id);
CREATE INDEX idx_work_items_epic     ON work_items(epic_id);
CREATE INDEX idx_work_items_assignee ON work_items(assignee_id);
CREATE INDEX idx_work_items_status   ON work_items(status_category);

-- ALTIN: changelog. Her durum geçişi zaman damgasıyla.
-- Cycle time, "In Progress'te ne kadar kaldı", flow/sankey hep buradan.
CREATE TABLE work_item_transitions (
    id              BIGSERIAL PRIMARY KEY,
    work_item_id    BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    at              TIMESTAMPTZ NOT NULL,
    by_person_id    BIGINT REFERENCES people(id) ON DELETE SET NULL
);
CREATE INDEX idx_transitions_item ON work_item_transitions(work_item_id, at);

-- Worklog (opsiyonel ama yük analizine girer)
CREATE TABLE worklogs (
    id              BIGSERIAL PRIMARY KEY,
    jira_id         TEXT UNIQUE,
    work_item_id    BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    person_id       BIGINT REFERENCES people(id) ON DELETE SET NULL,
    seconds_spent   BIGINT NOT NULL,
    started_at      TIMESTAMPTZ
);

-- =============================================================
-- 2. GitLab tarafı (kod / "nasıl")
-- =============================================================

CREATE TABLE repositories (
    id              BIGSERIAL PRIMARY KEY,
    gitlab_id       BIGINT NOT NULL UNIQUE,   -- GitLab project id
    path            TEXT NOT NULL,            -- group/subgroup/repo
    name            TEXT NOT NULL,
    default_branch  TEXT,
    jira_project_id BIGINT REFERENCES jira_projects(id) ON DELETE SET NULL -- köprü
);

CREATE TABLE branches (
    id              BIGSERIAL PRIMARY KEY,
    repo_id         BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    work_item_id    BIGINT REFERENCES work_items(id) ON DELETE SET NULL, -- isimden çıkarılan PROJ-123
    created_at      TIMESTAMPTZ,
    UNIQUE (repo_id, name)
);

CREATE TABLE commits (
    id              BIGSERIAL PRIMARY KEY,
    repo_id         BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    sha             TEXT NOT NULL,
    author_id       BIGINT REFERENCES people(id) ON DELETE SET NULL,
    authored_at     TIMESTAMPTZ,
    message         TEXT,
    additions       INTEGER,
    deletions       INTEGER,
    files_changed   INTEGER,
    work_item_id    BIGINT REFERENCES work_items(id) ON DELETE SET NULL, -- mesajdan PROJ-123
    UNIQUE (repo_id, sha)
);
CREATE INDEX idx_commits_author ON commits(author_id);
CREATE INDEX idx_commits_item   ON commits(work_item_id);

-- Dosya bazlı değişim (knowledge/bus-factor grafiği için)
CREATE TABLE commit_files (
    commit_id   BIGINT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,
    additions   INTEGER,
    deletions   INTEGER,
    PRIMARY KEY (commit_id, path)
);

CREATE TABLE merge_requests (
    id              BIGSERIAL PRIMARY KEY,
    repo_id         BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    iid             BIGINT NOT NULL,          -- repo içi MR numarası
    title           TEXT,
    state           TEXT,                     -- opened | merged | closed
    author_id       BIGINT REFERENCES people(id) ON DELETE SET NULL,
    source_branch   TEXT,
    target_branch   TEXT,
    work_item_id    BIGINT REFERENCES work_items(id) ON DELETE SET NULL,
    additions       INTEGER,
    deletions       INTEGER,
    comments_count  INTEGER,
    created_at      TIMESTAMPTZ,
    first_review_at TIMESTAMPTZ,              -- review darboğazı için
    merged_at       TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    UNIQUE (repo_id, iid)
);
CREATE INDEX idx_mr_item   ON merge_requests(work_item_id);
CREATE INDEX idx_mr_author ON merge_requests(author_id);
CREATE INDEX idx_mr_state  ON merge_requests(state);

-- MR katılımcıları (reviewer/approver) — review yükü/darboğaz analizi
CREATE TABLE mr_participants (
    mr_id       BIGINT NOT NULL REFERENCES merge_requests(id) ON DELETE CASCADE,
    person_id   BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,                -- reviewer | approver | assignee
    approved_at TIMESTAMPTZ,
    PRIMARY KEY (mr_id, person_id, role)
);

CREATE TABLE pipelines (
    id              BIGSERIAL PRIMARY KEY,
    repo_id         BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    gitlab_id       BIGINT NOT NULL,
    mr_id           BIGINT REFERENCES merge_requests(id) ON DELETE SET NULL,
    sha             TEXT,
    status          TEXT,                     -- success | failed | running | canceled
    ref             TEXT,
    duration_sec    INTEGER,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    UNIQUE (repo_id, gitlab_id)
);

CREATE TABLE deployments (
    id              BIGSERIAL PRIMARY KEY,
    repo_id         BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    gitlab_id       BIGINT NOT NULL,
    environment     TEXT,                     -- staging | production ...
    status          TEXT,
    sha             TEXT,
    deployed_at     TIMESTAMPTZ,
    UNIQUE (repo_id, gitlab_id)
);

-- =============================================================
-- 3. Senkron defteri (collector durumu)
-- =============================================================

CREATE TABLE sync_state (
    id          BIGSERIAL PRIMARY KEY,
    source      TEXT NOT NULL,            -- jira | gitlab
    entity      TEXT NOT NULL,            -- work_items | merge_requests ...
    scope       TEXT,                     -- proje/depo anahtarı (opsiyonel)
    cursor      TEXT,                     -- son sayfa/updated_at imleci
    last_run_at TIMESTAMPTZ,
    status      TEXT,                     -- ok | running | error
    message     TEXT,
    UNIQUE (source, entity, scope)
);

COMMIT;

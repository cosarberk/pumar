/**
 * DB katmanı: pg pool + idempotent upsert fonksiyonları.
 * Collector tekrar çalıştığında veriyi çakıştırmadan günceller (ON CONFLICT).
 */
import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

type Row = Record<string, unknown>;

async function one<T extends Row>(sql: string, params: unknown[]): Promise<T> {
  const res = await pool.query(sql, params);
  return res.rows[0] as T;
}

// --- Kimlik ---------------------------------------------------------------

export async function upsertPersonByJira(p: {
  displayName: string;
  email?: string;
  jiraAccountId: string;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO people (display_name, email, jira_account_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (jira_account_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           email = COALESCE(EXCLUDED.email, people.email),
           updated_at = now()
     RETURNING id`,
    [p.displayName, p.email ?? null, p.jiraAccountId],
  );
  return row.id;
}

export async function upsertPersonByGitlab(p: {
  displayName: string;
  gitlabUserId: number;
  gitlabUsername?: string;
  email?: string;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO people (display_name, gitlab_user_id, gitlab_username, email)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (gitlab_user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           gitlab_username = EXCLUDED.gitlab_username,
           email = COALESCE(EXCLUDED.email, people.email),
           updated_at = now()
     RETURNING id`,
    [p.displayName, p.gitlabUserId, p.gitlabUsername ?? null, p.email ?? null],
  );
  return row.id;
}

// --- Jira -----------------------------------------------------------------

export async function upsertJiraProject(p: {
  jiraId: string;
  key: string;
  name: string;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO jira_projects (jira_id, key, name)
     VALUES ($1,$2,$3)
     ON CONFLICT (jira_id) DO UPDATE SET key = EXCLUDED.key, name = EXCLUDED.name
     RETURNING id`,
    [p.jiraId, p.key, p.name],
  );
  return row.id;
}

export async function upsertSprint(s: {
  jiraId: string;
  name: string;
  state?: string;
  startAt?: string;
  endAt?: string;
  completeAt?: string;
  goal?: string;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO sprints (jira_id, name, state, start_at, end_at, complete_at, goal)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (jira_id) DO UPDATE
       SET name=EXCLUDED.name, state=EXCLUDED.state, start_at=EXCLUDED.start_at,
           end_at=EXCLUDED.end_at, complete_at=EXCLUDED.complete_at, goal=EXCLUDED.goal
     RETURNING id`,
    [s.jiraId, s.name, s.state ?? null, s.startAt ?? null, s.endAt ?? null, s.completeAt ?? null, s.goal ?? null],
  );
  return row.id;
}

export async function upsertEpic(e: {
  jiraId: string;
  key: string;
  name?: string;
  summary?: string;
  projectId?: number;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO epics (jira_id, key, name, summary, project_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (jira_id) DO UPDATE
       SET key=EXCLUDED.key, name=EXCLUDED.name, summary=EXCLUDED.summary, project_id=EXCLUDED.project_id
     RETURNING id`,
    [e.jiraId, e.key, e.name ?? null, e.summary ?? null, e.projectId ?? null],
  );
  return row.id;
}

export async function upsertWorkItem(w: {
  jiraId: string;
  key: string;
  projectId?: number;
  epicId?: number;
  sprintId?: number;
  parentKey?: string;
  epicKey?: string;
  sprintAddedAt?: string;
  type?: string;
  status?: string;
  statusCategory?: string;
  priority?: string;
  summary?: string;
  storyPoints?: number;
  assigneeId?: number;
  reporterId?: number;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO work_items
       (jira_id, key, project_id, epic_id, sprint_id, type, status, status_category,
        priority, summary, story_points, assignee_id, reporter_id, created_at, updated_at, resolved_at,
        parent_key, epic_key, sprint_added_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (jira_id) DO UPDATE SET
       key=EXCLUDED.key, project_id=EXCLUDED.project_id, epic_id=EXCLUDED.epic_id,
       sprint_id=EXCLUDED.sprint_id, type=EXCLUDED.type, status=EXCLUDED.status,
       status_category=EXCLUDED.status_category, priority=EXCLUDED.priority,
       summary=EXCLUDED.summary, story_points=EXCLUDED.story_points,
       assignee_id=EXCLUDED.assignee_id, reporter_id=EXCLUDED.reporter_id,
       updated_at=EXCLUDED.updated_at, resolved_at=EXCLUDED.resolved_at,
       parent_key=EXCLUDED.parent_key, epic_key=EXCLUDED.epic_key, sprint_added_at=EXCLUDED.sprint_added_at
     RETURNING id`,
    [
      w.jiraId, w.key, w.projectId ?? null, w.epicId ?? null, w.sprintId ?? null,
      w.type ?? null, w.status ?? null, w.statusCategory ?? null, w.priority ?? null,
      w.summary ?? null, w.storyPoints ?? null, w.assigneeId ?? null, w.reporterId ?? null,
      w.createdAt ?? null, w.updatedAt ?? null, w.resolvedAt ?? null,
      w.parentKey ?? null, w.epicKey ?? null, w.sprintAddedAt ?? null,
    ],
  );
  return row.id;
}

/** Bir issue'nun linklerini tazeler (blocks/relates...). */
export async function replaceIssueLinks(
  fromKey: string, links: { toKey: string; type?: string }[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM issue_links WHERE from_key = $1`, [fromKey]);
    for (const l of links) {
      await client.query(
        `INSERT INTO issue_links (from_key, to_key, type) VALUES ($1,$2,$3)
         ON CONFLICT (from_key, to_key, type) DO NOTHING`,
        [fromKey, l.toKey, l.type ?? null],
      );
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

/** Changelog'u tazeler: önce bu item'ın geçişlerini sil, sonra toplu ekle (idempotent). */
export async function replaceTransitions(
  workItemId: number,
  transitions: { fromStatus?: string; toStatus: string; at: string; byPersonId?: number }[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM work_item_transitions WHERE work_item_id = $1`, [workItemId]);
    for (const t of transitions) {
      await client.query(
        `INSERT INTO work_item_transitions (work_item_id, from_status, to_status, at, by_person_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [workItemId, t.fromStatus ?? null, t.toStatus, t.at, t.byPersonId ?? null],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// --- GitLab ---------------------------------------------------------------

export async function upsertRepository(r: {
  gitlabId: number;
  path: string;
  name: string;
  defaultBranch?: string;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO repositories (gitlab_id, path, name, default_branch)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (gitlab_id) DO UPDATE
       SET path=EXCLUDED.path, name=EXCLUDED.name, default_branch=EXCLUDED.default_branch
     RETURNING id`,
    [r.gitlabId, r.path, r.name, r.defaultBranch ?? null],
  );
  return row.id;
}

export async function upsertCommit(c: {
  repoId: number;
  sha: string;
  authorId?: number;
  authoredAt?: string;
  message?: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  workItemId?: number;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO commits
       (repo_id, sha, author_id, authored_at, message, additions, deletions, files_changed, work_item_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (repo_id, sha) DO UPDATE
       SET work_item_id = COALESCE(EXCLUDED.work_item_id, commits.work_item_id)
     RETURNING id`,
    [
      c.repoId, c.sha, c.authorId ?? null, c.authoredAt ?? null, c.message ?? null,
      c.additions ?? null, c.deletions ?? null, c.filesChanged ?? null, c.workItemId ?? null,
    ],
  );
  return row.id;
}

export async function upsertMergeRequest(m: {
  repoId: number;
  iid: number;
  title?: string;
  state?: string;
  authorId?: number;
  sourceBranch?: string;
  targetBranch?: string;
  workItemId?: number;
  additions?: number;
  deletions?: number;
  commentsCount?: number;
  createdAt?: string;
  firstReviewAt?: string;
  mergedAt?: string;
  closedAt?: string;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO merge_requests
       (repo_id, iid, title, state, author_id, source_branch, target_branch, work_item_id,
        additions, deletions, comments_count, created_at, first_review_at, merged_at, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (repo_id, iid) DO UPDATE SET
       title=EXCLUDED.title, state=EXCLUDED.state, author_id=EXCLUDED.author_id,
       source_branch=EXCLUDED.source_branch, target_branch=EXCLUDED.target_branch,
       work_item_id=COALESCE(EXCLUDED.work_item_id, merge_requests.work_item_id),
       additions=EXCLUDED.additions, deletions=EXCLUDED.deletions,
       comments_count=EXCLUDED.comments_count, first_review_at=EXCLUDED.first_review_at,
       merged_at=EXCLUDED.merged_at, closed_at=EXCLUDED.closed_at
     RETURNING id`,
    [
      m.repoId, m.iid, m.title ?? null, m.state ?? null, m.authorId ?? null,
      m.sourceBranch ?? null, m.targetBranch ?? null, m.workItemId ?? null,
      m.additions ?? null, m.deletions ?? null, m.commentsCount ?? null,
      m.createdAt ?? null, m.firstReviewAt ?? null, m.mergedAt ?? null, m.closedAt ?? null,
    ],
  );
  return row.id;
}

export async function upsertMrParticipant(
  mrId: number, personId: number, role: string, approvedAt?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO mr_participants (mr_id, person_id, role, approved_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (mr_id, person_id, role) DO UPDATE SET approved_at = EXCLUDED.approved_at`,
    [mrId, personId, role, approvedAt ?? null],
  );
}

/** Reviewer sync için: her MR'ın internal id + repo gitlab id + iid. */
export async function listMergeRequestsForSync(): Promise<{ mr_id: number; repo_gitlab_id: number; iid: number }[]> {
  const res = await pool.query(
    `SELECT m.id AS mr_id, r.gitlab_id AS repo_gitlab_id, m.iid
     FROM merge_requests m JOIN repositories r ON r.id = m.repo_id`,
  );
  return res.rows;
}

/** Issue key'den (PROJ-123) work_item id çözümü — GitLab→Jira köprüsü. */
export async function resolveWorkItemIdByKey(key: string): Promise<number | undefined> {
  const res = await pool.query(`SELECT id FROM work_items WHERE key = $1`, [key]);
  return res.rows[0]?.id as number | undefined;
}

// --- Senkron defteri ------------------------------------------------------

export async function markSync(
  source: string,
  entity: string,
  status: "ok" | "running" | "error",
  message?: string,
  scope?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO sync_state (source, entity, scope, last_run_at, status, message)
     VALUES ($1,$2,$3, now(), $4, $5)
     ON CONFLICT (source, entity, scope) DO UPDATE
       SET last_run_at = now(), status = EXCLUDED.status, message = EXCLUDED.message`,
    [source, entity, scope ?? "", status, message ?? null],
  );
}

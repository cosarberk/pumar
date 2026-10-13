/**
 * Pulse — domain modeli (graf düğümleri + kenarları).
 * SQL şeması (infra/migrations/0001_init.sql) ile birebir hizalıdır.
 *
 * Graf: Sprint → Epic → Issue(WorkItem) → Branch → Commit → MR → Pipeline → Deploy
 * Kaynaklar: Jira (iş/neden) + GitLab (kod/nasıl); köprü = issue key (PROJ-123).
 */

export type Id = number;

export type StatusCategory = "todo" | "in_progress" | "done";

/** İki sistemdeki kişilerin birleşik kimliği (bus-factor, yük analizi için). */
export interface Person {
  id: Id;
  displayName: string;
  email?: string;
  jiraAccountId?: string;
  gitlabUserId?: number;
  gitlabUsername?: string;
  isActive: boolean;
}

export interface Team {
  id: Id;
  name: string;
}

// ---------------------------------------------------------------------------
// Jira tarafı
// ---------------------------------------------------------------------------

export interface JiraProject {
  id: Id;
  jiraId: string;
  key: string; // "PROJ"
  name: string;
}

export interface Sprint {
  id: Id;
  jiraId: string;
  name: string;
  state?: "future" | "active" | "closed";
  startAt?: string;
  endAt?: string;
  completeAt?: string;
  goal?: string;
}

export interface Epic {
  id: Id;
  jiraId: string;
  key: string;
  name?: string;
  summary?: string;
  projectId?: Id;
}

export interface WorkItem {
  id: Id;
  jiraId: string;
  key: string; // "PROJ-123"
  projectId?: Id;
  epicId?: Id;
  sprintId?: Id;
  parentId?: Id;
  type?: string; // Story | Bug | Task | Sub-task
  status?: string;
  statusCategory?: StatusCategory;
  priority?: string;
  summary?: string;
  storyPoints?: number;
  assigneeId?: Id;
  reporterId?: Id;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
}

/** ALTIN: zaman damgalı durum geçişi (cycle time, flow/sankey kaynağı). */
export interface WorkItemTransition {
  id: Id;
  workItemId: Id;
  fromStatus?: string;
  toStatus: string;
  at: string;
  byPersonId?: Id;
}

export interface Worklog {
  id: Id;
  jiraId?: string;
  workItemId: Id;
  personId?: Id;
  secondsSpent: number;
  startedAt?: string;
}

// ---------------------------------------------------------------------------
// GitLab tarafı
// ---------------------------------------------------------------------------

export interface Repository {
  id: Id;
  gitlabId: number;
  path: string; // group/subgroup/repo
  name: string;
  defaultBranch?: string;
  jiraProjectId?: Id; // köprü
}

export interface Branch {
  id: Id;
  repoId: Id;
  name: string;
  workItemId?: Id; // isimden çıkarılan PROJ-123
  createdAt?: string;
}

export interface Commit {
  id: Id;
  repoId: Id;
  sha: string;
  authorId?: Id;
  authoredAt?: string;
  message?: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  workItemId?: Id;
}

export interface CommitFile {
  commitId: Id;
  path: string;
  additions?: number;
  deletions?: number;
}

export type MergeRequestState = "opened" | "merged" | "closed";

export interface MergeRequest {
  id: Id;
  repoId: Id;
  iid: number;
  title?: string;
  state?: MergeRequestState;
  authorId?: Id;
  sourceBranch?: string;
  targetBranch?: string;
  workItemId?: Id;
  additions?: number;
  deletions?: number;
  commentsCount?: number;
  createdAt?: string;
  firstReviewAt?: string;
  mergedAt?: string;
  closedAt?: string;
}

export type MrRole = "reviewer" | "approver" | "assignee";

export interface MrParticipant {
  mrId: Id;
  personId: Id;
  role: MrRole;
  approvedAt?: string;
}

export interface Pipeline {
  id: Id;
  repoId: Id;
  gitlabId: number;
  mrId?: Id;
  sha?: string;
  status?: "success" | "failed" | "running" | "canceled";
  ref?: string;
  durationSec?: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface Deployment {
  id: Id;
  repoId: Id;
  gitlabId: number;
  environment?: string;
  status?: string;
  sha?: string;
  deployedAt?: string;
}

// ---------------------------------------------------------------------------
// Collector defteri
// ---------------------------------------------------------------------------

export type SyncSource = "jira" | "gitlab";

export interface SyncState {
  id: Id;
  source: SyncSource;
  entity: string;
  scope?: string;
  cursor?: string;
  lastRunAt?: string;
  status?: "ok" | "running" | "error";
  message?: string;
}

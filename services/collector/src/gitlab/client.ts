/**
 * GitLab istemcisi (REST v4, self-hosted).
 * Sayfalama: ?per_page=100 + "x-next-page" header imleci.
 */
import { HttpClient } from "../http.js";
import { config } from "../config.js";

let _http: HttpClient | null = null;
function http(): HttpClient {
  if (!_http) _http = new HttpClient({ baseUrl: `${config.gitlab.baseUrl}/api/v4`, headers: { "PRIVATE-TOKEN": config.gitlab.token, Accept: "application/json" } });
  return _http;
}

/** Header imleçli sayfalama: tüm sayfaları tek tek yield eder. */
async function* paged<T>(path: string): AsyncGenerator<T> {
  let page: string | null = "1";
  const sep = path.includes("?") ? "&" : "?";
  while (page) {
    const res = await http().raw(`${path}${sep}per_page=100&page=${page}`);
    const items = (await res.json()) as T[];
    for (const it of items) yield it;
    page = res.headers.get("x-next-page") || null;
  }
}

export interface GLUser {
  id: number;
  username: string;
  name: string;
}

export interface GLProject {
  id: number;
  path_with_namespace: string;
  name: string;
  default_branch?: string;
}

export interface GLCommit {
  id: string; // sha
  message: string;
  author_name?: string;
  author_email?: string;
  authored_date?: string;
  stats?: { additions: number; deletions: number; total: number };
}

export interface GLMergeRequest {
  iid: number;
  title: string;
  state: string;
  author?: GLUser;
  source_branch?: string;
  target_branch?: string;
  user_notes_count?: number;
  created_at?: string;
  merged_at?: string | null;
  closed_at?: string | null;
  reviewers?: GLUser[];
  assignees?: GLUser[];
}

export function listProjects(): AsyncGenerator<GLProject> {
  return paged<GLProject>(`/projects?membership=true&simple=false&order_by=last_activity_at`);
}

export function listMergeRequests(projectId: number): AsyncGenerator<GLMergeRequest> {
  return paged<GLMergeRequest>(`/projects/${projectId}/merge_requests?scope=all&state=all`);
}

export function listCommits(projectId: number, since?: string): AsyncGenerator<GLCommit> {
  const q = since ? `&since=${encodeURIComponent(since)}` : "";
  return paged<GLCommit>(`/projects/${projectId}/repository/commits?with_stats=true${q}`);
}

/** MR onaylayanları (gerçek "reviewer" sinyali). Liste ucunda gelmediği için MR başına. */
export async function mrApprovals(projectId: number, iid: number) {
  return http().json<{ approved_by?: { user: GLUser }[] }>(
    `/projects/${projectId}/merge_requests/${iid}/approvals`,
  );
}

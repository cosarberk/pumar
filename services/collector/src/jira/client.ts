/**
 * Jira istemcisi (eski Server/DC uyumlu, REST v2).
 * - Issue + changelog (altın veri) için /rest/api/2/search (expand=changelog)
 * - Sprint için /rest/agile/1.0 (board varsa)
 * Auth: bearer (PAT) veya basic (email:token).
 */
import { HttpClient } from "../http.js";
import { config } from "../config.js";

function authHeaders(): Record<string, string> {
  const { authMode, email, apiToken } = config.jira;
  if (authMode === "basic") {
    const b64 = Buffer.from(`${email}:${apiToken}`).toString("base64");
    return { Authorization: `Basic ${b64}` };
  }
  return { Authorization: `Bearer ${apiToken}` };
}

let _http: HttpClient | null = null;
function http(): HttpClient {
  if (!_http) _http = new HttpClient({ baseUrl: config.jira.baseUrl, headers: { Accept: "application/json", ...authHeaders() } });
  return _http;
}

// Ham Jira tipleri (yalnızca kullandığımız alanlar).
export interface JiraUser {
  accountId?: string; // Cloud
  key?: string;       // eski Server
  name?: string;      // eski Server
  displayName: string;
  emailAddress?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    issuetype?: { name: string };
    status?: { name: string; statusCategory?: { key: string } };
    priority?: { name: string };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    created?: string;
    updated?: string;
    resolutiondate?: string | null;
    project?: { id: string; key: string; name: string };
    parent?: { id: string; key: string };
    [custom: string]: unknown; // story points / epic link custom field'ları
  };
  changelog?: {
    histories: {
      created: string;
      author?: JiraUser;
      items: { field: string; fromString: string | null; toString: string | null }[];
    }[];
  };
}

interface SearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

/** JQL ile sayfalı issue çeker; changelog expand edilir. */
export async function* searchIssues(jql: string): AsyncGenerator<JiraIssue> {
  let startAt = 0;
  const maxResults = 50;
  for (;;) {
    const body = {
      jql,
      startAt,
      maxResults,
      expand: ["changelog"],
      fields: ["*navigable"],
    };
    const page = await http().json<SearchResponse>(`/rest/api/2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    for (const issue of page.issues) yield issue;
    startAt += page.issues.length;
    if (startAt >= page.total || page.issues.length === 0) break;
  }
}

export interface JiraSprint {
  id: number;
  name: string;
  state?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

/** Tüm board'ların sprint'lerini getirir (agile API). Board yoksa sessizce boş döner. */
export async function* allSprints(): AsyncGenerator<JiraSprint> {
  let boardStart = 0;
  for (;;) {
    const boards = await http()
      .json<{ values: { id: number }[]; isLast: boolean }>(
        `/rest/agile/1.0/board?startAt=${boardStart}&maxResults=50`,
      )
      .catch(() => null);
    if (!boards) return; // agile API yoksa
    for (const b of boards.values) {
      let sprintStart = 0;
      for (;;) {
        const sp = await http()
          .json<{ values: JiraSprint[]; isLast: boolean }>(
            `/rest/agile/1.0/board/${b.id}/sprint?startAt=${sprintStart}&maxResults=50`,
          )
          .catch(() => null);
        if (!sp) break;
        for (const s of sp.values) yield s;
        sprintStart += sp.values.length;
        if (sp.isLast || sp.values.length === 0) break;
      }
    }
    boardStart += boards.values.length;
    if (boards.isLast || boards.values.length === 0) break;
  }
}

/** Jira kullanıcısının kararlı kimliği (Cloud: accountId, eski Server: key/name). */
export function jiraUserId(u?: JiraUser | null): string | undefined {
  if (!u) return undefined;
  return u.accountId ?? u.key ?? u.name;
}

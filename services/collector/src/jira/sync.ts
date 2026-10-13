/** Jira → DB senkronu: project, sprint, work_item ve changelog (geçişler). */
import {
  upsertJiraProject, upsertSprint, upsertWorkItem, upsertPersonByJira,
  replaceTransitions, replaceIssueLinks, markSync,
} from "../db.js";
import { searchIssues, allSprints, jiraUserId, type JiraIssue, type JiraUser } from "./client.js";

// Jira statusCategory.key → bizim kategori
function mapCategory(key?: string): string | undefined {
  if (!key) return undefined;
  if (key === "new" || key === "indeterminate" || key === "done") {
    return { new: "todo", indeterminate: "in_progress", done: "done" }[key];
  }
  return undefined;
}

async function personId(u?: JiraUser | null): Promise<number | undefined> {
  const jid = jiraUserId(u);
  if (!jid || !u) return undefined;
  return upsertPersonByJira({ displayName: u.displayName, email: u.emailAddress, jiraAccountId: jid });
}

const okDate = (s?: string) => (s && s !== "<null>" && s !== "null" ? s : undefined);

/**
 * Sprint custom field'ı çıkarır. İki biçim destekli:
 *  - modern: obje dizisi [{id,name,state,startDate,...}]
 *  - eski Server: string dizisi "com.atlassian.greenhopper...Sprint@..[id=5,name=Sprint 5,...]"
 * Birden fazla sprint varsa sonuncusu (güncel) alınır.
 */
function parseSprint(fields: JiraIssue["fields"]) {
  for (const k of Object.keys(fields)) {
    if (!k.startsWith("customfield_")) continue;
    const v = fields[k];
    if (!Array.isArray(v) || v.length === 0) continue;
    const last: any = v[v.length - 1];
    if (last && typeof last === "object" && last.id != null && last.name &&
        (last.state !== undefined || last.boardId !== undefined || last.startDate !== undefined)) {
      return { jiraId: String(last.id), name: String(last.name), state: last.state,
               startAt: okDate(last.startDate), endAt: okDate(last.endDate), completeAt: okDate(last.completeDate) };
    }
    if (typeof last === "string" && last.includes("greenhopper") && /Sprint/i.test(last)) {
      const id = /id=(\d+)/.exec(last)?.[1];
      if (!id) continue;
      return {
        jiraId: id,
        name: /name=([^,\]]+)/.exec(last)?.[1] ?? `Sprint ${id}`,
        state: /state=([^,\]]+)/.exec(last)?.[1],
        startAt: okDate(/startDate=([^,\]]+)/.exec(last)?.[1]),
        endAt: okDate(/endDate=([^,\]]+)/.exec(last)?.[1]),
        completeAt: okDate(/completeDate=([^,\]]+)/.exec(last)?.[1]),
      };
    }
  }
  return undefined;
}

/** Story points custom field'ı projeden projeye değişir; yaygın adayları tara. */
function extractStoryPoints(fields: JiraIssue["fields"]): number | undefined {
  for (const k of Object.keys(fields)) {
    if (!k.startsWith("customfield_")) continue;
    const v = fields[k];
    if (typeof v === "number") {
      // kaba sezgi: makul aralıktaki tek sayısal custom field story point olabilir
      if (v >= 0 && v <= 200) return v;
    }
  }
  return undefined;
}

async function syncIssue(issue: JiraIssue): Promise<void> {
  const f = issue.fields;

  const projectId = f.project
    ? await upsertJiraProject({ jiraId: f.project.id, key: f.project.key, name: f.project.name })
    : undefined;

  const assigneeId = await personId(f.assignee);
  const reporterId = await personId(f.reporter);

  // Sprint custom field'ı → sprint'i upsert et ve item'a bağla
  const sp = parseSprint(f);
  const sprintId = sp ? await upsertSprint(sp) : undefined;

  // Kartın bu sprint'e EKLENME zamanı (scope creep / söz tutma için) — changelog "Sprint" alanından
  let sprintAddedAt: string | undefined;
  if (sp) {
    for (const h of issue.changelog?.histories ?? []) {
      for (const it of h.items) {
        if (/sprint/i.test(it.field) && it.toString && it.toString.includes(sp.name)) sprintAddedAt = h.created;
      }
    }
    if (!sprintAddedAt) sprintAddedAt = f.created ?? undefined; // oluşturulurken sprint'teydi
  }

  // İlişkiler: parent (alt-görev), epic link (customfield_10100), issue linkleri
  const anyF = f as any;
  const parentKey: string | undefined = anyF.parent?.key;
  const epicRaw = anyF.customfield_10100;
  const epicKey = typeof epicRaw === "string" && /^[A-Z][A-Z0-9]+-\d+$/.test(epicRaw) ? epicRaw : undefined;

  const workItemId = await upsertWorkItem({
    jiraId: issue.id,
    key: issue.key,
    projectId,
    sprintId,
    parentKey,
    epicKey,
    sprintAddedAt,
    type: f.issuetype?.name,
    status: f.status?.name,
    statusCategory: mapCategory(f.status?.statusCategory?.key),
    priority: f.priority?.name,
    summary: f.summary,
    storyPoints: extractStoryPoints(f),
    assigneeId,
    reporterId,
    createdAt: f.created,
    updatedAt: f.updated,
    resolvedAt: f.resolutiondate ?? undefined,
  });

  // Changelog → durum geçişleri (yalnızca "status" alanı değişimleri)
  const transitions: { fromStatus?: string; toStatus: string; at: string; byPersonId?: number }[] = [];
  for (const h of issue.changelog?.histories ?? []) {
    for (const it of h.items) {
      if (it.field !== "status") continue;
      transitions.push({
        fromStatus: it.fromString ?? undefined,
        toStatus: it.toString ?? "",
        at: h.created,
        byPersonId: await personId(h.author),
      });
    }
  }
  transitions.sort((a, b) => a.at.localeCompare(b.at));
  await replaceTransitions(workItemId, transitions);

  // Issue linkleri (blocks / relates / duplicates ...)
  const links: { toKey: string; type?: string }[] = [];
  for (const l of anyF.issuelinks ?? []) {
    if (l.outwardIssue?.key) links.push({ toKey: l.outwardIssue.key, type: l.type?.outward ?? l.type?.name });
    else if (l.inwardIssue?.key) links.push({ toKey: l.inwardIssue.key, type: l.type?.inward ?? l.type?.name });
  }
  await replaceIssueLinks(issue.key, links);
}

export async function syncJira(opts: { jql?: string } = {}): Promise<void> {
  await markSync("jira", "sprints", "running");
  try {
    for await (const s of allSprints()) {
      await upsertSprint({
        jiraId: String(s.id),
        name: s.name,
        state: s.state,
        startAt: s.startDate,
        endAt: s.endDate,
        completeAt: s.completeDate,
        goal: s.goal,
      });
    }
    await markSync("jira", "sprints", "ok");
  } catch (e) {
    await markSync("jira", "sprints", "error", String(e));
  }

  await markSync("jira", "work_items", "running");
  try {
    const jql = opts.jql ?? "ORDER BY updated DESC";
    let n = 0;
    for await (const issue of searchIssues(jql)) {
      await syncIssue(issue);
      n++;
      if (n % 100 === 0) console.log(`[jira] ${n} issue işlendi`);
    }
    await markSync("jira", "work_items", "ok", `${n} issue`);
    console.log(`[jira] tamam: ${n} issue`);
  } catch (e) {
    await markSync("jira", "work_items", "error", String(e));
    throw e;
  }
}

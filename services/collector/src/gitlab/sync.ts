/** GitLab → DB senkronu: repo, commit, MR + Jira köprüsü (issue key eşleştirme). */
import {
  upsertRepository, upsertCommit, upsertMergeRequest, upsertPersonByGitlab,
  resolveWorkItemIdByKey, markSync,
} from "../db.js";
import { listProjects, listMergeRequests, listCommits, type GLUser } from "./client.js";
import { extractIssueKey } from "../linking.js";

async function personId(u?: GLUser | null): Promise<number | undefined> {
  if (!u) return undefined;
  return upsertPersonByGitlab({
    displayName: u.name,
    gitlabUserId: u.id,
    gitlabUsername: u.username,
  });
}

async function linkKey(...texts: (string | undefined | null)[]): Promise<number | undefined> {
  const key = extractIssueKey(...texts);
  if (!key) return undefined;
  return resolveWorkItemIdByKey(key);
}

export async function syncGitlab(): Promise<void> {
  await markSync("gitlab", "projects", "running");
  let repoCount = 0;
  try {
    for await (const p of listProjects()) {
      const repoId = await upsertRepository({
        gitlabId: p.id,
        path: p.path_with_namespace,
        name: p.name,
        defaultBranch: p.default_branch,
      });
      repoCount++;

      // --- Merge request'ler ---
      for await (const mr of listMergeRequests(p.id)) {
        const authorId = await personId(mr.author);
        const workItemId = await linkKey(mr.source_branch, mr.title);
        await upsertMergeRequest({
          repoId,
          iid: mr.iid,
          title: mr.title,
          state: mr.state,
          authorId,
          sourceBranch: mr.source_branch,
          targetBranch: mr.target_branch,
          workItemId,
          commentsCount: mr.user_notes_count,
          createdAt: mr.created_at,
          mergedAt: mr.merged_at ?? undefined,
          closedAt: mr.closed_at ?? undefined,
        });
      }

      // --- Commit'ler ---
      for await (const c of listCommits(p.id)) {
        const workItemId = await linkKey(c.message);
        await upsertCommit({
          repoId,
          sha: c.id,
          authoredAt: c.authored_date,
          message: c.message,
          additions: c.stats?.additions,
          deletions: c.stats?.deletions,
          filesChanged: c.stats?.total,
          workItemId,
        });
      }

      console.log(`[gitlab] ${p.path_with_namespace} işlendi`);
    }
    await markSync("gitlab", "projects", "ok", `${repoCount} repo`);
    console.log(`[gitlab] tamam: ${repoCount} repo`);
  } catch (e) {
    await markSync("gitlab", "projects", "error", String(e));
    throw e;
  }
}

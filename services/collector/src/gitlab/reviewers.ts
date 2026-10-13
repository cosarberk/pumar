/**
 * Reviewer sync: MR onaylayanlarını (approved_by) çeker, mr_participants'a yazar.
 * Liste ucunda gelmediği için MR başına approvals çağrısı yapılır (yavaş ama tam).
 */
import { listMergeRequestsForSync, upsertMrParticipant, upsertPersonByGitlab, markSync } from "../db.js";
import { mrApprovals } from "./client.js";

export async function syncReviewers(): Promise<void> {
  await markSync("gitlab", "reviewers", "running");
  const mrs = await listMergeRequestsForSync();
  let done = 0, participants = 0;
  try {
    for (const m of mrs) {
      const appr = await mrApprovals(m.repo_gitlab_id, m.iid).catch(() => null);
      for (const a of appr?.approved_by ?? []) {
        const pid = await upsertPersonByGitlab({
          displayName: a.user.name, gitlabUserId: a.user.id, gitlabUsername: a.user.username,
        });
        await upsertMrParticipant(m.mr_id, pid, "approver");
        participants++;
      }
      if (++done % 200 === 0) console.log(`[reviewers] ${done}/${mrs.length} MR`);
    }
    await markSync("gitlab", "reviewers", "ok", `${participants} onay`);
    console.log(`[reviewers] tamam: ${mrs.length} MR, ${participants} onaylayan`);
  } catch (e) {
    await markSync("gitlab", "reviewers", "error", String(e));
    throw e;
  }
}

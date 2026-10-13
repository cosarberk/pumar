/** Review işbirliği: onaylayan yükü + yazar↔onaylayan grafiği (mr_participants'tan). */
import { query } from "../db.js";

/** Onaylayan yükü: kişi başına kaç MR onayladı, kaç farklı yazara. */
export function reviewerLoad(limit = 50) {
  return query(
    `SELECT p.display_name AS reviewer,
            COUNT(*)                        AS approvals,
            COUNT(DISTINCT m.author_id)     AS authors
     FROM mr_participants mp
     JOIN people p ON p.id = mp.person_id
     JOIN merge_requests m ON m.id = mp.mr_id
     WHERE mp.role = 'approver'
     GROUP BY p.display_name
     ORDER BY approvals DESC`,
  );
}

/** Review özet istatistikleri: merge sayısı, onaylanan oranı, ort. onaylayan. */
export async function reviewStats() {
  const rows = await query<{ merged: string; reviewed: string; approvals: string }>(
    `SELECT
       (SELECT COUNT(*) FROM merge_requests WHERE state = 'merged')                     AS merged,
       (SELECT COUNT(DISTINCT mr_id) FROM mr_participants WHERE role = 'approver')       AS reviewed,
       (SELECT COUNT(*) FROM mr_participants WHERE role = 'approver')                    AS approvals`,
  );
  const r = rows[0];
  const merged = Number(r.merged), reviewed = Number(r.reviewed), approvals = Number(r.approvals);
  return {
    merged, reviewed,
    unreviewed: Math.max(0, merged - reviewed),
    reviewedPct: merged ? Math.round((reviewed / merged) * 100) : 0,
    avgApprovers: reviewed ? +(approvals / reviewed).toFixed(2) : 0,
  };
}

/** Yazar → onaylayan işbirliği grafiği (kim kimin kodunu onaylıyor). */
export async function reviewGraph() {
  const rows = await query<{ author: string; reviewer: string; value: string }>(
    `SELECT pa.display_name AS author, pr.display_name AS reviewer, COUNT(*) AS value
     FROM mr_participants mp
     JOIN merge_requests m ON m.id = mp.mr_id
     JOIN people pa ON pa.id = m.author_id
     JOIN people pr ON pr.id = mp.person_id
     WHERE mp.role = 'approver' AND m.author_id IS NOT NULL AND m.author_id <> mp.person_id
     GROUP BY author, reviewer
     ORDER BY value DESC`,
  );
  const people = new Set<string>();
  const links = rows.map((r) => { people.add(r.author); people.add(r.reviewer); return { source: r.author, target: r.reviewer, value: Number(r.value) }; });
  return { nodes: [...people].map((id) => ({ id, kind: "person" as const })), links };
}

/**
 * Collab: Knowledge (sahiplik) + Review (işbirliği) birleşik grafı.
 *   collabBase  → kişi + repo düğümleri; kenarlar: sahiplik (kişi→repo) + review (yazar→onaylayan).
 *   collabPerson→ bir kişiyi "genişlet": o kişinin MR'ları (▭) ve atanmış açık iş kartları (○□△).
 * Repo rengi bus-factor (tek kişi payı), kişi rengi onaylayan yükü için metadata taşır.
 */
import { query } from "../db.js";

export async function collabBase() {
  // Sahiplik: kişi → repo (MR yazarlığından)
  const own = await query<{ person: string; repo: string; value: string }>(
    `SELECT p.display_name AS person, r.path AS repo, COUNT(*) AS value
     FROM merge_requests m
     JOIN people p ON p.id = m.author_id
     JOIN repositories r ON r.id = m.repo_id
     GROUP BY p.display_name, r.path
     ORDER BY value DESC`,
  );
  // Review: yazar → onaylayan
  const rev = await query<{ author: string; reviewer: string; value: string }>(
    `SELECT pa.display_name AS author, pr.display_name AS reviewer, COUNT(*) AS value
     FROM mr_participants mp
     JOIN merge_requests m ON m.id = mp.mr_id
     JOIN people pa ON pa.id = m.author_id
     JOIN people pr ON pr.id = mp.person_id
     WHERE mp.role = 'approver' AND m.author_id IS NOT NULL AND m.author_id <> mp.person_id
     GROUP BY author, reviewer
     ORDER BY value DESC`,
  );

  const persons = new Set<string>();
  const repoAgg = new Map<string, { total: number; top: number }>();
  const mrCount = new Map<string, number>();
  const links: any[] = [];

  for (const o of own) {
    persons.add(o.person);
    const v = Number(o.value);
    const ra = repoAgg.get(o.repo) ?? { total: 0, top: 0 };
    ra.total += v; ra.top = Math.max(ra.top, v); repoAgg.set(o.repo, ra);
    mrCount.set(o.person, (mrCount.get(o.person) ?? 0) + v);
    links.push({ source: o.person, target: o.repo, value: v, rel: "own" });
  }
  const approvalsGiven = new Map<string, number>();
  const reviewersOf = new Map<string, number>();
  for (const r of rev) {
    persons.add(r.author); persons.add(r.reviewer);
    approvalsGiven.set(r.reviewer, (approvalsGiven.get(r.reviewer) ?? 0) + Number(r.value));
    reviewersOf.set(r.author, (reviewersOf.get(r.author) ?? 0) + 1);
    links.push({ source: r.author, target: r.reviewer, value: Number(r.value), rel: "review", directed: true, color: "#6ea8fe" });
  }

  const nodes = [
    ...[...persons].map((id) => ({
      id, kind: "person", label: id,
      approvals: approvalsGiven.get(id) ?? 0,     // bu kişi kaç MR onayladı
      mrs: mrCount.get(id) ?? 0,                  // bu kişinin MR'ı
      reviewers: reviewersOf.get(id) ?? 0,        // kaç farklı kişi onu onaylıyor
    })),
    ...[...repoAgg].map(([id, ra]) => ({
      id, kind: "repo", label: id.split("/").pop() ?? id,
      risk: ra.total ? +(ra.top / ra.total).toFixed(2) : 0,   // bus-factor (tek kişi payı)
      total: ra.total,
    })),
  ];
  return { nodes, links };
}

/** Bir kişiyi genişlet: MR'ları (▭) + atanmış açık iş kartları (tip şekliyle). */
export async function collabPerson(name: string) {
  const mrs = await query<{ iid: string; title: string; state: string; repo: string | null }>(
    `SELECT m.iid::text AS iid, m.title, m.state, r.path AS repo
     FROM merge_requests m
     JOIN people p ON p.id = m.author_id
     LEFT JOIN repositories r ON r.id = m.repo_id
     WHERE p.display_name = $1
     ORDER BY m.merged_at DESC NULLS LAST, m.id DESC`,
    [name],
  );
  const items = await query<{ key: string; summary: string; type: string; status_category: string }>(
    `SELECT w.key, w.summary, w.type, w.status_category
     FROM work_items w
     JOIN people p ON p.id = w.assignee_id
     WHERE p.display_name = $1 AND COALESCE(w.status_category,'') <> 'done'
     ORDER BY w.updated_at DESC NULLS LAST`,
    [name],
  );
  const nodes: any[] = [];
  const links: any[] = [];
  for (const m of mrs) {
    const id = `mr:${m.repo ?? ""}!${m.iid}`;
    nodes.push({ id, kind: "mr", type: "mr", label: `!${m.iid}`, iid: m.iid, title: m.title, repo: m.repo, state: m.state });
    links.push({ source: name, target: id, value: 2, rel: "authored", color: "#5fb4a8" });
  }
  for (const it of items) {
    nodes.push({ id: it.key, kind: "work", type: it.type, label: it.key, title: it.summary, cat: it.status_category });
    links.push({ source: name, target: it.key, value: 2, rel: "assigned", color: "#f3a82b" });
  }
  return { nodes, links };
}

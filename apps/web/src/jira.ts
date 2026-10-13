/**
 * Jira/GitLab bağlantıları — URL'ler kodda DEĞİL; backend /config'ten gelir
 * (şimdilik env kaynaklı, ileride DB'deki ayarlar ekranından). setLinks runtime'da doldurur.
 */
let jiraBase = "";
let gitlabBase = "";

export function setLinks(c: { jiraBase?: string; gitlabBase?: string }) {
  if (c.jiraBase != null) jiraBase = c.jiraBase.replace(/\/+$/, "");
  if (c.gitlabBase != null) gitlabBase = c.gitlabBase.replace(/\/+$/, "");
}

/** Yapılandırılmamışsa undefined döner (link yerine düz metin gösterilir). */
export const jiraUrl = (key: string) => (jiraBase ? `${jiraBase}/browse/${key}` : undefined);
/** Repo tam yolu (path_with_namespace) → GitLab proje adresi. */
export const gitlabUrl = (path: string) => (gitlabBase ? `${gitlabBase}/${path.replace(/^\/+/, "")}` : undefined);
/** MR düğüm id'si (`mr:<repo>!<iid>`) → GitLab merge request adresi. */
export const gitlabMrUrl = (mrId: string) => {
  const m = /^mr:(.+)!(\d+)$/.exec(mrId);
  return gitlabBase && m ? `${gitlabBase}/${m[1]}/-/merge_requests/${m[2]}` : undefined;
};

/** Düğüm dış linki: MR → GitLab, diğer (issue/work) → Jira. Tüm graf/tablolar bunu kullanır. */
export function nodeLink(n?: { id?: string; kind?: string; repo?: string | null; iid?: string | number }): string | undefined {
  if (!n) return undefined;
  if (n.kind === "mr") {
    if (n.repo && n.iid != null) return gitlabUrl(`${n.repo}/-/merge_requests/${n.iid}`);
    return n.id ? gitlabMrUrl(n.id) : undefined;
  }
  return n.id ? jiraUrl(n.id) : undefined;
}

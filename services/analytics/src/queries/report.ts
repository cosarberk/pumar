/**
 * Rapor şablonları CRUD. Kaydedilen = Document konfigürasyonu (JSONB), veri değil.
 * Rapor her üretildiğinde veri canlı çekilir; şablon sadece "nasıl" bilgisini tutar.
 */
import { randomUUID } from "node:crypto";
import { query } from "../db.js";

export interface TemplateMeta { id: string; name: string; description: string; updated_at: string }
export interface TemplateFull extends TemplateMeta { config: unknown }

export async function listTemplates(): Promise<TemplateMeta[]> {
  return query<TemplateMeta>(
    `SELECT id, name, description, updated_at FROM report_templates ORDER BY updated_at DESC`,
  );
}

export async function getTemplate(id: string): Promise<TemplateFull | null> {
  const r = await query<TemplateFull>(
    `SELECT id, name, description, config, updated_at FROM report_templates WHERE id = $1`,
    [id],
  );
  return r[0] ?? null;
}

export async function saveTemplate(t: { id?: string; name: string; description?: string; config: unknown }): Promise<TemplateFull | null> {
  const id = t.id && t.id.length ? t.id : randomUUID();
  await query(
    `INSERT INTO report_templates(id, name, description, config, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, config = excluded.config, updated_at = now()`,
    [id, t.name || "Adsız Rapor", t.description ?? "", JSON.stringify(t.config ?? {})],
  );
  return getTemplate(id);
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  await query(`DELETE FROM report_templates WHERE id = $1`, [id]);
  return { ok: true };
}

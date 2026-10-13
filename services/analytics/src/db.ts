import pg from "pg";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// .env monorepo kökünde; komut hangi dizinden çalışırsa çalışsın oradan yükle.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Eksik ortam değişkeni: DATABASE_URL");

export const pool = new pg.Pool({ connectionString: databaseUrl });

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

/**
 * Şema uygulayıcı — infra/migrations/*.sql dosyalarını sırayla, bir kez uygular.
 * Uygulananları `schema_migrations` tablosunda izler; tekrar çalıştırmak idempotenttir.
 * Kubernetes'te Helm hook Job'ı + initContainer olarak koşar (DATABASE_URL env'den).
 *
 *   DATABASE_URL=postgres://... npx tsx infra/migrate.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const applied = new Set(
      (await client.query<{ filename: string }>(`SELECT filename FROM schema_migrations`)).rows.map((r) => r.filename),
    );
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`• ${file} — zaten uygulanmış, atlandı`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`→ ${file} uygulanıyor…`);
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations(filename) VALUES($1)`, [file]);
      ran++;
      console.log(`✓ ${file}`);
    }
    console.log(ran ? `Tamamlandı: ${ran} migration uygulandı.` : "Şema güncel, uygulanacak migration yok.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Migration hatası:", e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Kullanıcı yönetim CLI'ı — hesaplar yalnızca buradan oluşturulur (hardcoded hesap yok).
 * İş mantığı queries/auth.ts'te; bu dosya yalnız etkileşim/girdi katmanı.
 *
 *   pnpm --filter @pumar/analytics user:add                 # etkileşimli ekleme
 *   pnpm --filter @pumar/analytics user add <email> [ad] [role]
 *   pnpm --filter @pumar/analytics user list
 *   pnpm --filter @pumar/analytics user passwd <email>
 *   pnpm --filter @pumar/analytics user role <email> <admin|member>
 *   pnpm --filter @pumar/analytics user disable|enable <email>
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pool } from "./db.js";
import { createUser, listUsers, setPassword, setRole, setDisabled, type Role } from "./queries/auth.js";

const rl = createInterface({ input: stdin, output: stdout });

async function ask(q: string, def?: string): Promise<string> {
  const a = (await rl.question(def ? `${q} [${def}] ` : `${q} `)).trim();
  return a || def || "";
}

/** Gizli (ekrana yansımayan) girdi — şifre için. */
function askSecret(q: string): Promise<string> {
  stdout.write(q + " ");
  if (!stdin.isTTY) {
    return new Promise((res) => stdin.once("data", (d) => res(d.toString().replace(/\r?\n$/, ""))));
  }
  return new Promise((res) => {
    const prev = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    let buf = "";
    const onData = (chunk: Buffer) => {
      const s = chunk.toString();
      if (s === "\r" || s === "\n" || s === "\u0004") {
        stdin.setRawMode?.(prev);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        res(buf);
      } else if (s === "\u0003") {
        process.exit(1); // Ctrl+C
      } else if (s === "\u007f" || s === "\b") {
        buf = buf.slice(0, -1);
      } else {
        buf += s;
      }
    };
    stdin.on("data", onData);
  });
}

function normalizeRole(v: string): Role {
  const r = v.toLowerCase();
  if (r !== "admin" && r !== "member") throw new Error(`Geçersiz rol: ${v} (admin|member)`);
  return r;
}

async function readNewPassword(label = "Şifre"): Promise<string> {
  const pw = await askSecret(`${label} (min 8):`);
  const confirm = await askSecret(`${label} (tekrar):`);
  if (pw !== confirm) throw new Error("Şifreler eşleşmedi");
  return pw;
}

async function addInteractive(preEmail?: string, preName?: string, preRole?: string) {
  const email = preEmail ?? (await ask("E-posta:"));
  if (!email) throw new Error("E-posta zorunlu");
  const displayName = preName ?? (await ask("Görünen ad:", email.split("@")[0]));
  const role = normalizeRole(preRole ?? (await ask("Rol (admin|member):", "member")));
  const password = await readNewPassword();
  const user = await createUser({ email, displayName, password, role });
  console.log(`✓ Oluşturuldu: #${user.id} ${user.email} (${user.role})`);
}

async function printList() {
  const users = await listUsers();
  if (!users.length) return console.log("(kullanıcı yok)");
  console.table(
    users.map((u) => ({
      id: u.id, email: u.email, ad: u.displayName, rol: u.role,
      durum: u.disabled ? "KAPALI" : "aktif",
      sonGiriş: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("tr-TR") : "—",
    })),
  );
}

async function main() {
  const args = process.argv.slice(2);
  // package.json "user:add" script'i doğrudan ekleme moduna girer.
  const sub = process.env.PUMAR_USER_CMD ?? args.shift();
  try {
    switch (sub) {
      case "add":
        await addInteractive(args[0], args[1], args[2]);
        break;
      case "list":
        await printList();
        break;
      case "passwd":
        if (!args[0]) throw new Error("Kullanım: user passwd <email>");
        await setPassword(args[0], await readNewPassword("Yeni şifre"));
        console.log(`✓ Şifre güncellendi: ${args[0]} (mevcut oturumlar kapatıldı)`);
        break;
      case "role":
        if (!args[0] || !args[1]) throw new Error("Kullanım: user role <email> <admin|member>");
        await setRole(args[0], normalizeRole(args[1]));
        console.log(`✓ Rol güncellendi: ${args[0]} → ${args[1].toLowerCase()}`);
        break;
      case "disable":
        if (!args[0]) throw new Error("Kullanım: user disable <email>");
        await setDisabled(args[0], true);
        console.log(`✓ ${args[0]} → devre dışı (oturumlar kapatıldı)`);
        break;
      case "enable":
        if (!args[0]) throw new Error("Kullanım: user enable <email>");
        await setDisabled(args[0], false);
        console.log(`✓ ${args[0]} → aktif`);
        break;
      default:
        console.log("Kullanım: user <add|list|passwd|role|disable|enable> [args]");
    }
  } catch (e) {
    console.error("HATA:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
}

main();

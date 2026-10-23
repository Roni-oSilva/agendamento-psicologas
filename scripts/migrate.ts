import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../lib/db";

export async function migrate() {
  const p = pool();
  await p.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await p.query("select 1 from schema_migrations where name=$1", [f]);
    if (done.rowCount) continue;
    const c = await p.connect();
    try {
      await c.query("begin");
      await c.query(readFileSync(path.join(dir, f), "utf8"));
      await c.query("insert into schema_migrations(name) values($1)", [f]);
      await c.query("commit");
      console.log("migração aplicada:", f);
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  migrate().then(() => pool().end()).catch((e) => { console.error(e); process.exit(1); });
}

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

const g = globalThis as unknown as { __pool?: Pool };

export function pool(): Pool {
  if (!g.__pool) {
    g.__pool = new Pool({ connectionString: env.databaseUrl, max: 20 });
  }
  return g.__pool;
}

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool().query<T>(text, params);
}

export async function one<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  const r = await pool().query<T>(text, params);
  return r.rows[0] ?? null;
}

/** Executa fn dentro de uma transação. Qualquer exceção faz ROLLBACK. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

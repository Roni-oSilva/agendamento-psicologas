import type { PoolClient } from "pg";
import { pool } from "./db";

type Db = Pick<PoolClient, "query">;

/** Meta mínima: nunca incluir dados clínicos, telefones ou e-mails. */
export async function audit(
  db: Db | null,
  entry: { userId?: string | null; professionalId?: string | null; action: string; resourceType?: string; resourceId?: string; meta?: Record<string, unknown> },
) {
  await (db ?? pool()).query(
    `insert into audit_logs(user_id, professional_id, action, resource_type, resource_id, meta) values($1,$2,$3,$4,$5,$6)`,
    [entry.userId ?? null, entry.professionalId ?? null, entry.action, entry.resourceType ?? null, entry.resourceId ?? null, entry.meta ?? {}],
  );
}

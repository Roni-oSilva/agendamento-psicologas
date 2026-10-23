import { query } from "./db";

/** Retorna true se ainda dentro do limite (e registra o evento). */
export async function hit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const r = await query<{ n: string }>(
    `select count(*)::text n from rate_limit_events where bucket=$1 and created_at > now() - make_interval(secs => $2)`,
    [bucket, windowSeconds],
  );
  if (Number(r.rows[0].n) >= max) return false;
  await query(`insert into rate_limit_events(bucket) values($1)`, [bucket]);
  return true;
}

export async function clearBucket(bucket: string) {
  await query(`delete from rate_limit_events where bucket=$1`, [bucket]);
}

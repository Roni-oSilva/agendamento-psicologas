import { query } from "@/lib/db";
import { json } from "@/lib/http";

/** Saúde da aplicação + fila de notificações. Detalhes só com HEALTH_TOKEN; público retorna apenas ok/erro. */
export async function GET(req: Request) {
  try {
    await query("select 1");
    const detailed = process.env.HEALTH_TOKEN && req.headers.get("authorization") === `Bearer ${process.env.HEALTH_TOKEN}`;
    if (!detailed) return json({ status: "ok" });
    const q = await query(`
      select count(*) filter (where status='pending' and scheduled_at < now() - interval '10 minutes')::int as overdue,
             count(*) filter (where status='pending')::int as pending,
             count(*) filter (where status='failed' and updated_at > now() - interval '24 hours')::int as failed_24h,
             extract(epoch from now() - min(scheduled_at) filter (where status='pending' and scheduled_at < now()))::int as oldest_overdue_seconds
      from notification_jobs`);
    const row = q.rows[0];
    return json({ status: row.overdue > 0 ? "degraded" : "ok", queue: row }, row.overdue > 0 ? 200 : 200);
  } catch {
    return json({ status: "error" }, 503);
  }
}

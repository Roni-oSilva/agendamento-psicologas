import { pool } from "../lib/db";

/** Limpeza de dados técnicos antigos. Execute diariamente (cron). Não apaga dados de pacientes/agendamentos. */
async function main() {
  const q = (t: string) => pool().query(t).then((r) => r.rowCount);
  console.log("sessões expiradas:", await q(`delete from sessions where expires_at < now()`));
  console.log("resets de senha antigos:", await q(`delete from password_resets where expires_at < now() - interval '7 days'`));
  console.log("eventos de rate limit:", await q(`delete from rate_limit_events where created_at < now() - interval '2 days'`));
  console.log("eventos de webhook (>90d):", await q(`delete from webhook_events where received_at < now() - interval '90 days'`));
  console.log("jobs de notificação finalizados (>180d):", await q(`delete from notification_jobs where status in ('sent','delivered','cancelled','skipped','test_sent','failed') and updated_at < now() - interval '180 days'`));
}
main().then(() => pool().end()).catch((e) => { console.error(e); process.exit(1); });

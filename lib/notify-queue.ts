import type { PoolClient } from "pg";

type Q = Pick<PoolClient, "query">;

interface Appt { id: string; professional_id: string; start_at: Date }
interface Pat { contact_preference: string; reminders_opt_in: boolean; email: string | null }
interface Prof { send_reminders: boolean; extra_reminder_hours: number | null }

async function insert(db: Q, a: Appt, channel: string, type: string, at: Date) {
  // dedupe_key impede duplicidade mesmo com reenvio de requisições ou chamadas repetidas
  const key = `${a.id}:${type}:${channel}:${a.start_at.getTime()}`;
  await db.query(
    `insert into notification_jobs(appointment_id, professional_id, channel, type, scheduled_at, appointment_start_at, dedupe_key)
     values($1,$2,$3,$4,$5,$6,$7) on conflict (dedupe_key) do nothing`,
    [a.id, a.professional_id, channel, type, at, a.start_at, key],
  );
}

function channels(p: Pat): string[] {
  if (p.contact_preference === "none") return [];
  const ch: string[] = [];
  if (p.contact_preference === "whatsapp") ch.push("whatsapp");
  if (p.email && process.env.RESEND_API_KEY) ch.push("email"); // só enfileira e-mail se o provedor estiver configurado
  return ch;
}

/** Enfileira mensagem imediata (confirmação/remarcação/cancelamento) e lembretes futuros. */
export async function enqueueAppointmentNotifications(
  db: Q, a: Appt, p: Pat, prof: Prof, immediate: "confirmation" | "rescheduled" | "cancelled", now = new Date(),
) {
  for (const ch of channels(p)) await insert(db, a, ch, immediate, now);
  if (immediate === "cancelled" || !prof.send_reminders || !p.reminders_opt_in) return;
  for (const ch of channels(p)) {
    const t24 = new Date(a.start_at.getTime() - 24 * 3600_000);
    if (t24 > now) await insert(db, a, ch, "reminder_24h", t24);
    if (prof.extra_reminder_hours) {
      const tx = new Date(a.start_at.getTime() - prof.extra_reminder_hours * 3600_000);
      if (tx > now) await insert(db, a, ch, "reminder_extra", tx);
    }
  }
}

/** Cancela jobs ainda não enviados (usado em remarcação e cancelamento). */
export async function cancelPendingJobs(db: Q, appointmentId: string, types?: string[]) {
  await db.query(
    `update notification_jobs set status='cancelled', updated_at=now()
     where appointment_id=$1 and status in ('pending','processing') and ($2::text[] is null or type = any($2))`,
    [appointmentId, types ?? null],
  );
}

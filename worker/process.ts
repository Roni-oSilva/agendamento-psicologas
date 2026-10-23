import { pool } from "../lib/db";
import { buildVars, render, DEFAULT_TEMPLATES, type MessageType } from "../lib/messages";
import { SendError, sendWhatsApp, whatsappConfigured } from "../lib/providers/whatsapp";
import { sendEmail, emailConfigured } from "../lib/providers/email";
import { env } from "../lib/env";

const STALE_LOCK_MINUTES = 10;
const backoffSeconds = (attempt: number) => Math.min(60 * 2 ** (attempt - 1), 3600); // 1m, 2m, 4m, 8m…

export interface ProcessSummary { claimed: number; sent: number; testSent: number; failed: number; retried: number; skipped: number }

/** Processa jobs vencidos. Seguro para múltiplos workers (FOR UPDATE SKIP LOCKED). */
export async function processDueJobs(limit = 20, now = new Date()): Promise<ProcessSummary> {
  const sum: ProcessSummary = { claimed: 0, sent: 0, testSent: 0, failed: 0, retried: 0, skipped: 0 };
  const channels = [whatsappConfigured() && "whatsapp", emailConfigured() && "email"].filter(Boolean) as string[];
  if (!channels.length) return sum; // sem integração configurada: jobs permanecem pendentes (nada é simulado)

  const claimed = await pool().query(
    `update notification_jobs set status='processing', locked_at=$2, attempts=attempts+1, updated_at=$2
     where id in (
       select id from notification_jobs
       where channel = any($3) and scheduled_at <= $2
         and (status='pending' or (status='processing' and locked_at < $2 - make_interval(mins => $4)))
       order by scheduled_at limit $1 for update skip locked)
     returning *`,
    [limit, now, channels, STALE_LOCK_MINUTES],
  );
  sum.claimed = claimed.rowCount ?? 0;

  for (const job of claimed.rows) {
    try {
      const out = await handle(job, now);
      sum[out] += 1;
    } catch (e) {
      console.error("[worker] erro inesperado no job", job.id, (e as Error).message);
      await fail(job, e instanceof SendError ? e : new SendError((e as Error).message, false), sum);
    }
  }
  return sum;
}

async function handle(job: any, now: Date): Promise<"sent" | "testSent" | "skipped"> {
  const r = await pool().query(
    `select a.*, p.name as patient_name, p.phone, p.email as patient_email, p.reminders_opt_in, p.contact_preference, p.anonymized_at,
            pr.display_name, pr.slug, pr.send_reminders, s.name as service_name
     from appointments a join patients p on p.id=a.patient_id join professionals pr on pr.id=a.professional_id
     join services s on s.id=a.service_id where a.id=$1`, [job.appointment_id]);
  const a = r.rows[0];
  const finish = async (status: string, extra: Record<string, unknown> = {}) => {
    await pool().query(
      `update notification_jobs set status=$2, last_error=$3, provider_message_id=$4, sent_at=$5, updated_at=now() where id=$1 and status='processing'`,
      [job.id, status, (extra.error as string) ?? null, (extra.messageId as string) ?? null, extra.sentAt ?? null]);
  };
  const type = job.type as MessageType;
  const isReminder = type === "reminder_24h" || type === "reminder_extra";

  // Condições mudaram desde o enfileiramento? Não enviar mensagem desatualizada.
  if (!a || a.anonymized_at) { await finish("skipped", { error: "paciente/agendamento indisponível" }); return "skipped"; }
  if (type !== "cancelled" && type !== "waitlist_offer") {
    if (["cancelled", "completed", "no_show"].includes(a.status) || a.start_at.getTime() !== job.appointment_start_at.getTime()) {
      await finish("cancelled", { error: "agendamento alterado após o enfileiramento" }); return "skipped";
    }
  }
  if (isReminder && (!a.reminders_opt_in || !a.send_reminders || a.start_at <= now)) {
    await finish("skipped", { error: "lembrete desabilitado ou consulta já iniciada" }); return "skipped";
  }

  const tpl = await pool().query(
    `select body, provider_template_name, status from notification_templates where professional_id=$1 and channel=$2 and type=$3`,
    [a.professional_id, job.channel, type]);
  const t = tpl.rows[0];
  const vars = buildVars({
    appointmentId: a.id, manageTokenVersion: a.manage_token_version, startAt: a.start_at, timezone: a.timezone,
    modality: a.modality, patientName: a.patient_name, professionalName: a.display_name, professionalSlug: a.slug,
  }, type);
  const body = render(t?.status !== "inactive" && t?.body ? t.body : DEFAULT_TEMPLATES[type], vars);
  const templateName = t?.provider_template_name ?? process.env[`WHATSAPP_TEMPLATE_${type.toUpperCase()}`] ?? null;

  if (job.channel === "whatsapp") {
    const res = await sendWhatsApp({
      to: a.phone, body, templateName,
      templateParams: [vars.nome_paciente, vars.nome_psicologa, vars.data, vars.horario, vars.modalidade, vars.link_gerenciamento],
    });
    await finish(res.test ? "test_sent" : "sent", { messageId: res.messageId, sentAt: new Date() });
    return res.test ? "testSent" : "sent";
  }
  if (!a.patient_email) { await finish("skipped", { error: "sem e-mail" }); return "skipped"; }
  const res = await sendEmail({ to: a.patient_email, subject: `Sua consulta com ${a.display_name}`, text: body });
  await finish("sent", { messageId: res.messageId, sentAt: new Date() });
  return "sent";
}

async function fail(job: any, err: SendError, sum: ProcessSummary) {
  const exhausted = job.attempts >= job.max_attempts;
  if (err.permanent || exhausted) {
    await pool().query(`update notification_jobs set status='failed', last_error=$2, updated_at=now() where id=$1`, [job.id, err.message.slice(0, 500)]);
    sum.failed += 1;
  } else {
    await pool().query(
      `update notification_jobs set status='pending', last_error=$2, scheduled_at=now() + make_interval(secs => $3), locked_at=null, updated_at=now() where id=$1`,
      [job.id, err.message.slice(0, 500), backoffSeconds(job.attempts)]);
    sum.retried += 1;
  }
}

export { env };

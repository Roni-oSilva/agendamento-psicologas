import { DateTime } from "luxon";
import type { PoolClient } from "pg";
import { tx } from "./db";
import { slotsForDate } from "./availability";
import { configOf, loadAvailabilityData, type ProfessionalRow } from "./schedule";
import { appointmentCode } from "./tokens";
import { enqueueAppointmentNotifications, cancelPendingJobs } from "./notify-queue";
import { audit } from "./audit";
import { localDate } from "./time";

export class BookingError extends Error {
  constructor(public code:
    | "SLOT_UNAVAILABLE" | "NOT_FOUND" | "INVALID_STATE" | "TOO_LATE" | "SERVICE_INACTIVE" | "EMAIL_REQUIRED" | "CONSENT_REQUIRED",
    message: string) { super(message); }
}

export type Actor = { type: "patient" } | { type: "professional"; userId: string } | { type: "system" };

const ACTIVE = ["pending", "confirmed", "completed", "no_show"];

/** Serializa operações de agenda por profissional (a restrição de exclusão é a garantia final). */
async function lockProfessional(c: PoolClient, professionalId: string) {
  await c.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [professionalId]);
}

async function assertSlotFree(
  c: PoolClient, prof: ProfessionalRow, start: Date, durationMinutes: number, excludeId?: string, now = new Date(),
) {
  const date = localDate(start, prof.timezone);
  const data = await loadAvailabilityData(c, prof, date, date, excludeId);
  const slots = slotsForDate(date, durationMinutes, configOf(prof), data, now);
  if (!slots.some((s) => s.start.getTime() === start.getTime())) {
    throw new BookingError("SLOT_UNAVAILABLE", "Este horário acabou de ficar indisponível.");
  }
}

const isExclusionViolation = (e: any) => e?.code === "23P01";

export interface CreateInput {
  professionalId: string;
  serviceId: string;
  start: Date;
  patient: { name: string; phone: string; email?: string | null; contactPreference?: "whatsapp" | "email" | "none" };
  patientNote?: string | null;
  consent: { dataProcessing: boolean; whatsappContact?: boolean; textVersion: string };
  idempotencyKey?: string | null;
  source?: "online" | "manual";
  actor?: Actor;
  /** profissional criando manualmente pode ignorar antecedência mínima/limite diário */
  now?: Date;
}

export async function createAppointment(input: CreateInput) {
  const now = input.now ?? new Date();
  const source = input.source ?? "online";
  try {
    return await tx(async (c) => {
      await lockProfessional(c, input.professionalId);

      // Idempotência: mesma chave => mesmo agendamento (reenvio, duplo clique, retry de rede)
      if (input.idempotencyKey) {
        const ex = await c.query(
          `select * from appointments where professional_id=$1 and idempotency_key=$2`,
          [input.professionalId, input.idempotencyKey],
        );
        if (ex.rows[0]) return { appointment: ex.rows[0], replay: true };
      }

      const prof = (await c.query(`select * from professionals where id=$1`, [input.professionalId])).rows[0] as ProfessionalRow;
      if (!prof) throw new BookingError("NOT_FOUND", "Profissional não encontrada.");
      const svc = (await c.query(`select * from services where id=$1 and professional_id=$2`, [input.serviceId, prof.id])).rows[0];
      if (!svc || svc.status !== "active") throw new BookingError("SERVICE_INACTIVE", "Serviço indisponível.");
      if (source === "online") {
        if (!input.consent.dataProcessing) throw new BookingError("CONSENT_REQUIRED", "É necessário aceitar o tratamento de dados.");
        if (prof.require_email && !input.patient.email) throw new BookingError("EMAIL_REQUIRED", "E-mail obrigatório.");
      }

      if (source === "online") {
        await assertSlotFree(c, prof, input.start, svc.duration_minutes, undefined, now);
      } else {
        // agendamento manual: respeita jornada/bloqueios/conflitos, mas não a antecedência mínima
        await assertSlotFree(c, { ...prof, min_notice_hours: 0, max_advance_days: 365 * 2 } as ProfessionalRow, input.start, svc.duration_minutes, undefined, new Date(Math.min(now.getTime(), input.start.getTime())));
      }

      const end = new Date(input.start.getTime() + svc.duration_minutes * 60_000);
      const blockEnd = new Date(end.getTime() + prof.buffer_minutes * 60_000);

      const pref = input.patient.contactPreference ?? "whatsapp";
      const patient = (await c.query(
        `insert into patients(professional_id, name, phone, email, contact_preference)
         values($1,$2,$3,$4,$5)
         on conflict (professional_id, phone) do update
           set name=excluded.name, email=coalesce(excluded.email, patients.email), updated_at=now()
         returning *`,
        [prof.id, input.patient.name, input.patient.phone, input.patient.email ?? null, pref],
      )).rows[0];

      const code = appointmentCode();
      const appt = (await c.query(
        `insert into appointments(code, professional_id, patient_id, service_id, start_at, end_at, block_end_at,
            status, modality, timezone, source, patient_note, idempotency_key)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
        [code, prof.id, patient.id, svc.id, input.start, end, blockEnd,
         source === "manual" ? "confirmed" : "pending", svc.modality, prof.timezone, source,
         input.patientNote ?? null, input.idempotencyKey ?? null],
      )).rows[0];

      await c.query(
        `insert into appointment_history(appointment_id, actor_user_id, actor_type, action, to_start, to_end, to_status)
         values($1,$2,$3,'created',$4,$5,$6)`,
        [appt.id, input.actor?.type === "professional" ? input.actor.userId : null, input.actor?.type ?? "patient",
         appt.start_at, appt.end_at, appt.status],
      );

      if (input.consent.dataProcessing) {
        await c.query(`insert into consent_records(patient_id, consent_type, text_version, source) values($1,'data_processing',$2,$3)`,
          [patient.id, input.consent.textVersion, source]);
      }
      if (input.consent.whatsappContact) {
        await c.query(`insert into consent_records(patient_id, consent_type, text_version, source) values($1,'whatsapp_contact',$2,$3)`,
          [patient.id, input.consent.textVersion, source]);
      }

      await enqueueAppointmentNotifications(c, appt, patient, prof, "confirmation", now);
      if (input.actor?.type === "professional") {
        await audit(c, { userId: input.actor.userId, professionalId: prof.id, action: "appointment.create_manual", resourceType: "appointment", resourceId: appt.id });
      }
      return { appointment: appt, replay: false };
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("SLOT_UNAVAILABLE", "Este horário acabou de ficar indisponível.");
    throw e;
  }
}

async function loadForUpdate(c: PoolClient, id: string, professionalId?: string) {
  const r = await c.query(
    `select a.*, s.duration_minutes from appointments a join services s on s.id=a.service_id
     where a.id=$1 ${professionalId ? "and a.professional_id=$2" : ""} for update of a`,
    professionalId ? [id, professionalId] : [id],
  );
  if (!r.rows[0]) throw new BookingError("NOT_FOUND", "Agendamento não encontrado.");
  return r.rows[0];
}

/** Regra do prazo mínimo vale para o paciente; a profissional pode sempre alterar. */
function assertDeadline(appt: any, prof: ProfessionalRow, actor: Actor, now: Date) {
  if (actor.type !== "patient") return;
  const limit = appt.start_at.getTime() - prof.cancel_deadline_hours * 3600_000;
  if (now.getTime() > limit) {
    throw new BookingError("TOO_LATE", `Alterações só podem ser feitas com ${prof.cancel_deadline_hours}h de antecedência. Entre em contato com a profissional.`);
  }
}

export async function rescheduleAppointment(opts: {
  appointmentId: string; newStart: Date; actor: Actor; professionalId?: string; now?: Date; ignoreNotice?: boolean;
}) {
  const now = opts.now ?? new Date();
  try {
    return await tx(async (c) => {
      const pre = await c.query(`select professional_id from appointments where id=$1`, [opts.appointmentId]);
      if (!pre.rows[0]) throw new BookingError("NOT_FOUND", "Agendamento não encontrado.");
      await lockProfessional(c, pre.rows[0].professional_id);
      const appt = await loadForUpdate(c, opts.appointmentId, opts.professionalId);
      if (!["pending", "confirmed"].includes(appt.status)) throw new BookingError("INVALID_STATE", "Este agendamento não pode ser remarcado.");
      const prof = (await c.query(`select * from professionals where id=$1`, [appt.professional_id])).rows[0] as ProfessionalRow;
      assertDeadline(appt, prof, opts.actor, now);

      const relaxed = opts.actor.type === "professional" || opts.ignoreNotice;
      const checkProf = relaxed ? ({ ...prof, min_notice_hours: 0, max_advance_days: 365 * 2 } as ProfessionalRow) : prof;
      await assertSlotFree(c, checkProf, opts.newStart, appt.duration_minutes, appt.id, relaxed ? new Date(Math.min(now.getTime(), opts.newStart.getTime())) : now);

      const newEnd = new Date(opts.newStart.getTime() + appt.duration_minutes * 60_000);
      const newBlockEnd = new Date(newEnd.getTime() + prof.buffer_minutes * 60_000);
      const upd = (await c.query(
        `update appointments set start_at=$2, end_at=$3, block_end_at=$4, rescheduled_count=rescheduled_count+1, updated_at=now()
         where id=$1 returning *`, [appt.id, opts.newStart, newEnd, newBlockEnd],
      )).rows[0];

      await c.query(
        `insert into appointment_history(appointment_id, actor_user_id, actor_type, action, from_start, from_end, to_start, to_end, from_status, to_status)
         values($1,$2,$3,'rescheduled',$4,$5,$6,$7,$8,$8)`,
        [appt.id, opts.actor.type === "professional" ? opts.actor.userId : null, opts.actor.type,
         appt.start_at, appt.end_at, upd.start_at, upd.end_at, appt.status],
      );

      // cancela lembretes antigos e programa os novos
      await cancelPendingJobs(c, appt.id);
      const patient = (await c.query(`select * from patients where id=$1`, [appt.patient_id])).rows[0];
      await enqueueAppointmentNotifications(c, upd, patient, prof, "rescheduled", now);
      if (opts.actor.type === "professional") {
        await audit(c, { userId: opts.actor.userId, professionalId: prof.id, action: "appointment.reschedule", resourceType: "appointment", resourceId: appt.id });
      }
      return upd;
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("SLOT_UNAVAILABLE", "Este horário acabou de ficar indisponível.");
    throw e;
  }
}

export async function cancelAppointment(opts: {
  appointmentId: string; actor: Actor; reason?: string | null; professionalId?: string; now?: Date;
}) {
  const now = opts.now ?? new Date();
  return tx(async (c) => {
    const pre = await c.query(`select professional_id from appointments where id=$1`, [opts.appointmentId]);
    if (!pre.rows[0]) throw new BookingError("NOT_FOUND", "Agendamento não encontrado.");
    await lockProfessional(c, pre.rows[0].professional_id);
    const appt = await loadForUpdate(c, opts.appointmentId, opts.professionalId);
    if (!["pending", "confirmed"].includes(appt.status)) throw new BookingError("INVALID_STATE", "Este agendamento não pode ser cancelado.");
    const prof = (await c.query(`select * from professionals where id=$1`, [appt.professional_id])).rows[0] as ProfessionalRow;
    assertDeadline(appt, prof, opts.actor, now);

    const upd = (await c.query(
      `update appointments set status='cancelled', cancelled_at=now(), cancel_reason=$2, cancelled_by=$3, updated_at=now()
       where id=$1 returning *`, [appt.id, opts.reason ?? null, opts.actor.type],
    )).rows[0];
    await c.query(
      `insert into appointment_history(appointment_id, actor_user_id, actor_type, action, from_start, from_end, from_status, to_status, note)
       values($1,$2,$3,'cancelled',$4,$5,$6,'cancelled',$7)`,
      [appt.id, opts.actor.type === "professional" ? opts.actor.userId : null, opts.actor.type, appt.start_at, appt.end_at, appt.status, opts.reason ?? null],
    );
    await cancelPendingJobs(c, appt.id);
    const patient = (await c.query(`select * from patients where id=$1`, [appt.patient_id])).rows[0];
    await enqueueAppointmentNotifications(c, upd, patient, prof, "cancelled", now);
    if (opts.actor.type === "professional") {
      await audit(c, { userId: opts.actor.userId, professionalId: prof.id, action: "appointment.cancel", resourceType: "appointment", resourceId: appt.id });
    }
    return upd;
  });
}

export async function setAppointmentStatus(opts: {
  appointmentId: string; professionalId: string; userId: string; status: "confirmed" | "completed" | "no_show";
}) {
  return tx(async (c) => {
    const appt = await loadForUpdate(c, opts.appointmentId, opts.professionalId);
    const allowed: Record<string, string[]> = {
      confirmed: ["pending"], completed: ["pending", "confirmed"], no_show: ["pending", "confirmed"],
    };
    if (!allowed[opts.status].includes(appt.status)) throw new BookingError("INVALID_STATE", "Transição de status inválida.");
    const upd = (await c.query(`update appointments set status=$2, updated_at=now() where id=$1 returning *`, [appt.id, opts.status])).rows[0];
    await c.query(
      `insert into appointment_history(appointment_id, actor_user_id, actor_type, action, from_status, to_status)
       values($1,$2,'professional','status_changed',$3,$4)`, [appt.id, opts.userId, appt.status, opts.status]);
    if (opts.status !== "confirmed") await cancelPendingJobs(c, appt.id, ["reminder_24h", "reminder_extra"]);
    await audit(c, { userId: opts.userId, professionalId: opts.professionalId, action: `appointment.${opts.status}`, resourceType: "appointment", resourceId: appt.id });
    return upd;
  });
}

/** Bloqueio manual: consultas já marcadas no período são preservadas e a contagem é devolvida para alertar a profissional. */
export async function createBlock(opts: {
  professionalId: string; userId: string; start: Date; end: Date; kind: string; reason?: string | null;
}) {
  return tx(async (c) => {
    await lockProfessional(c, opts.professionalId);
    const conflicts = await c.query(
      `select count(*)::int n from appointments where professional_id=$1 and status in ('pending','confirmed')
         and start_at < $3 and end_at > $2`, [opts.professionalId, opts.start, opts.end]);
    const r = (await c.query(
      `insert into blocked_periods(professional_id, start_at, end_at, kind, reason) values($1,$2,$3,$4,$5) returning *`,
      [opts.professionalId, opts.start, opts.end, opts.kind, opts.reason ?? null])).rows[0];
    await audit(c, { userId: opts.userId, professionalId: opts.professionalId, action: "block.create", resourceType: "blocked_period", resourceId: r.id });
    // consultas já marcadas são preservadas; a profissional é alertada
    return { block: r, conflictingAppointments: conflicts.rows[0].n as number };
  });
}

export { DateTime, ACTIVE };

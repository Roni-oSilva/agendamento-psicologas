import type { PoolClient } from "pg";
import { query } from "./db";
import { dayBounds } from "./time";
import { DateTime } from "luxon";
import type { AvailabilityConfig, AvailabilityData } from "./availability";

export interface ProfessionalRow {
  id: string; slug: string; display_name: string; timezone: string; slot_step_minutes: number;
  buffer_minutes: number; min_notice_hours: number; max_advance_days: number; cancel_deadline_hours: number;
  max_per_day: number | null; require_email: boolean; send_reminders: boolean; extra_reminder_hours: number | null;
  published: boolean; [k: string]: any;
}

export const configOf = (p: ProfessionalRow): AvailabilityConfig => ({
  tz: p.timezone, stepMinutes: p.slot_step_minutes, bufferMinutes: p.buffer_minutes,
  minNoticeHours: p.min_notice_hours, maxAdvanceDays: p.max_advance_days, maxPerDay: p.max_per_day,
});

type Q = Pick<PoolClient, "query">;

/** Carrega regras, ocupações e bloqueios para um intervalo de datas locais [from, to]. */
export async function loadAvailabilityData(
  db: Q | null, p: ProfessionalRow, from: string, to: string, excludeAppointmentId?: string,
): Promise<AvailabilityData> {
  const run = (t: string, a: unknown[]) => (db ? db.query(t, a) : query(t, a));
  const lo = dayBounds(from, p.timezone).start;
  const hi = dayBounds(DateTime.fromISO(to, { zone: p.timezone }).toISODate()!, p.timezone).end;
  // margem de 1 dia p/ pegar ocupações que avançam sobre o intervalo
  const loM = new Date(lo.getTime() - 86400_000);
  const rules = await run(`select weekday, to_char(start_time,'HH24:MI') as start, to_char(end_time,'HH24:MI') as end
         from availability_rules where professional_id=$1 and active`, [p.id]);
  const appts = await run(`select start_at, block_end_at from appointments
         where professional_id=$1 and status in ('pending','confirmed','completed','no_show')
           and start_at < $3 and block_end_at > $2 and ($4::uuid is null or id <> $4)`,
        [p.id, loM, hi, excludeAppointmentId ?? null]);
  const blocks = await run(`select start_at, end_at from blocked_periods where professional_id=$1 and start_at < $3 and end_at > $2`,
        [p.id, loM, hi]);
  return {
    rules: rules.rows,
    busy: appts.rows.map((r: any) => ({ start: r.start_at, end: r.block_end_at })),
    apptStarts: appts.rows.map((r: any) => r.start_at),
    blocks: blocks.rows.map((r: any) => ({ start: r.start_at, end: r.end_at })),
  };
}

export async function getProfessionalBySlug(slug: string, onlyPublished = true): Promise<ProfessionalRow | null> {
  const r = await query(`select * from professionals where slug=$1 ${onlyPublished ? "and published" : ""}`, [slug]);
  return r.rows[0] ?? null;
}

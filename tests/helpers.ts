import { pool, query } from "@/lib/db";
import { migrate } from "@/scripts/migrate";
import { createProfessional } from "@/lib/accounts";
import { DateTime } from "luxon";

export async function resetDb() {
  await migrate();
  await query(`truncate users, rate_limit_events, webhook_events cascade`);
}

export async function setup(overrides: Partial<{ buffer: number; minNotice: number; maxPerDay: number | null; slug: string }> = {}) {
  const slug = overrides.slug ?? "maria-silva";
  const r = await createProfessional({ name: "Maria Silva", email: `${slug}@example.com`, password: "senhaForte123", slug, published: true });
  await query(
    `update professionals set buffer_minutes=$2, min_notice_hours=$3, max_per_day=$4, extra_reminder_hours=null where id=$1`,
    [r.professionalId, overrides.buffer ?? 0, overrides.minNotice ?? 0, overrides.maxPerDay ?? null]);
  return r;
}

/** Próxima segunda-feira (a partir de ~7 dias) às HH:mm em America/Sao_Paulo. */
export function nextMonday(hhmm: string, weeksAhead = 1): Date {
  const [h, m] = hhmm.split(":").map(Number);
  let d = DateTime.now().setZone("America/Sao_Paulo").plus({ weeks: weeksAhead }).startOf("week"); // segunda
  return d.set({ hour: h, minute: m }).toJSDate();
}

export const baseInput = (r: { professionalId: string; serviceId: string }, start: Date, extra: Record<string, unknown> = {}) => ({
  professionalId: r.professionalId, serviceId: r.serviceId, start,
  patient: { name: "Paciente Teste", phone: "5511999990000", email: null },
  consent: { dataProcessing: true, textVersion: "v1" },
  ...extra,
});

export { pool };

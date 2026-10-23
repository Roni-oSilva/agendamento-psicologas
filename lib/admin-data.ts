import { query } from "./db";
import { dayBounds } from "./time";

export interface ApptFilters { status?: string; modality?: string; serviceId?: string; patientId?: string; q?: string }

export async function appointmentsBetween(professionalId: string, from: Date, to: Date, f: ApptFilters = {}) {
  const r = await query(
    `select a.id, a.code, a.start_at, a.end_at, a.status, a.modality, a.rescheduled_count, a.admin_notes, a.source,
            p.id as patient_id, p.name as patient_name, p.phone, s.id as service_id, s.name as service_name
     from appointments a join patients p on p.id=a.patient_id join services s on s.id=a.service_id
     where a.professional_id=$1 and a.start_at >= $2 and a.start_at < $3
       and ($4::text is null or a.status=$4) and ($5::text is null or a.modality=$5)
       and ($6::uuid is null or a.service_id=$6) and ($7::uuid is null or a.patient_id=$7)
       and ($8::text is null or p.name ilike '%'||$8||'%')
     order by a.start_at`,
    [professionalId, from, to, f.status || null, f.modality || null, f.serviceId || null, f.patientId || null, f.q || null]);
  return r.rows;
}

export async function blocksBetween(professionalId: string, from: Date, to: Date) {
  return (await query(`select * from blocked_periods where professional_id=$1 and start_at < $3 and end_at > $2 order by start_at`, [professionalId, from, to])).rows;
}

export const dayRange = (date: string, tz: string) => dayBounds(date, tz);

export async function globalSearch(professionalId: string, q: string) {
  const term = q.trim();
  if (!term) return { patients: [], appointments: [] };
  const digits = term.replace(/\D/g, "");
  const dm = term.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(term) ? term : null;
  const patients = (await query(
    `select id, name, phone, email from patients where professional_id=$1 and anonymized_at is null
       and (name ilike '%'||$2||'%' or email ilike '%'||$2||'%' or ($3 <> '' and phone like '%'||$3||'%')) order by name limit 20`,
    [professionalId, term, digits.length >= 4 ? digits : ""])).rows;
  const appointments = (await query(
    `select a.id, a.code, a.start_at, a.status, p.name as patient_name, a.timezone from appointments a join patients p on p.id=a.patient_id
     where a.professional_id=$1 and (upper(a.code)=upper($2)
       or ($3::date is not null and (a.start_at at time zone a.timezone)::date = $3::date))
     order by a.start_at desc limit 30`, [professionalId, term, iso])).rows;
  return { patients, appointments };
}

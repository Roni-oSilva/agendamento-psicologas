import { DateTime } from "luxon";
import { availableDates, slotsForDate } from "./availability";
import { configOf, loadAvailabilityData, type ProfessionalRow } from "./schedule";
import { fmtTime, todayIn } from "./time";

export async function monthDates(p: ProfessionalRow, durationMinutes: number, month: string, excludeId?: string) {
  const first = DateTime.fromISO(`${month}-01`, { zone: p.timezone });
  if (!first.isValid) return [];
  const from = first.toISODate()!;
  const to = first.endOf("month").toISODate()!;
  const data = await loadAvailabilityData(null, p, from, to, excludeId);
  return availableDates(from, to, durationMinutes, configOf(p), data, new Date());
}

export async function daySlots(p: ProfessionalRow, durationMinutes: number, date: string, excludeId?: string) {
  const data = await loadAvailabilityData(null, p, date, date, excludeId);
  return slotsForDate(date, durationMinutes, configOf(p), data, new Date()).map((s) => ({
    start: s.start.toISOString(), label: fmtTime(s.start, p.timezone),
  }));
}

/** Alternativas para quando o horário escolhido ficou indisponível: próximos dias com vaga. */
export async function alternatives(p: ProfessionalRow, durationMinutes: number, aroundDate: string, excludeId?: string) {
  const from = DateTime.fromISO(aroundDate, { zone: p.timezone }).toISODate()!;
  const lim = DateTime.fromISO(from, { zone: p.timezone }).plus({ days: 14 }).toISODate()!;
  const data = await loadAvailabilityData(null, p, from, lim, excludeId);
  const now = new Date();
  const out: { date: string; start: string; label: string }[] = [];
  for (let d = DateTime.fromISO(from, { zone: p.timezone }); d.toISODate()! <= lim && out.length < 6; d = d.plus({ days: 1 })) {
    for (const s of slotsForDate(d.toISODate()!, durationMinutes, configOf(p), data, now)) {
      out.push({ date: d.toISODate()!, start: s.start.toISOString(), label: fmtTime(s.start, p.timezone) });
      if (out.length >= 6) break;
    }
  }
  return out;
}

export { todayIn };

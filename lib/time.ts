import { DateTime } from "luxon";

export const fmtDate = (d: Date | string, tz: string) =>
  DateTime.fromJSDate(new Date(d), { zone: tz }).setLocale("pt-BR").toFormat("cccc, dd 'de' LLLL 'de' yyyy");
export const fmtDateShort = (d: Date | string, tz: string) =>
  DateTime.fromJSDate(new Date(d), { zone: tz }).setLocale("pt-BR").toFormat("dd/MM/yyyy");
export const fmtTime = (d: Date | string, tz: string) =>
  DateTime.fromJSDate(new Date(d), { zone: tz }).toFormat("HH:mm");
export const localDate = (d: Date | string, tz: string) =>
  DateTime.fromJSDate(new Date(d), { zone: tz }).toISODate()!;
export const todayIn = (tz: string) => DateTime.now().setZone(tz).toISODate()!;

/** Início/fim do dia local como instantes UTC. */
export function dayBounds(date: string, tz: string) {
  const d = DateTime.fromISO(date, { zone: tz });
  return { start: d.startOf("day").toJSDate(), end: d.plus({ days: 1 }).startOf("day").toJSDate() };
}

export const normalizePhone = (raw: string) => {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits; // Brasil por padrão
  return digits;
};
export const validPhone = (digits: string) => /^\d{12,15}$/.test(digits);

import { DateTime } from "luxon";

/** Regras puras de geração de horários. Sem acesso a banco: totalmente testável. */

export interface Rule { weekday: number; start: string; end: string } // weekday ISO 1..7, "HH:mm"
export interface Interval { start: Date; end: Date }

export interface AvailabilityConfig {
  tz: string;
  stepMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  maxPerDay: number | null;
}

export interface AvailabilityData {
  rules: Rule[];
  /** Agendamentos ativos: [start_at, block_end_at) — mesma semântica da restrição do banco. */
  busy: Interval[];
  /** Início de cada agendamento ativo (para limite diário). */
  apptStarts: Date[];
  blocks: Interval[];
}

export interface Slot { start: Date; end: Date }

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && aE > bS;

export function slotsForDate(
  date: string, // YYYY-MM-DD no fuso do profissional
  durationMinutes: number,
  cfg: AvailabilityConfig,
  data: AvailabilityData,
  now: Date,
): Slot[] {
  const day = DateTime.fromISO(date, { zone: cfg.tz });
  if (!day.isValid) return [];

  const earliest = now.getTime() + cfg.minNoticeHours * 3600_000;
  const latest = DateTime.fromJSDate(now, { zone: cfg.tz }).plus({ days: cfg.maxAdvanceDays }).endOf("day").toMillis();

  if (cfg.maxPerDay != null) {
    const dayStart = day.startOf("day").toMillis();
    const dayEnd = day.endOf("day").toMillis();
    const count = data.apptStarts.filter((s) => s.getTime() >= dayStart && s.getTime() <= dayEnd).length;
    if (count >= cfg.maxPerDay) return [];
  }

  const out = new Map<number, Slot>();
  for (const r of data.rules.filter((r) => r.weekday === day.weekday)) {
    const [sh, sm] = r.start.split(":").map(Number);
    const [eh, em] = r.end.split(":").map(Number);
    const wStart = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const wEnd = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    for (let s = wStart; ; s = s.plus({ minutes: cfg.stepMinutes })) {
      const e = s.plus({ minutes: durationMinutes });
      if (e > wEnd) break; // nunca ultrapassa o fim do expediente
      const sMs = s.toMillis();
      const eMs = e.toMillis();
      if (sMs < earliest || sMs > latest) continue;
      const blockEnd = eMs + cfg.bufferMinutes * 60_000;
      if (data.busy.some((b) => overlaps(sMs, blockEnd, b.start.getTime(), b.end.getTime()))) continue;
      if (data.blocks.some((b) => overlaps(sMs, eMs, b.start.getTime(), b.end.getTime()))) continue;
      out.set(sMs, { start: s.toJSDate(), end: e.toJSDate() });
    }
  }
  return [...out.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Dias (YYYY-MM-DD) do intervalo [from, to] que têm ao menos um horário livre. */
export function availableDates(
  from: string,
  to: string,
  durationMinutes: number,
  cfg: AvailabilityConfig,
  data: AvailabilityData,
  now: Date,
): string[] {
  const res: string[] = [];
  let d = DateTime.fromISO(from, { zone: cfg.tz });
  const end = DateTime.fromISO(to, { zone: cfg.tz });
  while (d <= end) {
    const iso = d.toISODate()!;
    if (slotsForDate(iso, durationMinutes, cfg, data, now).length) res.push(iso);
    d = d.plus({ days: 1 });
  }
  return res;
}

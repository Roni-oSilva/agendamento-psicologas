import { describe, it, expect } from "vitest";
import { slotsForDate, availableDates, type AvailabilityConfig, type AvailabilityData } from "@/lib/availability";

const cfg: AvailabilityConfig = { tz: "America/Sao_Paulo", stepMinutes: 30, bufferMinutes: 10, minNoticeHours: 0, maxAdvanceDays: 90, maxPerDay: null };
const rules = [
  { weekday: 1, start: "09:00", end: "12:00" },
  { weekday: 1, start: "14:00", end: "18:00" },
];
const empty: AvailabilityData = { rules, busy: [], apptStarts: [], blocks: [] };
const now = new Date("2030-01-01T00:00:00Z");
const D = "2030-01-07"; // segunda-feira
const t = (hhmm: string) => new Date(`${D}T${hhmm}:00-03:00`);
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

describe("geração de horários", () => {
  it("respeita janelas, almoço e nunca ultrapassa o fim do expediente", () => {
    const s = slotsForDate(D, 50, cfg, empty, now).map((x) => hhmm(x.start));
    expect(s).toContain("09:00");
    expect(s).toContain("11:00"); // 11:00–11:50 cabe
    expect(s).not.toContain("11:30"); // 11:30–12:20 ultrapassa
    expect(s).not.toContain("12:00");
    expect(s).not.toContain("13:30");
    expect(s).toContain("14:00");
    expect(s).toContain("17:00");
    expect(s).not.toContain("17:30");
  });

  it("dia sem regra não tem horários", () => {
    expect(slotsForDate("2030-01-06", 50, cfg, empty, now)).toEqual([]); // domingo
  });

  it("considera o intervalo entre consultas (buffer) nos dois sentidos", () => {
    const data = { ...empty, busy: [{ start: t("10:00"), end: new Date(t("10:50").getTime() + 10 * 60_000) }] };
    const s = slotsForDate(D, 50, cfg, data, now).map((x) => hhmm(x.start));
    expect(s).not.toContain("10:00");
    expect(s).not.toContain("10:30");
    expect(s).not.toContain("09:30"); // 09:30–10:20(+buffer) invade a consulta
    expect(s).toContain("09:00"); // 09:00–09:50 + 10 min de buffer = 10:00, encosta sem sobrepor
    expect(s).toContain("11:00"); // 11:00 >= 11:00 (fim + buffer)
  });

  it("bloqueios removem horários sobrepostos", () => {
    const data = { ...empty, blocks: [{ start: t("15:00"), end: t("16:00") }] };
    const s = slotsForDate(D, 50, cfg, data, now).map((x) => hhmm(x.start));
    expect(s).not.toContain("14:30");
    expect(s).not.toContain("15:00");
    expect(s).not.toContain("15:30");
    expect(s).toContain("16:00");
    expect(s).toContain("14:00"); // 14:00–14:50 termina antes do bloqueio
  });

  it("respeita antecedência mínima e limite futuro", () => {
    const n = new Date(t("09:00").getTime() - 2 * 3600_000);
    const s = slotsForDate(D, 50, { ...cfg, minNoticeHours: 3 }, empty, n).map((x) => hhmm(x.start));
    expect(s[0]).toBe("10:00");
    expect(slotsForDate(D, 50, { ...cfg, maxAdvanceDays: 1 }, empty, now)).toEqual([]);
  });

  it("limite de consultas por dia", () => {
    const data = { ...empty, apptStarts: [t("09:00"), t("10:00")] };
    expect(slotsForDate(D, 50, { ...cfg, maxPerDay: 2 }, data, now)).toEqual([]);
    expect(slotsForDate(D, 50, { ...cfg, maxPerDay: 3 }, data, now).length).toBeGreaterThan(0);
  });

  it("duração por serviço altera quais horários cabem", () => {
    const s30 = slotsForDate(D, 30, cfg, empty, now).map((x) => hhmm(x.start));
    expect(s30).toContain("11:30");
  });

  it("availableDates só retorna dias com horário livre", () => {
    const days = availableDates("2030-01-07", "2030-01-13", 50, cfg, empty, now);
    expect(days).toEqual(["2030-01-07"]);
  });

  it("fuso horário: slots são instantes corretos em UTC", () => {
    const s = slotsForDate(D, 50, cfg, empty, now);
    expect(s[0].start.toISOString()).toBe("2030-01-07T12:00:00.000Z"); // 09:00 -03:00
    const lisbon = slotsForDate(D, 50, { ...cfg, tz: "Europe/Lisbon" }, empty, now);
    expect(lisbon[0].start.toISOString()).toBe("2030-01-07T09:00:00.000Z");
  });

  it("mudança de horário de verão (Nova York, 10/03/2030): 09:00 local segue correto", () => {
    const ny = { ...cfg, tz: "America/New_York" };
    const r = [{ weekday: 7, start: "09:00", end: "10:00" }]; // 2030-03-10 é domingo
    const s = slotsForDate("2030-03-10", 50, ny, { ...empty, rules: r }, now);
    expect(s[0].start.toISOString()).toBe("2030-03-10T13:00:00.000Z"); // EDT (UTC-4), já em horário de verão
    const before = slotsForDate("2030-03-03", 50, ny, { ...empty, rules: [{ weekday: 7, start: "09:00", end: "10:00" }] }, now);
    expect(before[0].start.toISOString()).toBe("2030-03-03T14:00:00.000Z"); // EST (UTC-5)
  });
});

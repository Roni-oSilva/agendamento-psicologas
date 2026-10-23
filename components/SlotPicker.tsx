"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface SlotOption { start: string; label: string }

/** Calendário + lista de horários. As URLs recebem month=YYYY-MM ou date=YYYY-MM-DD. */
export function SlotPicker({
  baseUrl, timezone, value, onChange, refreshKey = 0,
}: { baseUrl: string; timezone?: string; value: SlotOption | null; onChange: (s: SlotOption | null) => void; refreshKey?: number }) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [loadingDates, setLoadingDates] = useState(true);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sep = baseUrl.includes("?") ? "&" : "?";

  const loadDates = useCallback(async () => {
    setLoadingDates(true); setError(null);
    try {
      const r = await fetch(`${baseUrl}${sep}month=${month}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setDates(new Set(j.dates));
    } catch { setError("Não foi possível carregar os horários. Verifique sua conexão e tente novamente."); }
    finally { setLoadingDates(false); }
  }, [baseUrl, month, sep]);

  const loadSlots = useCallback(async (d: string) => {
    setSlots(null); setError(null);
    try {
      const r = await fetch(`${baseUrl}${sep}date=${d}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setSlots((await r.json()).slots);
    } catch { setError("Não foi possível carregar os horários deste dia."); setSlots([]); }
  }, [baseUrl, sep]);

  useEffect(() => { loadDates(); }, [loadDates, refreshKey]);
  useEffect(() => { if (date) loadSlots(date); }, [date, loadSlots, refreshKey]);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = first.getDay();
  const label = first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const iso = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setDate(null); setSlots(null); onChange(null);
  };
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="btn-secondary btn-sm" onClick={() => shift(-1)} disabled={month <= currentMonth} aria-label="Mês anterior">‹</button>
        <h3 className="text-lg first-letter:uppercase" aria-live="polite">{label}</h3>
        <button type="button" className="btn-secondary btn-sm" onClick={() => shift(1)} aria-label="Próximo mês">›</button>
      </div>
      <div role="grid" aria-label={`Calendário de ${label}`} className="grid grid-cols-7 gap-1 text-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="py-1 text-xs text-ink-soft" aria-hidden>{d}</div>)}
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const id = iso(d);
          const ok = dates.has(id);
          const sel = date === id;
          return (
            <button key={id} type="button" disabled={!ok || loadingDates}
              onClick={() => { setDate(id); onChange(null); }}
              aria-pressed={sel}
              aria-label={`${d} de ${label}${ok ? ", com horários disponíveis" : ", indisponível"}`}
              className={`aspect-square min-h-11 rounded-xl text-base transition ${sel ? "bg-sage-700 text-white" : ok ? "bg-sage-100 font-semibold text-sage-800 hover:bg-sage-200" : "text-ink-soft/40"}`}>
              {d}
            </button>
          );
        })}
      </div>
      {loadingDates && <p className="hint" role="status">Carregando datas…</p>}
      {!loadingDates && dates.size === 0 && !error && <p className="hint">Sem horários neste mês. Veja o próximo mês.</p>}
      {error && <p className="err" role="alert">{error} <button type="button" className="underline" onClick={loadDates}>Tentar de novo</button></p>}

      {date && (
        <div className="mt-6 fade-in">
          <h4 className="mb-2 font-medium">Horários em {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</h4>
          {timezone && <p className="hint mb-2">Horário local de atendimento ({timezone.replace("_", " ")}).</p>}
          {slots === null && <p className="hint" role="status">Carregando…</p>}
          {slots?.length === 0 && !error && <p className="hint">Nenhum horário livre neste dia.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Horários disponíveis">
            {slots?.map((s) => (
              <button key={s.start} type="button" onClick={() => onChange(s)} aria-pressed={value?.start === s.start}
                className={`min-h-12 rounded-xl border text-base font-medium transition ${value?.start === s.start ? "border-sage-700 bg-sage-700 text-white" : "border-sage-300 bg-white hover:bg-sage-50"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

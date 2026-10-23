import Link from "next/link";
import type { Metadata } from "next";
import { DateTime } from "luxon";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { appointmentsBetween, blocksBetween, dayRange } from "@/lib/admin-data";
import { fmtTime, todayIn } from "@/lib/time";
import { daySlots } from "@/lib/public-schedule";
import { StatusBadge } from "@/components/ui";
import { STATUS_LABEL, fmtPhone } from "@/lib/ui";

export const metadata: Metadata = { title: "Agenda — Painel", robots: { index: false } };

type SP = { view?: string; date?: string; status?: string; modality?: string; serviceId?: string; q?: string; mode?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const { professional: p } = await requireSession();
  const sp = await searchParams;
  const tz = p.timezone;
  const view = ["day", "week", "month"].includes(sp.view ?? "") ? sp.view! : "day";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayIn(tz);
  const d = DateTime.fromISO(date, { zone: tz });
  const filters = { status: sp.status, modality: sp.modality, serviceId: sp.serviceId, q: sp.q };
  const services = (await query(`select id, name from services where professional_id=$1 order by name`, [p.id])).rows;

  const unit = view === "day" ? "day" : view === "week" ? "week" : "month";
  const rangeStart = view === "month" ? d.startOf("month") : view === "week" ? d.startOf("week") : d.startOf("day");
  const rangeEnd = rangeStart.plus({ [unit + "s"]: 1 });
  const appts = await appointmentsBetween(p.id, rangeStart.toJSDate(), rangeEnd.toJSDate(), filters);
  const blocks = await blocksBetween(p.id, rangeStart.toJSDate(), rangeEnd.toJSDate());

  const qs = (o: Partial<SP>) => {
    const u = new URLSearchParams();
    const m = { view, date, ...filters, ...o } as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(m)) if (v) u.set(k, v);
    return `/admin/agenda?${u}`;
  };
  const prev = rangeStart.minus({ [unit + "s"]: 1 }).toISODate()!;
  const next = rangeStart.plus({ [unit + "s"]: 1 }).toISODate()!;
  const title = view === "day" ? d.setLocale("pt-BR").toFormat("cccc, dd 'de' LLLL") : view === "week"
    ? `${rangeStart.toFormat("dd/MM")} – ${rangeEnd.minus({ days: 1 }).toFormat("dd/MM")}` : d.setLocale("pt-BR").toFormat("LLLL 'de' yyyy");

  const ApptCard = ({ a, compact = false }: { a: any; compact?: boolean }) => (
    <Link href={`/admin/agendamentos/${a.id}`} className={`block rounded-2xl border border-sage-100 bg-white p-3 transition hover:border-sage-300 ${a.status === "cancelled" ? "opacity-60" : ""}`}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{fmtTime(a.start_at, tz)}–{fmtTime(a.end_at, tz)}</span>
        <StatusBadge status={a.status} rescheduled={a.rescheduled_count} />
      </span>
      <span className="mt-1 block">{a.patient_name}</span>
      <span className="block text-sm text-ink-soft">{a.service_name} · {a.modality === "online" ? "Online" : "Presencial"}{!compact && ` · ${fmtPhone(a.phone)}`}</span>
      {!compact && a.admin_notes && <span className="mt-1 block text-sm">Obs.: {a.admin_notes}</span>}
    </Link>
  );

  let free: { start: string; label: string }[] = [];
  if (view === "day") {
    const svc = (await query(`select duration_minutes from services where professional_id=$1 and status='active' order by duration_minutes limit 1`, [p.id])).rows[0];
    if (svc) free = await daySlots(p, svc.duration_minutes, date);
  }

  return (
    <div>
      <h1 className="text-3xl">Agenda</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Visualização">
          {(["day", "week", "month"] as const).map((v) => (
            <Link key={v} href={qs({ view: v })} role="tab" aria-selected={view === v} className={`btn btn-sm ${view === v ? "bg-sage-700 text-white" : "border border-sage-300 bg-white"}`}>{{ day: "Dia", week: "Semana", month: "Mês" }[v]}</Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-secondary btn-sm" href={qs({ date: prev })} aria-label="Anterior">‹</Link>
          <span className="min-w-40 text-center font-medium capitalize">{title}</span>
          <Link className="btn-secondary btn-sm" href={qs({ date: next })} aria-label="Próximo">›</Link>
          <Link className="btn-secondary btn-sm" href={qs({ date: todayIn(tz) })}>Hoje</Link>
        </div>
      </div>

      <form className="card mt-4 grid grid-cols-2 gap-3 !p-4 md:grid-cols-5" aria-label="Filtros">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={date} />
        <label className="text-sm">Status<select name="status" defaultValue={sp.status ?? ""} className="field !py-2"><option value="">Todos</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-sm">Modalidade<select name="modality" defaultValue={sp.modality ?? ""} className="field !py-2"><option value="">Todas</option><option value="online">Online</option><option value="presencial">Presencial</option></select></label>
        <label className="text-sm">Serviço<select name="serviceId" defaultValue={sp.serviceId ?? ""} className="field !py-2"><option value="">Todos</option>{services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-sm">Paciente<input name="q" defaultValue={sp.q ?? ""} className="field !py-2" placeholder="Nome" /></label>
        <div className="flex items-end gap-2"><button className="btn-primary btn-sm">Filtrar</button><Link className="btn-secondary btn-sm" href={`/admin/agenda?view=${view}&date=${date}`}>Limpar</Link></div>
      </form>

      <div className="mt-6">
        {view === "day" && (
          <div className="space-y-3">
            {blocks.map((b: any) => <p key={b.id} className="rounded-2xl bg-sand-200 p-3 text-sm">🔒 Bloqueado {fmtTime(b.start_at, tz)}–{fmtTime(b.end_at, tz)}{b.reason ? ` · ${b.reason}` : ""}</p>)}
            {appts.map((a) => <ApptCard key={a.id} a={a} />)}
            {appts.length === 0 && <p className="card text-ink-soft">Nenhuma consulta neste dia.</p>}
            {free.length > 0 && <section className="card"><h2 className="text-lg">Horários livres</h2><div className="mt-3 flex flex-wrap gap-2">{free.map((s) => <Link key={s.start} className="btn-secondary btn-sm" href={`/admin/agendamentos/novo?start=${encodeURIComponent(s.start)}`}>{s.label}</Link>)}</div></section>}
          </div>
        )}

        {view === "week" && (
          <div className="grid gap-3 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => rangeStart.plus({ days: i })).map((day) => {
              const { start, end } = dayRange(day.toISODate()!, tz);
              const list = appts.filter((a) => a.start_at >= start && a.start_at < end);
              return (
                <section key={day.toISODate()} className="rounded-2xl bg-white p-2" aria-label={day.setLocale("pt-BR").toFormat("cccc dd/MM")}>
                  <Link href={qs({ view: "day", date: day.toISODate()! })} className="mb-2 block text-center text-sm font-medium capitalize underline">{day.setLocale("pt-BR").toFormat("ccc dd/MM")}</Link>
                  <div className="space-y-2">{list.map((a) => <ApptCard key={a.id} a={a} compact />)}{list.length === 0 && <p className="text-center text-xs text-ink-soft">—</p>}</div>
                </section>
              );
            })}
          </div>
        )}

        {view === "month" && (() => {
          const counts: Record<string, number> = {};
          for (const a of appts) if (a.status !== "cancelled") { const k = DateTime.fromJSDate(a.start_at, { zone: tz }).toISODate()!; counts[k] = (counts[k] ?? 0) + 1; }
          const lead = rangeStart.weekday % 7; // domingo = 0
          return (
            <div className="grid grid-cols-7 gap-1.5 text-center" role="grid" aria-label="Calendário mensal">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((x, i) => <div key={i} className="text-xs text-ink-soft">{x}</div>)}
              {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
              {Array.from({ length: rangeStart.daysInMonth! }, (_, i) => rangeStart.plus({ days: i })).map((day) => {
                const n = counts[day.toISODate()!] ?? 0;
                return (
                  <Link key={day.toISODate()} href={qs({ view: "day", date: day.toISODate()! })} aria-label={`${day.day}: ${n} consulta(s)`}
                    className={`flex aspect-square min-h-12 flex-col items-center justify-center rounded-xl text-sm ${n ? "bg-sage-100 font-semibold text-sage-800" : "bg-white"} ${day.toISODate() === todayIn(tz) ? "ring-2 ring-lav-500" : ""}`}>
                    {day.day}{n > 0 && <span className="mt-0.5 rounded-full bg-sage-700 px-1.5 text-[10px] text-white">{n}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

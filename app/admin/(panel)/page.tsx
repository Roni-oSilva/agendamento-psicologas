import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { appointmentsBetween, dayRange } from "@/lib/admin-data";
import { fmtTime, fmtDateShort, todayIn } from "@/lib/time";
import { daySlots } from "@/lib/public-schedule";
import { whatsappConfigured } from "@/lib/providers/whatsapp";
import { env } from "@/lib/env";
import { StatusBadge } from "@/components/ui";
import { JOB_TYPE_LABEL } from "@/lib/ui";
import { DateTime } from "luxon";

export const metadata: Metadata = { title: "Início — Painel", robots: { index: false } };

export default async function Dashboard() {
  const { professional: p } = await requireSession();
  const tz = p.timezone;
  const today = todayIn(tz);
  const { start: ds, end: de } = dayRange(today, tz);
  const weekStart = DateTime.fromISO(today, { zone: tz }).startOf("week");
  const wk = { start: weekStart.toJSDate(), end: weekStart.plus({ weeks: 1 }).toJSDate() };

  const [todayAppts, upcoming, counts, recentResched, failed, nextJobs, queueState, svc] = await Promise.all([
    appointmentsBetween(p.id, ds, de),
    query(`select a.id, a.start_at, a.status, a.rescheduled_count, pt.name as patient_name, s.name as service_name from appointments a
           join patients pt on pt.id=a.patient_id join services s on s.id=a.service_id
           where a.professional_id=$1 and a.start_at >= now() and a.status in ('pending','confirmed') order by a.start_at limit 6`, [p.id]),
    query(`select status, count(*)::int n from appointments where professional_id=$1 and start_at >= $2 and start_at < $3 group by status`, [p.id, wk.start, wk.end]),
    query(`select h.created_at, h.to_start, a.id, pt.name as patient_name from appointment_history h join appointments a on a.id=h.appointment_id
           join patients pt on pt.id=a.patient_id where a.professional_id=$1 and h.action='rescheduled' order by h.created_at desc limit 5`, [p.id]),
    query(`select count(*)::int n from notification_jobs where professional_id=$1 and status='failed' and updated_at > now() - interval '7 days'`, [p.id]),
    query(`select j.type, j.scheduled_at, j.status from notification_jobs j where j.professional_id=$1 and j.status='pending' and j.type like 'reminder%' order by j.scheduled_at limit 5`, [p.id]),
    query(`select count(*) filter (where status='pending')::int pending from notification_jobs where professional_id=$1`, [p.id]),
    query(`select duration_minutes from services where professional_id=$1 and status='active' order by duration_minutes limit 1`, [p.id]),
  ]);
  const free = svc.rows[0] ? await daySlots(p, svc.rows[0].duration_minutes, today) : [];
  const by = Object.fromEntries(counts.rows.map((r: any) => [r.status, r.n]));
  const configured = whatsappConfigured();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Olá, {p.display_name.split(" ")[0]}</h1>

      {!configured && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm" role="status">
          <strong>Notificações automáticas pendentes de configuração.</strong> Os agendamentos funcionam normalmente; {queueState.rows[0].pending} mensagem(ns) aguardam a ativação do WhatsApp. <Link className="underline" href="/admin/whatsapp">Ver como configurar</Link>
        </div>
      )}
      {env.whatsappMode === "test" && <div className="rounded-2xl border border-lav-200 bg-lav-100 p-4 text-sm"><strong>Modo de teste do WhatsApp:</strong> nenhuma mensagem real é enviada.</div>}
      {failed.rows[0].n > 0 && <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm"><strong>{failed.rows[0].n} notificação(ões) falharam</strong> nos últimos 7 dias. <Link className="underline" href="/admin/notificacoes?status=failed">Revisar</Link></div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo da semana">
        {[["Hoje", todayAppts.filter((a) => a.status !== "cancelled").length], ["Aguardando confirmação", by.pending ?? 0], ["Confirmadas (semana)", by.confirmed ?? 0], ["Canceladas (semana)", by.cancelled ?? 0],
          ["Faltas (semana)", by.no_show ?? 0], ["Concluídas (semana)", by.completed ?? 0], ["Horários livres hoje", free.length], ["Lembretes pendentes", nextJobs.rows.length]].map(([k, v]) => (
          <div key={k as string} className="card !p-4"><p className="text-3xl font-semibold text-sage-700">{v as number}</p><p className="text-sm text-ink-soft">{k}</p></div>
        ))}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card" aria-labelledby="h-hoje">
          <div className="flex items-center justify-between"><h2 id="h-hoje" className="text-xl">Consultas de hoje</h2><Link className="text-sm underline" href={`/admin/agenda?view=day&date=${today}`}>Agenda do dia</Link></div>
          <ul className="mt-3 divide-y divide-sage-100">
            {todayAppts.map((a) => (
              <li key={a.id} className="py-3"><Link href={`/admin/agendamentos/${a.id}`} className="flex items-start justify-between gap-3">
                <span><span className="font-semibold">{fmtTime(a.start_at, tz)}–{fmtTime(a.end_at, tz)}</span> · {a.patient_name}<span className="block text-sm text-ink-soft">{a.service_name}</span></span>
                <StatusBadge status={a.status} rescheduled={a.rescheduled_count} />
              </Link></li>
            ))}
            {todayAppts.length === 0 && <li className="py-3 text-ink-soft">Nenhuma consulta hoje.</li>}
          </ul>
        </section>

        <section className="card" aria-labelledby="h-prox">
          <h2 id="h-prox" className="text-xl">Próximas consultas</h2>
          <ul className="mt-3 divide-y divide-sage-100">
            {upcoming.rows.map((a: any) => (
              <li key={a.id} className="py-3"><Link href={`/admin/agendamentos/${a.id}`} className="flex items-start justify-between gap-3">
                <span><span className="font-semibold">{fmtDateShort(a.start_at, tz)} {fmtTime(a.start_at, tz)}</span> · {a.patient_name}<span className="block text-sm text-ink-soft">{a.service_name}</span></span>
                <StatusBadge status={a.status} rescheduled={a.rescheduled_count} />
              </Link></li>
            ))}
            {upcoming.rows.length === 0 && <li className="py-3 text-ink-soft">Nenhuma consulta futura.</li>}
          </ul>
        </section>

        <section className="card" aria-labelledby="h-livres">
          <h2 id="h-livres" className="text-xl">Horários livres hoje</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {free.map((s) => <Link key={s.start} href={`/admin/agendamentos/novo?start=${encodeURIComponent(s.start)}`} className="btn-secondary btn-sm">{s.label}</Link>)}
            {free.length === 0 && <p className="text-ink-soft">Sem horários livres hoje.</p>}
          </div>
        </section>

        <section className="card" aria-labelledby="h-rem">
          <h2 id="h-rem" className="text-xl">Remarcações recentes</h2>
          <ul className="mt-3 divide-y divide-sage-100 text-sm">
            {recentResched.rows.map((h: any, i: number) => (
              <li key={i} className="py-2"><Link href={`/admin/agendamentos/${h.id}`}>{h.patient_name} → {fmtDateShort(h.to_start, tz)} {fmtTime(h.to_start, tz)}</Link></li>
            ))}
            {recentResched.rows.length === 0 && <li className="py-2 text-ink-soft">Nenhuma.</li>}
          </ul>
          <h3 className="mt-5 text-lg">Próximos lembretes</h3>
          <ul className="mt-2 text-sm">
            {nextJobs.rows.map((j: any, i: number) => <li key={i}>{JOB_TYPE_LABEL[j.type]} · {fmtDateShort(j.scheduled_at, tz)} {fmtTime(j.scheduled_at, tz)}</li>)}
            {nextJobs.rows.length === 0 && <li className="text-ink-soft">Nenhum pendente.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

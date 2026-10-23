import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query, one } from "@/lib/db";
import { cancelAppointment, rescheduleAppointment, setAppointmentStatus, BookingError } from "@/lib/booking";
import { fmtDate, fmtTime, fmtDateShort } from "@/lib/time";
import { StatusBadge, Flash } from "@/components/ui";
import { JOB_LABEL, JOB_TYPE_LABEL, fmtPhone } from "@/lib/ui";
import { audit } from "@/lib/audit";
import { RescheduleBox } from "./RescheduleBox";

export const metadata: Metadata = { title: "Agendamento — Painel", robots: { index: false } };

const backTo = (id: string, k: "ok" | "err", m: string): never => redirect(`/admin/agendamentos/${id}?${k}=${encodeURIComponent(m)}`);

const ACTION_LABEL: Record<string, string> = { created: "Criado", rescheduled: "Remarcado", cancelled: "Cancelado", status_changed: "Status alterado" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  // sempre escopado ao profissional da sessão
  const a = await one(
    `select a.*, p.name as patient_name, p.phone, p.email, p.contact_preference, sv.name as service_name, sv.id as service_id2
     from appointments a join patients p on p.id=a.patient_id join services sv on sv.id=a.service_id
     where a.id=$1 and a.professional_id=$2`, [id, s.professional.id]);
  if (!a) notFound();
  const tz = s.professional.timezone;
  const history = (await query(`select h.*, u.name as actor_name from appointment_history h left join users u on u.id=h.actor_user_id where appointment_id=$1 order by h.created_at, h.id`, [id])).rows;
  const jobs = (await query(`select type, channel, status, scheduled_at, last_error, attempts from notification_jobs where appointment_id=$1 order by scheduled_at`, [id])).rows;
  const open = ["pending", "confirmed"].includes(a.status);

  async function setStatus(fd: FormData) {
    "use server";
    const s2 = await requireSession();
    const st = String(fd.get("status"));
    if (!["confirmed", "completed", "no_show"].includes(st)) return;
    try { await setAppointmentStatus({ appointmentId: id, professionalId: s2.professional.id, userId: s2.userId, status: st as any }); }
    catch (e) { if (e instanceof BookingError) backTo(id, "err", e.message); throw e; }
    backTo(id, "ok", "Status atualizado.");
  }
  async function cancel(fd: FormData) {
    "use server";
    const s2 = await requireSession();
    if (fd.get("confirm") !== "on") backTo(id, "err", "Marque a confirmação para cancelar.");
    try { await cancelAppointment({ appointmentId: id, professionalId: s2.professional.id, actor: { type: "professional", userId: s2.userId }, reason: String(fd.get("reason") ?? "").slice(0, 200) || null }); }
    catch (e) { if (e instanceof BookingError) backTo(id, "err", e.message); throw e; }
    backTo(id, "ok", "Consulta cancelada e horário liberado.");
  }
  async function reschedule(start: string): Promise<{ ok: boolean; message?: string }> {
    "use server";
    const s2 = await requireSession();
    try {
      await rescheduleAppointment({ appointmentId: id, professionalId: s2.professional.id, newStart: new Date(start), actor: { type: "professional", userId: s2.userId } });
      return { ok: true };
    } catch (e) { if (e instanceof BookingError) return { ok: false, message: e.message }; throw e; }
  }
  async function saveNotes(fd: FormData) {
    "use server";
    const s2 = await requireSession();
    await query(`update appointments set admin_notes=$3, updated_at=now() where id=$1 and professional_id=$2`, [id, s2.professional.id, String(fd.get("notes") ?? "").slice(0, 500) || null]);
    await audit(null, { userId: s2.userId, professionalId: s2.professional.id, action: "appointment.notes", resourceType: "appointment", resourceId: id });
    backTo(id, "ok", "Observação salva.");
  }

  return (
    <div className="space-y-6">
      <Link href={`/admin/agenda?view=day&date=${new Date(a.start_at).toISOString().slice(0, 10)}`} className="text-sm underline">← Agenda</Link>
      {sp.ok && <Flash>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      <section className="card">
        <p className="text-sm text-ink-soft">Código {a.code} · origem: {a.source === "manual" ? "manual" : "online"}</p>
        <h1 className="mt-1 text-3xl">{a.patient_name}</h1>
        <div className="mt-2"><StatusBadge status={a.status} rescheduled={a.rescheduled_count} /></div>
        <p className="mt-4 text-lg capitalize">{fmtDate(a.start_at, tz)}</p>
        <p className="text-3xl font-semibold text-sage-700">{fmtTime(a.start_at, tz)} – {fmtTime(a.end_at, tz)}</p>
        <p className="mt-2 text-ink-soft">{a.service_name} · {a.modality === "online" ? "Online" : "Presencial"}</p>
        <p className="mt-3 text-sm">Telefone: <a className="underline" href={`tel:+${a.phone}`}>{fmtPhone(a.phone)}</a>{a.email && <> · {a.email}</>}</p>
        {a.patient_note && <p className="mt-2 rounded-xl bg-sand-100 p-3 text-sm">Observação do paciente: {a.patient_note}</p>}
        {a.cancel_reason && <p className="mt-2 text-sm">Motivo do cancelamento: {a.cancel_reason}</p>}
      </section>

      {open && (
        <section className="card space-y-4" aria-label="Ações">
          <div className="flex flex-wrap gap-2">
            {a.status === "pending" && <form action={setStatus}><input type="hidden" name="status" value="confirmed" /><button className="btn-primary btn-sm">Confirmar</button></form>}
            <form action={setStatus}><input type="hidden" name="status" value="completed" /><button className="btn-secondary btn-sm">Marcar como concluída</button></form>
            <form action={setStatus}><input type="hidden" name="status" value="no_show" /><button className="btn-secondary btn-sm">Registrar falta</button></form>
          </div>
          <RescheduleBox serviceId={a.service_id} appointmentId={a.id} timezone={tz} action={reschedule} />
          <details>
            <summary className="btn-danger btn-sm inline-flex cursor-pointer">Cancelar consulta</summary>
            <form action={cancel} className="mt-3 space-y-3">
              <label className="label" htmlFor="reason">Motivo administrativo (opcional)</label>
              <input id="reason" name="reason" className="field" maxLength={200} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" className="h-5 w-5" /> Confirmo o cancelamento. O paciente será notificado.</label>
              <button className="btn-danger btn-sm">Cancelar definitivamente</button>
            </form>
          </details>
        </section>
      )}

      <section className="card">
        <h2 className="text-xl">Observação administrativa</h2>
        <form action={saveNotes} className="mt-3 space-y-2">
          <textarea name="notes" defaultValue={a.admin_notes ?? ""} rows={2} maxLength={500} className="field" aria-label="Observação administrativa" />
          <p className="hint">Apenas informações administrativas. Não registre conteúdo clínico aqui.</p>
          <button className="btn-secondary btn-sm">Salvar</button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-xl">Histórico de alterações</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {history.map((h: any) => (
            <li key={h.id} className="border-l-2 border-sage-200 pl-3">
              <strong>{ACTION_LABEL[h.action] ?? h.action}</strong> · {fmtDateShort(h.created_at, tz)} {fmtTime(h.created_at, tz)} · {h.actor_type === "patient" ? "paciente" : h.actor_type === "system" ? "sistema" : h.actor_name ?? "profissional"}
              {h.from_start && h.to_start && <span className="block text-ink-soft">{fmtDateShort(h.from_start, tz)} {fmtTime(h.from_start, tz)} → {fmtDateShort(h.to_start, tz)} {fmtTime(h.to_start, tz)}</span>}
              {h.from_status && h.to_status && h.from_status !== h.to_status && <span className="block text-ink-soft">{h.from_status} → {h.to_status}</span>}
              {h.note && <span className="block text-ink-soft">Motivo: {h.note}</span>}
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2 className="text-xl">Notificações</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {jobs.map((j: any, i: number) => (
            <li key={i}>{JOB_TYPE_LABEL[j.type]} ({j.channel}) · {fmtDateShort(j.scheduled_at, tz)} {fmtTime(j.scheduled_at, tz)} · <strong>{JOB_LABEL[j.status]}</strong>{j.last_error && <span className="text-red-800"> — {j.last_error}</span>}</li>
          ))}
          {jobs.length === 0 && <li className="text-ink-soft">Nenhuma notificação programada.</li>}
        </ul>
      </section>
    </div>
  );
}

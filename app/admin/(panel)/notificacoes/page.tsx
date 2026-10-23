import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/ui";
import { fmtDateShort, fmtTime } from "@/lib/time";
import { JOB_LABEL, JOB_TYPE_LABEL } from "@/lib/ui";

export const metadata: Metadata = { title: "Central de notificações — Painel", robots: { index: false } };

async function retry(fd: FormData) {
  "use server";
  const s = await requireSession();
  await query(`update notification_jobs set status='pending', attempts=0, last_error=null, scheduled_at=now(), updated_at=now()
               where id=$1 and professional_id=$2 and status='failed'`, [String(fd.get("id")), s.professional.id]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "notification.retry", resourceId: String(fd.get("id")) });
  redirect("/admin/notificacoes?ok=" + encodeURIComponent("Reenvio programado."));
}
async function cancel(fd: FormData) {
  "use server";
  const s = await requireSession();
  await query(`update notification_jobs set status='cancelled', updated_at=now() where id=$1 and professional_id=$2 and status='pending'`, [String(fd.get("id")), s.professional.id]);
  redirect("/admin/notificacoes?ok=" + encodeURIComponent("Notificação cancelada."));
}

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string }> }) {
  const { professional: p } = await requireSession();
  const sp = await searchParams;
  const rows = (await query(
    `select j.id, j.type, j.channel, j.status, j.scheduled_at, j.attempts, j.last_error, a.id as appt_id, pt.name
     from notification_jobs j join appointments a on a.id=j.appointment_id join patients pt on pt.id=a.patient_id
     where j.professional_id=$1 and ($2::text is null or j.status=$2) order by j.scheduled_at desc limit 150`, [p.id, sp.status || null])).rows;
  return (
    <div>
      <h1 className="text-3xl">Central de notificações</h1>
      {sp.ok && <Flash>{sp.ok}</Flash>}
      <nav className="my-4 flex flex-wrap gap-2" aria-label="Filtro">
        {[["", "Todas"], ["pending", "Pendentes"], ["failed", "Com falha"], ["sent", "Enviadas"], ["delivered", "Entregues"], ["test_sent", "Modo teste"]].map(([k, v]) => (
          <Link key={k} className={`btn-sm btn ${((sp.status ?? "") === k) ? "bg-sage-700 text-white" : "border border-sage-300 bg-white"}`} href={`/admin/notificacoes${k ? `?status=${k}` : ""}`}>{v}</Link>))}
      </nav>
      <ul className="space-y-2">
        {rows.map((j: any) => (
          <li key={j.id} className="card !p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>{JOB_TYPE_LABEL[j.type]}</strong> ({j.channel}) · <Link className="underline" href={`/admin/agendamentos/${j.appt_id}`}>{j.name}</Link></span>
            <span className={`badge ${j.status === "failed" ? "bg-red-100 text-red-900" : j.status === "pending" ? "bg-amber-100 text-amber-900" : "bg-sage-100 text-sage-800"}`}>{JOB_LABEL[j.status]}</span></div>
            <p className="text-ink-soft">Programada: {fmtDateShort(j.scheduled_at, p.timezone)} {fmtTime(j.scheduled_at, p.timezone)} · tentativas: {j.attempts}</p>
            {j.last_error && <p className="text-red-800">Erro: {j.last_error}</p>}
            <div className="mt-2 flex gap-2">{j.status === "failed" && <form action={retry}><input type="hidden" name="id" value={j.id} /><button className="btn-secondary btn-sm">Tentar novamente</button></form>}
              {j.status === "pending" && <form action={cancel}><input type="hidden" name="id" value={j.id} /><button className="btn-secondary btn-sm">Cancelar envio</button></form>}</div></li>
        ))}
        {rows.length === 0 && <li className="card text-ink-soft">Nada por aqui.</li>}
      </ul>
    </div>
  );
}

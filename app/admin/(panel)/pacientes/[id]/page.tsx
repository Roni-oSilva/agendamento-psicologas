import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query, one } from "@/lib/db";
import { audit } from "@/lib/audit";
import { StatusBadge, Flash } from "@/components/ui";
import { fmtDateShort, fmtTime, normalizePhone, validPhone } from "@/lib/time";
import { fmtPhone } from "@/lib/ui";

export const metadata: Metadata = { title: "Paciente — Painel", robots: { index: false } };

const backTo = (id: string, k: string, m: string): never => redirect(`/admin/pacientes/${id}?${k}=${encodeURIComponent(m)}`);

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const pt = await one(`select * from patients where id=$1 and professional_id=$2`, [id, s.professional.id]);
  if (!pt) notFound();
  const tz = s.professional.timezone;
  const appts = (await query(
    `select a.id, a.start_at, a.status, a.rescheduled_count, sv.name as service_name from appointments a join services sv on sv.id=a.service_id where a.patient_id=$1 order by a.start_at desc`, [id])).rows;
  const consents = (await query(`select consent_type, text_version, source, created_at from consent_records where patient_id=$1 order by created_at desc`, [id])).rows;

  async function save(fd: FormData) {
    "use server";
    const s2 = await requireSession();
    const phone = normalizePhone(String(fd.get("phone") ?? ""));
    if (!validPhone(phone)) backTo(id, "err", "Telefone inválido.");
    try {
      await query(`update patients set name=$3, phone=$4, email=$5, contact_preference=$6, reminders_opt_in=$7, admin_notes=$8, updated_at=now() where id=$1 and professional_id=$2`,
        [id, s2.professional.id, String(fd.get("name")).trim().slice(0, 120), phone, String(fd.get("email") ?? "").trim() || null,
         String(fd.get("pref")), fd.get("reminders") === "on", String(fd.get("notes") ?? "").slice(0, 500) || null]);
    } catch (e: any) { if (e.code === "23505") backTo(id, "err", "Já existe paciente com este telefone."); throw e; }
    await audit(null, { userId: s2.userId, professionalId: s2.professional.id, action: "patient.update", resourceType: "patient", resourceId: id });
    backTo(id, "ok", "Dados salvos.");
  }
  async function anonymize(fd: FormData) {
    "use server";
    const s2 = await requireSession();
    if (fd.get("confirm") !== "on") backTo(id, "err", "Confirme a exclusão.");
    const open = await one(`select 1 from appointments where patient_id=$1 and status in ('pending','confirmed') and start_at > now()`, [id]);
    if (open) backTo(id, "err", "Há consultas futuras. Cancele-as antes de anonimizar.");
    await query(
      `update patients set name='Paciente anonimizado', phone='anon-'||substr(id::text,1,8), email=null, admin_notes=null, reminders_opt_in=false, contact_preference='none', anonymized_at=now(), updated_at=now()
       where id=$1 and professional_id=$2`, [id, s2.professional.id]);
    await query(`update appointments set patient_note=null, admin_notes=null where patient_id=$1`, [id]);
    await query(`update notification_jobs set status='cancelled' where status in ('pending','processing') and appointment_id in (select id from appointments where patient_id=$1)`, [id]);
    await audit(null, { userId: s2.userId, professionalId: s2.professional.id, action: "patient.anonymize", resourceType: "patient", resourceId: id });
    redirect("/admin/pacientes");
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/pacientes" className="text-sm underline">← Pacientes</Link>
      {sp.ok && <Flash>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      <h1 className="text-3xl">{pt.name}</h1>
      <form action={save} className="card grid gap-4 md:grid-cols-2">
        <div><label className="label" htmlFor="name">Nome</label><input id="name" name="name" defaultValue={pt.name} required className="field" /></div>
        <div><label className="label" htmlFor="phone">Telefone</label><input id="phone" name="phone" defaultValue={fmtPhone(pt.phone)} required className="field" /></div>
        <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" defaultValue={pt.email ?? ""} className="field" /></div>
        <div><label className="label" htmlFor="pref">Preferência de contato</label>
          <select id="pref" name="pref" defaultValue={pt.contact_preference} className="field"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="none">Não contatar</option></select></div>
        <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="reminders" defaultChecked={pt.reminders_opt_in} className="h-5 w-5" /> Receber lembretes automáticos</label>
        <div className="md:col-span-2"><label className="label" htmlFor="notes">Observações administrativas</label><textarea id="notes" name="notes" defaultValue={pt.admin_notes ?? ""} rows={2} maxLength={500} className="field" /><p className="hint">Somente o estritamente necessário. Este sistema não é prontuário.</p></div>
        <div className="md:col-span-2 flex gap-2"><button className="btn-primary btn-sm">Salvar</button><Link className="btn-secondary btn-sm" href={`/admin/agendamentos/novo?patient=${id}`}>Novo agendamento</Link></div>
      </form>
      <section className="card"><h2 className="text-xl">Histórico administrativo</h2>
        <ul className="mt-3 divide-y divide-sage-100">
          {appts.map((a: any) => <li key={a.id} className="flex items-center justify-between gap-3 py-2"><Link href={`/admin/agendamentos/${a.id}`} className="underline">{fmtDateShort(a.start_at, tz)} {fmtTime(a.start_at, tz)} · {a.service_name}</Link><StatusBadge status={a.status} rescheduled={a.rescheduled_count} /></li>)}
          {appts.length === 0 && <li className="py-2 text-ink-soft">Sem agendamentos.</li>}
        </ul></section>
      <section className="card"><h2 className="text-xl">Consentimentos registrados</h2>
        <ul className="mt-3 text-sm">{consents.map((c: any, i: number) => <li key={i}>{c.consent_type === "data_processing" ? "Tratamento de dados" : c.consent_type === "whatsapp_contact" ? "Contato por WhatsApp" : "Contato por e-mail"} · texto v{c.text_version} · origem {c.source} · {fmtDateShort(c.created_at, tz)}</li>)}
          {consents.length === 0 && <li className="text-ink-soft">Nenhum registro.</li>}</ul></section>
      <details className="card"><summary className="cursor-pointer text-lg font-medium text-red-900">Excluir dados pessoais (anonimizar)</summary>
        <form action={anonymize} className="mt-3 space-y-3"><p className="text-sm">Remove nome, telefone, e-mail e observações; o histórico de datas é mantido sem identificação. Não pode ser desfeito.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" className="h-5 w-5" /> Confirmo a anonimização.</label><button className="btn-danger btn-sm">Anonimizar paciente</button></form></details>
    </div>
  );
}

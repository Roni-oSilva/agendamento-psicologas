import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { DateTime } from "luxon";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { createBlock } from "@/lib/booking";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/ui";
import { fmtDateShort, fmtTime } from "@/lib/time";

export const metadata: Metadata = { title: "Bloqueios e férias — Painel", robots: { index: false } };
const KIND: Record<string, string> = { block: "Bloqueio", vacation: "Férias", holiday: "Feriado", dayoff: "Folga" };

async function add(fd: FormData) {
  "use server";
  const s = await requireSession();
  const tz = s.professional.timezone;
  const from = String(fd.get("from")), to = String(fd.get("to") || fd.get("from"));
  const tf = String(fd.get("tfrom") ?? ""), tt = String(fd.get("tto") ?? "");
  const kind = String(fd.get("kind"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from || !KIND[kind]) redirect("/admin/bloqueios?err=" + encodeURIComponent("Datas inválidas."));
  let start: DateTime, end: DateTime;
  if (tf && tt) { start = DateTime.fromISO(`${from}T${tf}`, { zone: tz }); end = DateTime.fromISO(`${to}T${tt}`, { zone: tz }); }
  else { start = DateTime.fromISO(from, { zone: tz }).startOf("day"); end = DateTime.fromISO(to, { zone: tz }).plus({ days: 1 }).startOf("day"); }
  if (!(end > start)) redirect("/admin/bloqueios?err=" + encodeURIComponent("O fim deve ser depois do início."));
  const r = await createBlock({ professionalId: s.professional.id, userId: s.userId, start: start.toJSDate(), end: end.toJSDate(), kind, reason: String(fd.get("reason") ?? "").slice(0, 200) || null });
  const warn = r.conflictingAppointments ? ` Atenção: ${r.conflictingAppointments} consulta(s) já marcada(s) neste período foram preservadas — remarque ou cancele-as.` : "";
  redirect(`/admin/bloqueios?ok=${encodeURIComponent("Período bloqueado." + warn)}`);
}
async function del(fd: FormData) {
  "use server";
  const s = await requireSession();
  await query(`delete from blocked_periods where id=$1 and professional_id=$2`, [String(fd.get("id")), s.professional.id]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "block.delete" });
  redirect("/admin/bloqueios?ok=" + encodeURIComponent("Bloqueio removido; horários liberados."));
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { professional: p } = await requireSession();
  const sp = await searchParams;
  const rows = (await query(`select * from blocked_periods where professional_id=$1 and end_at > now() order by start_at`, [p.id])).rows;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Bloqueios, férias e feriados</h1>
      {sp.ok && <Flash kind={sp.ok.includes("Atenção") ? "warn" : "ok"}>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      <form action={add} className="card grid gap-4 md:grid-cols-2">
        <div><label className="label" htmlFor="kind">Tipo</label><select id="kind" name="kind" className="field">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="reason">Motivo (administrativo)</label><input id="reason" name="reason" maxLength={200} className="field" /></div>
        <div><label className="label" htmlFor="from">De</label><input id="from" name="from" type="date" required className="field" /></div>
        <div><label className="label" htmlFor="to">Até (inclusive)</label><input id="to" name="to" type="date" className="field" /></div>
        <div><label className="label" htmlFor="tf">Hora inicial (opcional)</label><input id="tf" name="tfrom" type="time" className="field" /></div>
        <div><label className="label" htmlFor="tt">Hora final (opcional)</label><input id="tt" name="tto" type="time" className="field" /></div>
        <p className="hint md:col-span-2">Sem horas = dia(s) inteiro(s). Consultas já marcadas no período são preservadas e você é avisada.</p>
        <div className="md:col-span-2"><button className="btn-primary btn-sm">Bloquear período</button></div>
      </form>
      <ul className="space-y-2">
        {rows.map((b: any) => (
          <li key={b.id} className="card flex items-center justify-between gap-3 !p-4"><span><strong>{KIND[b.kind]}</strong> · {fmtDateShort(b.start_at, p.timezone)} {fmtTime(b.start_at, p.timezone)} → {fmtDateShort(b.end_at, p.timezone)} {fmtTime(b.end_at, p.timezone)}{b.reason && <span className="block text-sm text-ink-soft">{b.reason}</span>}</span>
            <form action={del}><input type="hidden" name="id" value={b.id} /><button className="btn-secondary btn-sm">Desbloquear</button></form></li>
        ))}
        {rows.length === 0 && <li className="text-ink-soft">Nenhum bloqueio futuro.</li>}
      </ul>
    </div>
  );
}

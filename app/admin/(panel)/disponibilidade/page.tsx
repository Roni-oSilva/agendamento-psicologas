import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/ui";
import { WEEKDAYS } from "@/lib/ui";
import { fmtDateShort, fmtTime } from "@/lib/time";
import { DateTime } from "luxon";
import { z } from "zod";

export const metadata: Metadata = { title: "Disponibilidade — Painel", robots: { index: false } };

const go = (k: string, m: string) => redirect(`/admin/disponibilidade?${k}=${encodeURIComponent(m)}`);

async function addRule(fd: FormData) {
  "use server";
  const s = await requireSession();
  const days = fd.getAll("weekday").map(Number).filter((n) => n >= 1 && n <= 7);
  const start = String(fd.get("start")), end = String(fd.get("end"));
  if (!days.length || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) go("err", "Selecione os dias e um horário válido (fim depois do início).");
  for (const d of days) {
    const overlap = await query(`select 1 from availability_rules where professional_id=$1 and weekday=$2 and active and start_time < $4::time and end_time > $3::time`, [s.professional.id, d, start, end]);
    if (overlap.rowCount) go("err", `${WEEKDAYS[d]}: já existe uma janela que se sobrepõe a este horário.`);
  }
  for (const d of days) await query(`insert into availability_rules(professional_id, weekday, start_time, end_time) values($1,$2,$3,$4)`, [s.professional.id, d, start, end]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "availability.add" });
  go("ok", "Janela adicionada.");
}
async function delRule(fd: FormData) {
  "use server";
  const s = await requireSession();
  await query(`delete from availability_rules where id=$1 and professional_id=$2`, [String(fd.get("id")), s.professional.id]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "availability.remove" });
  go("ok", "Janela removida. Consultas já agendadas foram preservadas.");
}

const Settings = z.object({
  timezone: z.string().refine((z) => DateTime.local().setZone(z).isValid), slot_step: z.coerce.number().int().min(5).max(240),
  buffer: z.coerce.number().int().min(0).max(120), min_notice: z.coerce.number().int().min(0).max(720), max_advance: z.coerce.number().int().min(1).max(365),
  cancel_deadline: z.coerce.number().int().min(0).max(720), max_per_day: z.string().optional(),
});
async function saveSettings(fd: FormData) {
  "use server";
  const s = await requireSession();
  const r = Settings.safeParse(Object.fromEntries(fd));
  if (!r.success) go("err", "Verifique os valores informados (fuso horário inválido ou números fora do intervalo).");
  const d = r.data!;
  const mpd = d.max_per_day?.trim() ? Math.max(1, Number(d.max_per_day)) : null;
  await query(`update professionals set timezone=$2, slot_step_minutes=$3, buffer_minutes=$4, min_notice_hours=$5, max_advance_days=$6, cancel_deadline_hours=$7, max_per_day=$8, require_email=$9, updated_at=now() where id=$1`,
    [s.professional.id, d.timezone, d.slot_step, d.buffer, d.min_notice, d.max_advance, d.cancel_deadline, mpd, fd.get("require_email") === "on"]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "availability.settings" });
  go("ok", "Configurações salvas. Consultas já confirmadas foram preservadas.");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { professional: p } = await requireSession();
  const sp = await searchParams;
  const rules = (await query(`select id, weekday, to_char(start_time,'HH24:MI') s, to_char(end_time,'HH24:MI') e from availability_rules where professional_id=$1 and active order by weekday, start_time`, [p.id])).rows;
  const incompat = (await query(
    `select a.id, a.start_at, pt.name from appointments a join patients pt on pt.id=a.patient_id
     where a.professional_id=$1 and a.status in ('pending','confirmed') and a.start_at > now()
       and not exists (select 1 from availability_rules r where r.professional_id=a.professional_id and r.active
         and r.weekday = extract(isodow from (a.start_at at time zone a.timezone))
         and (a.start_at at time zone a.timezone)::time >= r.start_time and (a.end_at at time zone a.timezone)::time <= r.end_time)
     order by a.start_at limit 20`, [p.id])).rows;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Disponibilidade</h1>
      {sp.ok && <Flash>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      {incompat.length > 0 && <Flash kind="warn"><strong>{incompat.length} consulta(s) futura(s) ficam fora da jornada atual</strong> (foram preservadas): {incompat.map((a: any) => `${a.name} ${fmtDateShort(a.start_at, p.timezone)} ${fmtTime(a.start_at, p.timezone)}`).join("; ")}.</Flash>}

      <section className="card"><h2 className="text-xl">Jornada semanal</h2>
        <p className="hint">Cada janela é um período de atendimento. O almoço/descanso é o intervalo entre duas janelas do mesmo dia.</p>
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div key={d} className="flex flex-wrap items-center gap-2 border-b border-sage-100 pb-2"><strong className="w-24">{WEEKDAYS[d]}</strong>
              {rules.filter((r: any) => r.weekday === d).map((r: any) => (
                <form key={r.id} action={delRule} className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-3 py-1 text-sm">{r.s}–{r.e}<input type="hidden" name="id" value={r.id} /><button className="ml-1 text-red-800" aria-label={`Remover ${WEEKDAYS[d]} ${r.s} às ${r.e}`}>✕</button></form>
              ))}
              {!rules.some((r: any) => r.weekday === d) && <span className="text-sm text-ink-soft">Sem atendimento</span>}
            </div>
          ))}
        </div>
        <form action={addRule} className="mt-5 space-y-3">
          <fieldset><legend className="label">Adicionar janela nos dias</legend>
            <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 7].map((d) => <label key={d} className="flex items-center gap-1 rounded-xl border border-sage-200 px-3 py-2 text-sm"><input type="checkbox" name="weekday" value={d} className="h-4 w-4" />{WEEKDAYS[d].slice(0, 3)}</label>)}</div></fieldset>
          <div className="flex flex-wrap items-end gap-3"><div><label className="label" htmlFor="st">Início</label><input id="st" name="start" type="time" required defaultValue="09:00" className="field" /></div>
            <div><label className="label" htmlFor="en">Fim</label><input id="en" name="end" type="time" required defaultValue="12:00" className="field" /></div><button className="btn-primary btn-sm">Adicionar</button></div>
        </form>
      </section>

      <section className="card"><h2 className="text-xl">Regras de agendamento</h2>
        <form action={saveSettings} className="mt-4 grid gap-4 md:grid-cols-2">
          <div><label className="label" htmlFor="tz">Fuso horário</label><input id="tz" name="timezone" defaultValue={p.timezone} className="field" list="tzs" /><datalist id="tzs">{["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Cuiaba", "America/Rio_Branco", "Europe/Lisbon", "America/New_York"].map((z) => <option key={z} value={z} />)}</datalist></div>
          <div><label className="label" htmlFor="ss">Intervalo entre horários oferecidos (min)</label><input id="ss" name="slot_step" type="number" defaultValue={p.slot_step_minutes} className="field" /></div>
          <div><label className="label" htmlFor="bf">Preparação entre sessões (min)</label><input id="bf" name="buffer" type="number" defaultValue={p.buffer_minutes} className="field" /></div>
          <div><label className="label" htmlFor="mn">Antecedência mínima (horas)</label><input id="mn" name="min_notice" type="number" defaultValue={p.min_notice_hours} className="field" /></div>
          <div><label className="label" htmlFor="ma">Agendamento futuro máximo (dias)</label><input id="ma" name="max_advance" type="number" defaultValue={p.max_advance_days} className="field" /></div>
          <div><label className="label" htmlFor="cd">Prazo para cancelar/remarcar (horas antes)</label><input id="cd" name="cancel_deadline" type="number" defaultValue={p.cancel_deadline_hours} className="field" /></div>
          <div><label className="label" htmlFor="mp">Limite de consultas por dia</label><input id="mp" name="max_per_day" type="number" min={1} defaultValue={p.max_per_day ?? ""} placeholder="sem limite" className="field" /></div>
          <label className="flex items-center gap-2 self-end"><input type="checkbox" name="require_email" defaultChecked={p.require_email} className="h-5 w-5" /> Exigir e-mail no agendamento</label>
          <div className="md:col-span-2"><button className="btn-primary btn-sm">Salvar regras</button></div>
        </form>
        <p className="hint mt-3">A duração de cada sessão é definida em <a className="underline" href="/admin/servicos">Serviços</a>. Feriados, férias e folgas ficam em <a className="underline" href="/admin/bloqueios">Bloqueios</a>.</p>
      </section>
    </div>
  );
}

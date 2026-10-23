import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/ui";
import { z } from "zod";

export const metadata: Metadata = { title: "Serviços — Painel", robots: { index: false } };

const Schema = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional(), instructions: z.string().trim().max(600).optional(),
  duration: z.coerce.number().int().min(10).max(480), price: z.string().optional(), modality: z.enum(["online", "presencial"]),
});
const toCents = (v?: string) => { if (!v?.trim()) return null; const n = Number(v.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };

async function upsert(fd: FormData) {
  "use server";
  const s = await requireSession();
  const parsed = Schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) redirect("/admin/servicos?err=" + encodeURIComponent("Verifique os campos (nome e duração entre 10 e 480 min)."));
  const d = parsed.data;
  const id = String(fd.get("id") ?? "");
  const active = fd.get("active") === "on" ? "active" : "inactive";
  if (id) {
    await query(`update services set name=$3, description=$4, instructions=$5, duration_minutes=$6, price_cents=$7, modality=$8, status=$9, updated_at=now() where id=$1 and professional_id=$2`,
      [id, s.professional.id, d.name, d.description || null, d.instructions || null, d.duration, toCents(d.price), d.modality, active]);
  } else {
    await query(`insert into services(professional_id,name,description,instructions,duration_minutes,price_cents,modality,status,position)
      values($1,$2,$3,$4,$5,$6,$7,'active',(select coalesce(max(position),0)+1 from services where professional_id=$1))`,
      [s.professional.id, d.name, d.description || null, d.instructions || null, d.duration, toCents(d.price), d.modality]);
  }
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: id ? "service.update" : "service.create", resourceType: "service", resourceId: id || undefined });
  redirect("/admin/servicos?ok=" + encodeURIComponent("Serviço salvo. Consultas já agendadas não são alteradas."));
}

function Form({ s }: { s?: any }) {
  return (
    <form action={upsert} className="grid gap-3 md:grid-cols-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div><label className="label">Nome</label><input name="name" defaultValue={s?.name} required className="field" /></div>
      <div><label className="label">Modalidade</label><select name="modality" defaultValue={s?.modality ?? "online"} className="field"><option value="online">Online</option><option value="presencial">Presencial</option></select></div>
      <div><label className="label">Duração (min)</label><input name="duration" type="number" min={10} max={480} step={5} defaultValue={s?.duration_minutes ?? 50} required className="field" /></div>
      <div><label className="label">Preço (opcional, R$)</label><input name="price" inputMode="decimal" defaultValue={s?.price_cents != null ? (s.price_cents / 100).toFixed(2).replace(".", ",") : ""} className="field" /></div>
      <div className="md:col-span-2"><label className="label">Descrição</label><textarea name="description" rows={2} defaultValue={s?.description ?? ""} className="field" /></div>
      <div className="md:col-span-2"><label className="label">Orientações ao paciente</label><textarea name="instructions" rows={2} defaultValue={s?.instructions ?? ""} className="field" /></div>
      {s && <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={s.status === "active"} className="h-5 w-5" /> Disponível para agendamento</label>}
      <div className="md:col-span-2"><button className="btn-primary btn-sm">{s ? "Salvar" : "Adicionar serviço"}</button></div>
    </form>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { professional: p } = await requireSession();
  const sp = await searchParams;
  const rows = (await query(`select * from services where professional_id=$1 order by position, name`, [p.id])).rows;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Serviços</h1>
      {sp.ok && <Flash>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      {rows.map((s: any) => (
        <details key={s.id} className="card"><summary className="cursor-pointer font-medium">{s.name} · {s.duration_minutes} min · {s.modality}{s.status !== "active" ? " (inativo)" : ""}</summary><div className="mt-4"><Form s={s} /></div></details>
      ))}
      <section className="card"><h2 className="mb-3 text-xl">Novo serviço</h2><Form /></section>
    </div>
  );
}

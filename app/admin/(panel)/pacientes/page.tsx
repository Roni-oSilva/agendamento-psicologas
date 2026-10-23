import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtPhone } from "@/lib/ui";
import { fmtDateShort, fmtTime } from "@/lib/time";

export const metadata: Metadata = { title: "Pacientes — Painel", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { professional: p } = await requireSession();
  const q = ((await searchParams).q ?? "").trim();
  const digits = q.replace(/\D/g, "");
  const rows = (await query(
    `select pt.id, pt.name, pt.phone, pt.email, pt.created_at,
       (select min(start_at) from appointments where patient_id=pt.id) as first_at,
       (select min(start_at) from appointments where patient_id=pt.id and start_at > now() and status in ('pending','confirmed')) as next_at,
       (select count(*)::int from appointments where patient_id=pt.id) as total
     from patients pt where pt.professional_id=$1 and pt.anonymized_at is null
       and ($2 = '' or pt.name ilike '%'||$2||'%' or pt.email ilike '%'||$2||'%' or ($3 <> '' and pt.phone like '%'||$3||'%'))
     order by pt.name limit 200`, [p.id, q, digits.length >= 3 ? digits : ""])).rows;
  return (
    <div>
      <h1 className="text-3xl">Pacientes</h1>
      <form className="mt-4 flex gap-2" role="search"><label className="sr-only" htmlFor="q">Buscar</label>
        <input id="q" name="q" defaultValue={q} className="field" placeholder="Nome, telefone ou e-mail" /><button className="btn-secondary">Buscar</button></form>
      <ul className="mt-4 space-y-2">
        {rows.map((r: any) => (
          <li key={r.id}><Link href={`/admin/pacientes/${r.id}`} className="card block !p-4 transition hover:bg-sage-50">
            <span className="font-medium">{r.name}</span> <span className="text-sm text-ink-soft">· {fmtPhone(r.phone)}{r.email ? ` · ${r.email}` : ""}</span>
            <span className="block text-sm text-ink-soft">{r.total} agendamento(s){r.first_at ? ` · primeiro em ${fmtDateShort(r.first_at, p.timezone)}` : ""}{r.next_at ? ` · próxima ${fmtDateShort(r.next_at, p.timezone)} ${fmtTime(r.next_at, p.timezone)}` : ""}</span>
          </Link></li>
        ))}
        {rows.length === 0 && <li className="card text-ink-soft">Nenhum paciente encontrado.</li>}
      </ul>
    </div>
  );
}

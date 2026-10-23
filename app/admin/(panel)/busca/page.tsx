import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { globalSearch } from "@/lib/admin-data";
import { fmtDateShort, fmtTime } from "@/lib/time";
import { StatusBadge } from "@/components/ui";
import { fmtPhone } from "@/lib/ui";

export const metadata: Metadata = { title: "Busca — Painel", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { professional: p } = await requireSession();
  const q = (await searchParams).q ?? "";
  const r = await globalSearch(p.id, q);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Busca</h1>
      <section className="card"><h2 className="text-xl">Pacientes</h2><ul className="mt-2 divide-y divide-sage-100">
        {r.patients.map((x: any) => <li key={x.id} className="py-2"><Link className="underline" href={`/admin/pacientes/${x.id}`}>{x.name}</Link> <span className="text-sm text-ink-soft">{fmtPhone(x.phone)}</span></li>)}
        {r.patients.length === 0 && <li className="py-2 text-ink-soft">Nenhum resultado.</li>}</ul></section>
      <section className="card"><h2 className="text-xl">Agendamentos</h2><ul className="mt-2 divide-y divide-sage-100">
        {r.appointments.map((a: any) => <li key={a.id} className="flex items-center justify-between gap-3 py-2"><Link className="underline" href={`/admin/agendamentos/${a.id}`}>{a.code} · {a.patient_name} · {fmtDateShort(a.start_at, p.timezone)} {fmtTime(a.start_at, p.timezone)}</Link><StatusBadge status={a.status} /></li>)}
        {r.appointments.length === 0 && <li className="py-2 text-ink-soft">Nenhum resultado. Use o código (AG-…) ou uma data (dd/mm/aaaa).</li>}</ul></section>
    </div>
  );
}

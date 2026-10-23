import Link from "next/link";
import type { Metadata } from "next";
import { lookupByToken } from "@/lib/manage";
import { fmtDate, fmtTime } from "@/lib/time";
import { ManageClient } from "./ManageClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seu agendamento", robots: { index: false, follow: false }, referrer: "no-referrer" };

const STATUS: Record<string, string> = { pending: "Aguardando confirmação", confirmed: "Confirmada", completed: "Concluída", cancelled: "Cancelada", no_show: "Não compareceu" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const m = await lookupByToken(token);
  if (!m.ok) {
    return (
      <main id="conteudo" className="mx-auto max-w-xl px-4 py-16">
        <div className="card text-center">
          <h1 className="text-2xl">{m.reason === "expired" ? "Link expirado" : "Link inválido"}</h1>
          <p className="mt-2 text-ink-soft">Este link não pode mais ser usado. Se precisar de ajuda, entre em contato diretamente com a profissional.</p>
        </div>
      </main>
    );
  }
  const { appt, prof, svc } = m;
  const active = ["pending", "confirmed"].includes(appt.status) && appt.start_at.getTime() > Date.now();
  const deadline = new Date(appt.start_at.getTime() - prof.cancel_deadline_hours * 3600_000);
  const canChange = active && Date.now() <= deadline.getTime();

  return (
    <main id="conteudo" className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-3xl">Seu agendamento</h1>
      <section className="card" aria-label="Detalhes">
        <p className="text-sm text-ink-soft">Código {appt.code}</p>
        <p className="mt-1 inline-block rounded-full bg-sage-100 px-3 py-1 text-sm text-sage-800">{STATUS[appt.status]}{appt.rescheduled_count > 0 && appt.status !== "cancelled" ? " · remarcada" : ""}</p>
        <h2 className="mt-4 text-2xl">{svc.name}</h2>
        <p className="text-ink-soft">com {prof.display_name}</p>
        <p className="mt-4 text-lg font-medium capitalize">{fmtDate(appt.start_at, prof.timezone)}</p>
        <p className="text-3xl font-semibold text-sage-700">{fmtTime(appt.start_at, prof.timezone)} – {fmtTime(appt.end_at, prof.timezone)}</p>
        <p className="mt-2 text-sm text-ink-soft">{appt.modality === "online" ? "Online" : "Presencial"} · {svc.duration_minutes} min · fuso {prof.timezone.replace("_", " ")}</p>
        {appt.modality === "online" && prof.online_instructions && <p className="mt-4 rounded-xl bg-lav-100 p-3 text-sm whitespace-pre-line">{prof.online_instructions}</p>}
        {appt.modality === "presencial" && prof.address && <p className="mt-4 rounded-xl bg-sand-100 p-3 text-sm whitespace-pre-line">{prof.address}</p>}
      </section>

      {canChange ? (
        <ManageClient token={token} timezone={prof.timezone} />
      ) : active ? (
        <p className="card mt-4 text-sm">O prazo para remarcar ou cancelar por este link ({prof.cancel_deadline_hours}h antes) já passou. Entre em contato diretamente com a profissional.</p>
      ) : appt.status === "cancelled" ? (
        <div className="mt-4 text-center"><Link className="btn-primary" href={`/psicologa/${prof.slug}/agendar`}>Agendar novo horário</Link></div>
      ) : null}
      <p className="mt-8 text-center text-sm"><Link className="underline" href={`/psicologa/${prof.slug}`}>Página de {prof.display_name}</Link></p>
    </main>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getProfessionalBySlug } from "@/lib/schedule";
import { BookingWizard } from "./BookingWizard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProfessionalBySlug((await params).slug);
  return { title: p ? `Agendar consulta — ${p.display_name}` : "Agendar consulta", robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProfessionalBySlug((await params).slug);
  if (!p) notFound();
  const services = (await query(
    `select id, name, description, instructions, duration_minutes, price_cents, modality from services
     where professional_id=$1 and status='active' order by position, name`, [p.id])).rows;
  return (
    <main id="conteudo" className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <Link href={`/psicologa/${p.slug}`} className="text-sm text-sage-700 underline">← {p.display_name}</Link>
      <h1 className="mb-6 mt-3 text-3xl">Agendar consulta</h1>
      {services.length === 0 ? <p className="card">Esta profissional ainda não disponibilizou serviços para agendamento online.</p> : (
        <BookingWizard slug={p.slug} professionalName={p.display_name} timezone={p.timezone} services={services}
          requireEmail={p.require_email} cancelHours={p.cancel_deadline_hours}
          whatsappContact={p.whatsapp_contact_enabled ? p.whatsapp_contact_number : null} />
      )}
    </main>
  );
}

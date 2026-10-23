import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { createAppointment, BookingError } from "@/lib/booking";
import { normalizePhone, validPhone } from "@/lib/time";
import { NewForm } from "./NewForm";

export const metadata: Metadata = { title: "Novo agendamento — Painel", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ start?: string; patient?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const services = (await query(`select id, name, duration_minutes from services where professional_id=$1 and status='active' order by position, name`, [s.professional.id])).rows;
  const prefill = sp.patient && /^[0-9a-f-]{36}$/.test(sp.patient)
    ? (await query(`select name, phone, email from patients where id=$1 and professional_id=$2`, [sp.patient, s.professional.id])).rows[0] : null;

  async function create(input: { serviceId: string; start: string; name: string; phone: string; email: string; note: string }) {
    "use server";
    const s2 = await requireSession();
    const phone = normalizePhone(input.phone);
    if (input.name.trim().length < 2 || !validPhone(phone)) return { ok: false as const, message: "Informe nome e telefone válidos (com DDD)." };
    try {
      const { appointment } = await createAppointment({
        professionalId: s2.professional.id, serviceId: input.serviceId, start: new Date(input.start),
        patient: { name: input.name.trim(), phone, email: input.email.trim() || null },
        patientNote: null, consent: { dataProcessing: false, textVersion: "manual" },
        source: "manual", actor: { type: "professional", userId: s2.userId },
      });
      if (input.note.trim()) await query(`update appointments set admin_notes=$2 where id=$1`, [appointment.id, input.note.trim().slice(0, 500)]);
      return { ok: true as const, id: appointment.id as string };
    } catch (e) {
      if (e instanceof BookingError) return { ok: false as const, message: e.message };
      throw e;
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-3xl">Novo agendamento</h1>
      <NewForm services={services} timezone={s.professional.timezone} initialStart={sp.start ?? null} prefill={prefill} action={create} />
    </div>
  );
}

import { z } from "zod";
import { query } from "@/lib/db";
import { getProfessionalBySlug } from "@/lib/schedule";
import { createAppointment, BookingError } from "@/lib/booking";
import { alternatives } from "@/lib/public-schedule";
import { json, limited, sameOrigin } from "@/lib/http";
import { normalizePhone, validPhone, localDate, fmtDate, fmtTime } from "@/lib/time";
import { signManageToken } from "@/lib/tokens";
import { env } from "@/lib/env";
import { PRIVACY_TEXT_VERSION } from "@/lib/consent";


const Body = z.object({
  serviceId: z.string().uuid(),
  start: z.string().datetime(),
  name: z.string().trim().min(3).max(120),
  phone: z.string().min(8).max(30),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional(),
  consentData: z.literal(true),
  consentWhatsapp: z.boolean().optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  if (await limited(req, "book", 12, 600)) return json({ error: "RATE_LIMITED", message: "Muitas tentativas. Tente novamente em alguns minutos." }, 429);
  const { slug } = await params;
  const prof = await getProfessionalBySlug(slug);
  if (!prof) return json({ error: "NOT_FOUND" }, 404);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "VALIDATION", fields: parsed.error.flatten().fieldErrors }, 422);
  const b = parsed.data;
  const phone = normalizePhone(b.phone);
  if (!validPhone(phone)) return json({ error: "VALIDATION", fields: { phone: ["Telefone inválido. Use DDD + número."] } }, 422);

  try {
    const { appointment } = await createAppointment({
      professionalId: prof.id, serviceId: b.serviceId, start: new Date(b.start),
      patient: { name: b.name, phone, email: b.email || null, contactPreference: b.consentWhatsapp === false ? (b.email ? "email" : "none") : "whatsapp" },
      patientNote: b.note || null,
      consent: { dataProcessing: true, whatsappContact: b.consentWhatsapp !== false, textVersion: PRIVACY_TEXT_VERSION },
      idempotencyKey: b.idempotencyKey, source: "online", actor: { type: "patient" },
    });
    const token = signManageToken(appointment.id, appointment.manage_token_version);
    return json({
      code: appointment.code, status: appointment.status, manageUrl: `${env.appUrl}/agendamento/${token}`, token,
      start: appointment.start_at, date: fmtDate(appointment.start_at, prof.timezone), time: fmtTime(appointment.start_at, prof.timezone),
    }, 201);
  } catch (e) {
    if (e instanceof BookingError) {
      if (e.code === "SLOT_UNAVAILABLE") {
        const svc = (await query(`select duration_minutes from services where id=$1`, [b.serviceId])).rows[0];
        const alt = svc ? await alternatives(prof, svc.duration_minutes, localDate(new Date(b.start), prof.timezone)) : [];
        return json({ error: e.code, message: e.message, alternatives: alt }, 409);
      }
      const status = e.code === "EMAIL_REQUIRED" || e.code === "CONSENT_REQUIRED" ? 422 : 400;
      return json({ error: e.code, message: e.message }, status);
    }
    console.error("[book] erro inesperado:", (e as Error).message);
    return json({ error: "INTERNAL" }, 500);
  }
}

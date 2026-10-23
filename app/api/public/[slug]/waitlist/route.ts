import { z } from "zod";
import { query, one } from "@/lib/db";
import { getProfessionalBySlug } from "@/lib/schedule";
import { json, limited, sameOrigin } from "@/lib/http";
import { normalizePhone, validPhone } from "@/lib/time";
import { PRIVACY_TEXT_VERSION } from "@/lib/consent";

const Body = z.object({
  serviceId: z.string().uuid(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(3).max(120),
  phone: z.string().min(8).max(30),
  consentData: z.literal(true),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  if (await limited(req, "waitlist", 6, 600)) return json({ error: "RATE_LIMITED" }, 429);
  const prof = await getProfessionalBySlug((await params).slug);
  if (!prof) return json({ error: "NOT_FOUND" }, 404);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "VALIDATION" }, 422);
  const phone = normalizePhone(p.data.phone);
  if (!validPhone(phone)) return json({ error: "VALIDATION", fields: { phone: ["Telefone inválido."] } }, 422);
  const svc = await one(`select id from services where id=$1 and professional_id=$2 and status='active'`, [p.data.serviceId, prof.id]);
  if (!svc || p.data.dateTo < p.data.dateFrom) return json({ error: "VALIDATION" }, 422);
  const pat = await one(
    `insert into patients(professional_id,name,phone) values($1,$2,$3)
     on conflict (professional_id, phone) do update set name=excluded.name, updated_at=now() returning id`, [prof.id, p.data.name, phone]);
  await query(`insert into consent_records(patient_id, consent_type, text_version, source) values($1,'data_processing',$2,'waitlist')`, [pat.id, PRIVACY_TEXT_VERSION]);
  await query(`insert into waitlist_entries(professional_id, service_id, patient_id, date_from, date_to) values($1,$2,$3,$4,$5)`,
    [prof.id, svc.id, pat.id, p.data.dateFrom, p.data.dateTo]);
  return json({ ok: true }, 201);
}

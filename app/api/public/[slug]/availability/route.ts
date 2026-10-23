import { query } from "@/lib/db";
import { getProfessionalBySlug } from "@/lib/schedule";
import { monthDates, daySlots } from "@/lib/public-schedule";
import { json, limited } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (await limited(req, "avail", 120, 60)) return json({ error: "RATE_LIMITED" }, 429);
  const { slug } = await params;
  const url = new URL(req.url);
  const prof = await getProfessionalBySlug(slug);
  if (!prof) return json({ error: "NOT_FOUND" }, 404);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const svc = (await query(`select duration_minutes from services where id::text=$1 and professional_id=$2 and status='active'`, [serviceId, prof.id])).rows[0];
  if (!svc) return json({ error: "SERVICE_NOT_FOUND" }, 404);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");
  if (month && /^\d{4}-\d{2}$/.test(month)) return json({ dates: await monthDates(prof, svc.duration_minutes, month), timezone: prof.timezone });
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ slots: await daySlots(prof, svc.duration_minutes, date), timezone: prof.timezone });
  return json({ error: "BAD_REQUEST" }, 400);
}

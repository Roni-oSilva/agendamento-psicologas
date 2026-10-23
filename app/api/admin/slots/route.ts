import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { monthDates, daySlots } from "@/lib/public-schedule";
import { json } from "@/lib/http";

/** Horários para o painel: a profissional vem da sessão; sem antecedência mínima. */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  const u = new URL(req.url);
  const serviceId = u.searchParams.get("serviceId") ?? "";
  const svc = (await query(`select duration_minutes from services where id::text=$1 and professional_id=$2`, [serviceId, s.professional.id])).rows[0];
  if (!svc) return json({ error: "SERVICE_NOT_FOUND" }, 404);
  const relaxed = { ...s.professional, min_notice_hours: 0 } as typeof s.professional;
  const rawEx = u.searchParams.get("excludeId");
  const exclude = rawEx && /^[0-9a-f-]{36}$/.test(rawEx) ? rawEx : undefined;
  const month = u.searchParams.get("month");
  const date = u.searchParams.get("date");
  if (month && /^\d{4}-\d{2}$/.test(month)) return json({ dates: await monthDates(relaxed, svc.duration_minutes, month, exclude) });
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ slots: await daySlots(relaxed, svc.duration_minutes, date, exclude) });
  return json({ error: "BAD_REQUEST" }, 400);
}

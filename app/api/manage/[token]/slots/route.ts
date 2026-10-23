import { lookupByToken } from "@/lib/manage";
import { monthDates, daySlots } from "@/lib/public-schedule";
import { json, limited } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await limited(req, "mslots", 120, 60)) return json({ error: "RATE_LIMITED" }, 429);
  const m = await lookupByToken((await params).token);
  if (!m.ok) return json({ error: "INVALID_LINK" }, 404);
  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");
  if (month && /^\d{4}-\d{2}$/.test(month)) return json({ dates: await monthDates(m.prof, m.svc.duration_minutes, month, m.appt.id) });
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ slots: await daySlots(m.prof, m.svc.duration_minutes, date, m.appt.id) });
  return json({ error: "BAD_REQUEST" }, 400);
}

import { z } from "zod";
import { lookupByToken } from "@/lib/manage";
import { rescheduleAppointment, BookingError } from "@/lib/booking";
import { alternatives } from "@/lib/public-schedule";
import { json, limited, sameOrigin } from "@/lib/http";
import { localDate } from "@/lib/time";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  if (await limited(req, "mresch", 15, 600)) return json({ error: "RATE_LIMITED" }, 429);
  const m = await lookupByToken((await params).token);
  if (!m.ok) return json({ error: "INVALID_LINK" }, 404);
  const body = z.object({ start: z.string().datetime() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "VALIDATION" }, 422);
  try {
    const upd = await rescheduleAppointment({ appointmentId: m.appt.id, newStart: new Date(body.data.start), actor: { type: "patient" } });
    return json({ ok: true, start: upd.start_at });
  } catch (e) {
    if (e instanceof BookingError) {
      const alt = e.code === "SLOT_UNAVAILABLE"
        ? await alternatives(m.prof, m.svc.duration_minutes, localDate(new Date(body.data.start), m.prof.timezone), m.appt.id) : undefined;
      return json({ error: e.code, message: e.message, alternatives: alt }, e.code === "SLOT_UNAVAILABLE" ? 409 : 400);
    }
    console.error("[reschedule]", (e as Error).message);
    return json({ error: "INTERNAL" }, 500);
  }
}

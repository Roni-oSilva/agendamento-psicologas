import { z } from "zod";
import { lookupByToken } from "@/lib/manage";
import { cancelAppointment, BookingError } from "@/lib/booking";
import { json, limited, sameOrigin } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  if (await limited(req, "mcancel", 15, 600)) return json({ error: "RATE_LIMITED" }, 429);
  const m = await lookupByToken((await params).token);
  if (!m.ok) return json({ error: "INVALID_LINK" }, 404);
  const body = z.object({ reason: z.string().max(200).optional() }).safeParse(await req.json().catch(() => ({})));
  try {
    await cancelAppointment({ appointmentId: m.appt.id, actor: { type: "patient" }, reason: body.success ? body.data.reason : null });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof BookingError) return json({ error: e.code, message: e.message }, 400);
    console.error("[cancel]", (e as Error).message);
    return json({ error: "INTERNAL" }, 500);
  }
}

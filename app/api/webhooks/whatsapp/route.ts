import { query } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/providers/whatsapp";

// Verificação do webhook (GET) conforme a Meta
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN
      && u.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

// Status de entrega/falha (POST). Assinatura HMAC obrigatória.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("invalid signature", { status: 401 });
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("bad request", { status: 400 }); }
  // armazena apenas metadados de status (sem conteúdo de mensagens)
  const statuses = (payload.entry ?? []).flatMap((e: any) => (e.changes ?? []).flatMap((c: any) => c.value?.statuses ?? []));
  for (const s of statuses) {
    const id = s.id as string;
    if (s.status === "delivered" || s.status === "read") {
      await query(`update notification_jobs set status='delivered', delivered_at=now(), updated_at=now() where provider_message_id=$1 and status in ('sent','delivered')`, [id]);
    } else if (s.status === "failed") {
      const err = `${s.errors?.[0]?.code ?? ""} ${s.errors?.[0]?.title ?? "falha na entrega"}`.trim();
      await query(`update notification_jobs set status='failed', last_error=$2, updated_at=now() where provider_message_id=$1`, [id, err.slice(0, 300)]);
    }
  }
  await query(`insert into webhook_events(provider, payload) values('whatsapp', $1)`, [{ statuses: statuses.map((s: any) => ({ id: s.id, status: s.status, ts: s.timestamp })) }]);
  return new Response("ok", { status: 200 });
}

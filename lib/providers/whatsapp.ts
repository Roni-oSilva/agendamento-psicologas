import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export class SendError extends Error {
  constructor(message: string, public permanent: boolean) { super(message); }
}

export interface SendResult { messageId: string; test: boolean }

export function whatsappConfigured(): boolean {
  if (env.whatsappMode === "cloud") return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  return env.whatsappMode === "test";
}

/**
 * Envio oficial pela WhatsApp Cloud API (mensagem de modelo aprovado — única forma permitida
 * para iniciar conversa fora da janela de 24h). Em modo "test" NADA é enviado: o job é marcado
 * como `test_sent`, claramente distinto de `sent`.
 */
export async function sendWhatsApp(opts: {
  to: string; body: string; templateName?: string | null; templateParams: string[];
}): Promise<SendResult> {
  if (env.whatsappMode === "test") {
    console.log(`[whatsapp:test] (não enviado) para=***${opts.to.slice(-4)}`);
    return { messageId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, test: true };
  }
  if (env.whatsappMode !== "cloud" || !whatsappConfigured()) throw new SendError("WhatsApp não configurado", false);
  if (!opts.templateName) {
    throw new SendError("Modelo de mensagem aprovado não configurado para este tipo de mensagem", true);
  }
  const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v21.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: opts.to,
        type: "template",
        template: {
          name: opts.templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "pt_BR" },
          components: [{ type: "body", parameters: opts.templateParams.map((text) => ({ type: "text", text })) }],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new SendError(`Falha de rede: ${e?.message ?? e}`, false);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `HTTP ${res.status}: ${json?.error?.message ?? "erro"} (code ${json?.error?.code ?? "?"})`;
    // 4xx (exceto 429) = erro permanente (número inválido, modelo inexistente...)
    throw new SendError(msg, res.status >= 400 && res.status < 500 && res.status !== 429);
  }
  const id = json?.messages?.[0]?.id;
  if (!id) throw new SendError("Resposta sem id de mensagem", false); // não presumir envio
  return { messageId: id, test: false };
}

export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = header.slice(7);
  return expected.length === got.length && timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

import { SendError } from "./whatsapp";

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<{ messageId: string }> {
  if (!emailConfigured()) throw new SendError("E-mail não configurado", false);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: opts.to, subject: opts.subject, text: opts.text }),
    signal: AbortSignal.timeout(15000),
  }).catch((e) => { throw new SendError(`Falha de rede: ${e?.message}`, false); });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new SendError(`HTTP ${res.status}: ${json?.message ?? "erro"}`, res.status >= 400 && res.status < 500 && res.status !== 429);
  if (!json.id) throw new SendError("Resposta sem id", false);
  return { messageId: json.id };
}

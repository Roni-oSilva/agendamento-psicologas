import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/ui";
import { env } from "@/lib/env";
import { whatsappConfigured } from "@/lib/providers/whatsapp";
import { DEFAULT_TEMPLATES, TEMPLATE_VARS, type MessageType } from "@/lib/messages";
import { JOB_TYPE_LABEL } from "@/lib/ui";

export const metadata: Metadata = { title: "WhatsApp — Painel", robots: { index: false } };
const TYPES = ["confirmation", "reminder_24h", "reminder_extra", "rescheduled", "cancelled"] as MessageType[];

async function saveSettings(fd: FormData) {
  "use server";
  const s = await requireSession();
  const extra = fd.get("extra") ? Number(fd.get("extra")) : null;
  await query(`update professionals set send_reminders=$2, extra_reminder_hours=$3, updated_at=now() where id=$1`,
    [s.professional.id, fd.get("send_reminders") === "on", extra && extra >= 1 && extra <= 12 ? extra : null]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "notifications.settings" });
  redirect("/admin/whatsapp?ok=" + encodeURIComponent("Configurações salvas (valem para novos agendamentos e remarcações)."));
}
async function saveTemplate(fd: FormData) {
  "use server";
  const s = await requireSession();
  const type = String(fd.get("type"));
  if (!TYPES.includes(type as MessageType)) return;
  const body = String(fd.get("body") ?? "").trim().slice(0, 1000);
  if (!body) redirect("/admin/whatsapp?err=" + encodeURIComponent("O texto não pode ficar vazio."));
  await query(
    `insert into notification_templates(professional_id, channel, type, body, provider_template_name) values($1,'whatsapp',$2,$3,$4)
     on conflict (professional_id, channel, type) do update set body=excluded.body, provider_template_name=excluded.provider_template_name, updated_at=now()`,
    [s.professional.id, type, body, String(fd.get("tpl") ?? "").trim().slice(0, 100) || null]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "template.update", meta: { type } });
  redirect("/admin/whatsapp?ok=" + encodeURIComponent("Modelo salvo."));
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { professional: p } = await requireSession();
  const sp = await searchParams;
  const tpls = Object.fromEntries((await query(`select type, body, provider_template_name from notification_templates where professional_id=$1 and channel='whatsapp'`, [p.id])).rows.map((r: any) => [r.type, r]));
  const vars = ["WHATSAPP_MODE", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"];
  const mode = env.whatsappMode;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">WhatsApp</h1>
      {sp.ok && <Flash>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      <section className="card">
        <h2 className="text-xl">Estado da integração</h2>
        <p className="mt-2">{mode === "cloud" && whatsappConfigured() ? "✅ Ativa (WhatsApp Business Platform / Cloud API)." : mode === "test" ? "🧪 Modo de teste: nenhuma mensagem real é enviada; os envios aparecem como “Modo teste”." : mode === "cloud" ? "⚠️ Modo cloud sem credenciais completas — nada é enviado." : "⏸ Não configurada: os agendamentos funcionam e as mensagens ficam pendentes até a ativação."}</p>
        <ul className="mt-3 text-sm">{vars.map((v) => <li key={v}><code>{v}</code>: {v === "WHATSAPP_MODE" ? mode : process.env[v] ? "definida" : "não definida"}</li>)}</ul>
        <p className="hint mt-3">As credenciais ficam somente no servidor (variáveis de ambiente), nunca no navegador. Webhook de status: <code>/api/webhooks/whatsapp</code>. Veja o passo a passo em <code>docs/WHATSAPP.md</code>.</p>
      </section>
      <section className="card"><h2 className="text-xl">Lembretes</h2>
        <form action={saveSettings} className="mt-3 space-y-3">
          <label className="flex items-center gap-2"><input type="checkbox" name="send_reminders" defaultChecked={p.send_reminders} className="h-5 w-5" /> Enviar lembrete 24 horas antes</label>
          <div><label className="label" htmlFor="ex">Lembrete adicional (horas antes, opcional)</label><input id="ex" name="extra" type="number" min={1} max={12} defaultValue={p.extra_reminder_hours ?? ""} className="field max-w-40" /></div>
          <button className="btn-primary btn-sm">Salvar</button></form></section>
      <section className="space-y-4"><h2 className="text-xl">Modelos de mensagem</h2>
        <p className="hint">Variáveis: {TEMPLATE_VARS.map((v) => `{{${v}}}`).join(" ")}. Não inclua informações clínicas. Para envio real, cada modelo precisa estar aprovado na Meta — informe abaixo o nome do modelo aprovado (os 6 parâmetros são enviados na ordem acima).</p>
        {TYPES.map((t) => (
          <form key={t} action={saveTemplate} className="card space-y-3"><input type="hidden" name="type" value={t} /><h3 className="text-lg">{JOB_TYPE_LABEL[t]}</h3>
            <textarea name="body" rows={4} defaultValue={tpls[t]?.body ?? DEFAULT_TEMPLATES[t]} className="field" aria-label={`Texto de ${JOB_TYPE_LABEL[t]}`} />
            <div><label className="label">Nome do modelo aprovado na Meta</label><input name="tpl" defaultValue={tpls[t]?.provider_template_name ?? ""} className="field" /></div>
            <button className="btn-secondary btn-sm">Salvar modelo</button></form>
        ))}</section>
    </div>
  );
}

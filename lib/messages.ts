import { fmtDate, fmtTime } from "./time";
import { env } from "./env";
import { signManageToken } from "./tokens";

export type MessageType = "confirmation" | "reminder_24h" | "reminder_extra" | "rescheduled" | "cancelled" | "waitlist_offer";

export const TEMPLATE_VARS = ["nome_paciente", "nome_psicologa", "data", "horario", "modalidade", "link_gerenciamento"] as const;

/** Textos padrão. Sem nenhum detalhe clínico: somente dados administrativos do agendamento. */
export const DEFAULT_TEMPLATES: Record<MessageType, string> = {
  confirmation:
    "Olá, {{nome_paciente}}! Sua consulta com {{nome_psicologa}} foi agendada para {{data}}, às {{horario}}.\nModalidade: {{modalidade}}.\nPara consultar, remarcar ou cancelar, use este link seguro: {{link_gerenciamento}}",
  reminder_24h:
    "Olá, {{nome_paciente}}! Este é um lembrete da sua consulta com {{nome_psicologa}}, agendada para amanhã, {{data}}, às {{horario}}.\nModalidade: {{modalidade}}.\nCaso precise remarcar, utilize este link seguro: {{link_gerenciamento}}.\nSe precisar de ajuda, entre em contato pelo canal oficial da profissional.",
  reminder_extra:
    "Olá, {{nome_paciente}}! Lembrete: sua consulta com {{nome_psicologa}} é hoje, às {{horario}} ({{modalidade}}). Link seguro: {{link_gerenciamento}}",
  rescheduled:
    "Olá, {{nome_paciente}}! Sua consulta com {{nome_psicologa}} foi remarcada para {{data}}, às {{horario}}.\nModalidade: {{modalidade}}.\nLink seguro: {{link_gerenciamento}}",
  cancelled:
    "Olá, {{nome_paciente}}! Sua consulta com {{nome_psicologa}} foi cancelada. Se desejar, agende um novo horário: {{link_gerenciamento}}",
  waitlist_offer:
    "Olá, {{nome_paciente}}! Surgiu uma vaga com {{nome_psicologa}}. Os horários são liberados por ordem de agendamento: {{link_gerenciamento}}",
};

export interface MessageContext {
  appointmentId: string; manageTokenVersion: number; startAt: Date; timezone: string; modality: string;
  patientName: string; professionalName: string; professionalSlug: string;
}

export function buildVars(ctx: MessageContext, type: MessageType): Record<(typeof TEMPLATE_VARS)[number], string> {
  const link = type === "cancelled" || type === "waitlist_offer"
    ? `${env.appUrl}/psicologa/${ctx.professionalSlug}/agendar`
    : `${env.appUrl}/agendamento/${signManageToken(ctx.appointmentId, ctx.manageTokenVersion)}`;
  return {
    nome_paciente: ctx.patientName.split(" ")[0],
    nome_psicologa: ctx.professionalName,
    data: fmtDate(ctx.startAt, ctx.timezone),
    horario: fmtTime(ctx.startAt, ctx.timezone),
    modalidade: ctx.modality === "online" ? "Online" : "Presencial",
    link_gerenciamento: link,
  };
}

export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando confirmação", confirmed: "Confirmada", completed: "Concluída", cancelled: "Cancelada", no_show: "Falta do paciente",
};
export const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900", confirmed: "bg-sage-100 text-sage-800", completed: "bg-sky-100 text-sky-900",
  cancelled: "bg-red-100 text-red-900", no_show: "bg-orange-100 text-orange-900",
};
export const JOB_LABEL: Record<string, string> = {
  pending: "Pendente", processing: "Enviando", sent: "Enviada", delivered: "Entregue", failed: "Falhou", cancelled: "Cancelada", skipped: "Ignorada", test_sent: "Modo teste (não enviada)",
};
export const JOB_TYPE_LABEL: Record<string, string> = {
  confirmation: "Confirmação", reminder_24h: "Lembrete 24h", reminder_extra: "Lembrete adicional", rescheduled: "Remarcação", cancelled: "Cancelamento", waitlist_offer: "Vaga na lista de espera",
};
export const WEEKDAYS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export const maskPhone = (p: string) => (p.length >= 4 ? `…${p.slice(-4)}` : p);
export const fmtPhone = (p: string) => {
  const d = p.startsWith("55") ? p.slice(2) : p;
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `+${p}`;
};
export const money = (c: number | null) => (c == null ? "" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

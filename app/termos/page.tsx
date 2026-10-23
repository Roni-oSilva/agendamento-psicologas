import type { Metadata } from "next";
export const metadata: Metadata = { title: "Termos de Uso" };

export default function Page() {
  return (
    <main id="conteudo" className="mx-auto max-w-3xl space-y-4 px-4 py-12 leading-relaxed">
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">Modelo para revisão: adapte e valide com assessoria jurídica e com as normas do Conselho de Psicologia antes de publicar.</p>
      <h1 className="text-3xl">Termos de Uso</h1>
      <p>Este site permite agendar consultas com a profissional. O agendamento só é confirmado após a tela de confirmação e o código do agendamento.</p>
      <h2 className="text-xl">Cancelamento e remarcação</h2>
      <p>Podem ser feitos pelo link seguro enviado a você, dentro do prazo definido pela profissional. Fora do prazo, entre em contato diretamente com ela.</p>
      <h2 className="text-xl">Uso adequado</h2>
      <p>Informe dados verdadeiros e não compartilhe seu link de gerenciamento. Este serviço não é indicado para situações de emergência: em crise, ligue 188 (CVV) ou 192 (SAMU).</p>
      <h2 className="text-xl">Comunicações</h2>
      <p>Mensagens automáticas contêm apenas informações administrativas (data, horário, modalidade e link). Você pode recusar o contato por WhatsApp no momento do agendamento.</p>
    </main>
  );
}

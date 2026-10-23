import type { Metadata } from "next";
export const metadata: Metadata = { title: "Política de Privacidade" };

export default function Page() {
  return (
    <main id="conteudo" className="mx-auto max-w-3xl space-y-4 px-4 py-12 leading-relaxed">
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">Modelo para revisão: este texto é um ponto de partida e deve ser revisado por assessoria jurídica e adaptado pela profissional (controladora dos dados) antes da publicação.</p>
      <h1 className="text-3xl">Política de Privacidade</h1>
      <p><strong>Versão do texto:</strong> 2025-01.</p>
      <h2 className="text-xl">Quais dados coletamos e para quê</h2>
      <p>Coletamos apenas o necessário para agendar e gerenciar sua consulta: nome, telefone (WhatsApp), e-mail (opcional ou quando exigido) e uma observação administrativa opcional. Não solicitamos nem devemos receber informações clínicas por este formulário.</p>
      <h2 className="text-xl">Base legal e finalidade</h2>
      <p>Execução do agendamento solicitado por você e, quando aplicável, seu consentimento (ex.: contato por WhatsApp). Registramos a data/versão do consentimento.</p>
      <h2 className="text-xl">Compartilhamento</h2>
      <p>Seus dados não são usados para publicidade nem vendidos. Podem ser tratados por operadores estritamente necessários (hospedagem, WhatsApp Business Platform da Meta para envio de lembretes, e-mail transacional). Não usamos rastreadores de terceiros nas páginas de agendamento.</p>
      <h2 className="text-xl">Retenção</h2>
      <p>Mantemos os dados administrativos pelo tempo necessário ao atendimento e às obrigações legais e profissionais aplicáveis; depois são excluídos ou anonimizados.</p>
      <h2 className="text-xl">Seus direitos (LGPD)</h2>
      <p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, exclusão, portabilidade e revogação do consentimento, entrando em contato com a profissional pelo e-mail informado no rodapé do site dela.</p>
      <h2 className="text-xl">Segurança</h2>
      <p>Conexão criptografada (HTTPS), acesso restrito por autenticação, links de gerenciamento pessoais e registros de auditoria.</p>
    </main>
  );
}

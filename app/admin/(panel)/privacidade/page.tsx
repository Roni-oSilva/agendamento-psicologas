import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata: Metadata = { title: "Privacidade — Painel", robots: { index: false } };

export default async function Page() {
  const { professional: p } = await requireSession();
  const c = (await query(
    `select cr.consent_type, count(*)::int n, max(cr.created_at) last from consent_records cr join patients pt on pt.id=cr.patient_id
     where pt.professional_id=$1 group by cr.consent_type`, [p.id])).rows;
  const t = (await query(`select count(*)::int total, count(*) filter (where anonymized_at is not null)::int anon from patients where professional_id=$1`, [p.id])).rows[0];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Privacidade e consentimentos</h1>
      <section className="card"><h2 className="text-xl">Consentimentos registrados</h2>
        <ul className="mt-3 text-sm">{c.map((r: any) => <li key={r.consent_type}>{r.consent_type}: {r.n} registro(s)</li>)}{c.length === 0 && <li className="text-ink-soft">Nenhum ainda.</li>}</ul>
        <p className="hint mt-2">{t.total} paciente(s), {t.anon} anonimizado(s). Cada agendamento online registra a versão do texto aceito.</p></section>
      <section className="card space-y-2 text-sm"><h2 className="text-xl">Boas práticas aplicadas</h2>
        <ul className="list-disc space-y-1 pl-5"><li>Coleta mínima: nome, telefone, e-mail opcional. Nenhum campo clínico.</li>
          <li>Mensagens de WhatsApp contêm apenas data, hora, modalidade e link pessoal.</li>
          <li>Sem rastreadores de terceiros nas páginas públicas; sem dados de pacientes em URLs de busca, logs ou analytics.</li>
          <li>Direitos dos titulares: use a ficha do paciente para corrigir ou anonimizar. Divulgue um e-mail de contato no portfólio.</li>
          <li>Retenção: dados administrativos devem ser mantidos apenas pelo tempo necessário (consulte o CRP/jurídico para prazos). O script <code>npm run retention</code> remove sessões, tentativas e eventos técnicos antigos.</li></ul>
        <p className="hint">Os textos de Política de Privacidade e Termos são modelos e precisam de revisão jurídica.</p></section>
    </div>
  );
}

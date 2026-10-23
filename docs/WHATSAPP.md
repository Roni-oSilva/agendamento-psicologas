# WhatsApp Business Platform (API oficial da Meta)

O sistema **nunca** usa automações não oficiais. Há três modos (`WHATSAPP_MODE`):

| Modo | Efeito |
|---|---|
| `disabled` (padrão) | Nada é enviado. Jobs ficam `pendentes`; o painel avisa "pendente de configuração". |
| `test` | Nada é enviado. Jobs viram `test_sent` ("Modo teste"), nunca `sent`. |
| `cloud` | Envio real pela Cloud API. |

## Ativação (modo `cloud`)
1. Crie um app na Meta for Developers e adicione o produto WhatsApp; verifique o negócio e registre o número.
2. Crie e **submeta para aprovação** os modelos (categoria *Utility*, idioma `pt_BR`) com **6 variáveis de corpo, nesta ordem**:
   `{{1}} nome_paciente, {{2}} nome_psicologa, {{3}} data, {{4}} horario, {{5}} modalidade, {{6}} link_gerenciamento`.
3. Informe o nome de cada modelo aprovado em **Painel → WhatsApp** (ou nas variáveis `WHATSAPP_TEMPLATE_CONFIRMATION`, `_REMINDER_24H`, `_REMINDER_EXTRA`, `_RESCHEDULED`, `_CANCELLED`).
4. Defina no servidor: `WHATSAPP_MODE=cloud`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (token permanente de usuário do sistema), `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
5. Configure o webhook para `https://SEU-DOMINIO/api/webhooks/whatsapp` (campo `messages`) com o mesmo verify token. A assinatura `X-Hub-Signature-256` é verificada.
6. Mantenha o worker rodando (`npm run worker`).

## Garantias
- Fila persistente em PostgreSQL (`notification_jobs`), `FOR UPDATE SKIP LOCKED`; vários workers não duplicam envio; `dedupe_key` único.
- Retentativas com backoff (1, 2, 4, 8 min…) até 5 tentativas; erros 4xx (exceto 429) são permanentes.
- Resposta sem `message id` nunca é tratada como enviada.
- Remarcação/cancelamento cancelam lembretes pendentes; o worker ainda descarta jobs cujo horário mudou.
- Falha de envio jamais altera ou apaga o agendamento.
- Mensagens contêm só dados administrativos. Consentimento de WhatsApp é registrado em `consent_records`.

Credenciais ficam apenas em variáveis de ambiente (credenciais por profissional, criptografadas, não estão implementadas: um deploy = um número).

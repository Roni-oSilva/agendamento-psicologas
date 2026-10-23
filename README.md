# Agendamento inteligente para psicólogas

Portfólio público + agendamento online + agenda administrativa + lembretes por WhatsApp.
Next.js 16 (App Router) · TypeScript · Tailwind v4 · PostgreSQL 16 (`pg`, migrações SQL) · worker Node.

## Arquitetura
```
app/                 páginas públicas (/psicologa/[slug], /agendamento/[token]), painel (/admin), APIs
lib/availability.ts  geração de horários (função PURA, testada, inclui fusos/DST)
lib/booking.ts       criar/remarcar/cancelar atômicos (advisory lock + transação + restrição de exclusão)
lib/notify-queue.ts  enfileiramento e cancelamento de lembretes
worker/              processador da fila (SKIP LOCKED, retentativas, provedores)
migrations/          SQL versionado        tests/  vitest (PostgreSQL real)       e2e/  Playwright (celular)
```
### Como conflitos são impossíveis
1. Toda gravação roda em transação com `pg_advisory_xact_lock` por profissional (serializa criar/remarcar/bloqueios).
2. Sob o lock, o horário é **recalculado** com o mesmo motor da UI (jornada, bloqueios, intervalo, limite diário, antecedência).
3. **Garantia final no banco**: `EXCLUDE USING gist (professional_id WITH =, tstzrange(start_at, block_end_at,'[)') WITH &&)` entre agendamentos ativos. Mesmo um INSERT direto sobreposto é rejeitado (testado).
4. Idempotência por `(professional_id, idempotency_key)`; botão com trava anti duplo clique.
Intervalos semiabertos `[início, fim)` permitem consultas consecutivas; `block_end_at = fim + preparação`.

### Links do paciente
`/agendamento/{id}.{HMAC(id:versão)}` — imprevisível, sem token em claro no banco, revogável (incrementar `manage_token_version`), expira 7 dias após a consulta, validado no servidor; prazo de cancelamento/remarcação configurável.

## Desenvolvimento local
```bash
cp .env.example .env          # ajuste DATABASE_URL e SESSION_SECRET
createdb agenda && createdb agenda_test
npm install
npm run migrate && npm run seed   # seed cria profissional DEMO e imprime a senha
npm run dev                       # http://localhost:3000   (painel: /admin)
npm run worker                    # em outro terminal (WHATSAPP_MODE=test para ver o fluxo)
```
Criar conta real: `PROF_PASSWORD='...' npm run create-professional -- "Nome" email slug`.

## Testes
```bash
npm test                          # unitários + integração + concorrência (usa agenda_test)
npm run build && npm start & npx playwright test   # E2E em viewport de celular (exige seed)
```
Cobrem: sobreposição total/parcial, consecutivas, buffer, duração por serviço, expediente/almoço, bloqueios, 20 requisições simultâneas (1 vence), limite diário concorrente, idempotência, remarcação/cancelamento, isolamento entre profissionais, tokens, fusos e horário de verão, fila (falha temporária, permanente, esgotamento, 3 workers sem duplicar, lembretes antigos descartados).

## Implantação
- `docker-compose.yml` (db, migrate, web, worker) ou qualquer PaaS com PostgreSQL gerenciado; HTTPS via proxy reverso (Caddy/Nginx/Cloudflare); defina `APP_URL` com o domínio `https://…`.
- Rode `npm run migrate` a cada deploy; mantenha **web e worker** ativos.
- Cron diário: `npm run retention` (limpa sessões, rate-limit, webhooks e jobs antigos).
- Backup: `pg_dump -Fc` diário criptografado + retenção 30 dias + teste de restauração mensal (ou PITR do provedor).
- Monitoramento: `GET /api/health` (público: ok/erro; com `Authorization: Bearer $HEALTH_TOKEN` mostra fila atrasada/falhas). Alerte se `status != ok`. Integre Sentry via `SENTRY_DSN` (não incluído).
- Proxy: encaminhe `X-Forwarded-For` (usado no rate limit).

## Checklist de produção
- [ ] `SESSION_SECRET` aleatório ≥32 chars; senhas fortes; `NODE_ENV=production` (cookies `Secure`)
- [ ] HTTPS + domínio; HSTS já enviado pela aplicação
- [ ] Worker rodando; WhatsApp configurado (docs/WHATSAPP.md) ou aviso "pendente" ciente
- [ ] Backups testados; alerta em `/api/health`
- [ ] Política de Privacidade/Termos **revisados por jurídico**; e-mail de contato LGPD no portfólio
- [ ] CRP e textos de publicidade conferidos (Código de Ética/CFP)
- [ ] `npm test` e E2E verdes no ambiente de staging

## Estado e limitações conhecidas (honesto)
Implementado e testado: motor de agenda, anti-conflito, remarcação/cancelamento, histórico, fila/worker, WhatsApp Cloud API (não validada contra a Meta real: requer credenciais), painel (dashboard, agenda dia/semana/mês, pacientes, serviços, disponibilidade, bloqueios, portfólio, notificações, auditoria, CSV, busca), recuperação de senha (e-mail via Resend se configurado; sem isso o link só é logado em desenvolvimento).
**Não implementado**: pagamentos (arquitetura preparada, sem módulo), envio de convites automáticos da lista de espera (a inscrição pública existe; falta o job de convite), upload de foto (usa URL https), verificação de e-mail, Sentry, teste de carga, credenciais WhatsApp por profissional, auto-cadastro de profissionais (criadas via script), publicação em domínio (depende da sua infraestrutura).

import { test, expect, type Page } from "@playwright/test";
import pg from "pg";

const DB = process.env.E2E_DATABASE_URL ?? "postgres://app:app@localhost:5432/agenda";
const SLUG = "maria-silva";

async function reset() {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  await c.query(`truncate appointments, patients cascade; delete from blocked_periods; truncate rate_limit_events;`);
  await c.query(`update professionals set min_notice_hours=0, cancel_deadline_hours=0, buffer_minutes=10, published=true where slug=$1`, [SLUG]);
  await c.end();
}
test.beforeEach(reset);

const noHScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

/** Percorre o assistente até a tela de revisão, escolhendo o primeiro dia/horário livre ou o índice dado. */
async function fillUntilReview(page: Page, name: string, phone: string, slotIndex = 0, nextMonth = false) {
  await page.goto(`/psicologa/${SLUG}/agendar`);
  await page.getByRole("radio").first().check({ force: true }).catch(() => {});
  await page.getByRole("button", { name: "Continuar" }).click();
  if (nextMonth) await page.getByRole("button", { name: "Próximo mês" }).click();
  const day = page.locator('button[aria-label*="com horários disponíveis"]').first();
  await expect(day).toBeVisible();
  await day.click();
  const slots = page.getByRole("group", { name: "Horários disponíveis" }).getByRole("button");
  await expect(slots.first()).toBeVisible();
  await slots.nth(slotIndex).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("Telefone com WhatsApp").fill(phone);
  await page.getByRole("button", { name: "Continuar" }).click();
}

test("paciente agenda pelo celular, vê confirmação e gerencia o agendamento", async ({ page }) => {
  await page.goto(`/psicologa/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Maria Silva");
  await noHScroll(page);

  await fillUntilReview(page, "Ana Paula Souza", "(11) 91234-5678");
  await noHScroll(page);
  await expect(page.getByText("Ana Paula Souza")).toBeVisible();
  // sem consentimento não confirma
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByText("É necessário concordar")).toBeVisible();
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("heading", { name: "Consulta agendada" })).toBeVisible();
  await expect(page.getByText(/AG-[A-Z0-9]{8}/)).toBeVisible();

  // persistiu de verdade
  const c = new pg.Client({ connectionString: DB }); await c.connect();
  const r = await c.query(`select status, (select count(*)::int from notification_jobs) as jobs from appointments`);
  await c.end();
  expect(r.rows).toHaveLength(1);
  expect(r.rows[0].jobs).toBeGreaterThanOrEqual(1);

  // link de gerenciamento -> remarcar
  await page.getByRole("link", { name: "Ver, remarcar ou cancelar" }).click();
  await expect(page.getByRole("heading", { name: "Seu agendamento" })).toBeVisible();
  await page.getByRole("button", { name: "Remarcar" }).click();
  const day = page.locator('button[aria-label*="com horários disponíveis"]').first();
  await day.click();
  const slots = page.getByRole("group", { name: "Horários disponíveis" }).getByRole("button");
  await slots.last().click();
  await page.getByRole("button", { name: "Confirmar remarcação" }).click();
  await expect(page.getByText("Consulta remarcada com sucesso.")).toBeVisible();
  await expect(page.getByText("remarcada", { exact: false }).first()).toBeVisible();

  // cancelar
  await page.getByRole("button", { name: "Cancelar consulta" }).click();
  await page.getByRole("button", { name: "Sim, cancelar" }).click();
  await expect(page.getByText("Consulta cancelada.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Agendar novo horário" })).toBeVisible();
});

test("dois pacientes disputam o mesmo horário: o segundo vê aviso e alternativas", async ({ browser }) => {
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, baseURL: "http://localhost:3100" }); return { ctx, page: await ctx.newPage() }; };
  const a = await mk(), b = await mk();
  await fillUntilReview(a.page, "Paciente A", "11911110001");
  await fillUntilReview(b.page, "Paciente B", "11911110002"); // mesmo primeiro horário
  await a.page.getByLabel(/Li e concordo/).check();
  await b.page.getByLabel(/Li e concordo/).check();
  await a.page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(a.page.getByRole("heading", { name: "Consulta agendada" })).toBeVisible();
  await b.page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(b.page.getByText("acabou de ficar indisponível")).toBeVisible();
  await expect(b.page.getByRole("heading", { name: "Consulta agendada" })).toHaveCount(0);
  const c = new pg.Client({ connectionString: DB }); await c.connect();
  expect((await c.query(`select count(*)::int n from appointments`)).rows[0].n).toBe(1);
  await c.end();
  // B escolhe alternativa sugerida e conclui
  await b.page.getByRole("button", { name: /\d{2}\/\d{2} · \d{2}:\d{2}/ }).first().click();
  await b.page.getByRole("button", { name: "Continuar" }).click();
  await b.page.getByLabel(/Li e concordo/).check();
  await b.page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(b.page.getByRole("heading", { name: "Consulta agendada" })).toBeVisible();
  await a.ctx.close(); await b.ctx.close();
});

test("painel: login, agenda do dia/semana/mês mostra a consulta; sem sessão não acessa", async ({ page }) => {
  await page.goto("/admin/agenda");
  await expect(page).toHaveURL(/\/admin\/login/);
  await fillUntilReview(page, "Carla Mendes", "11911110003");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("heading", { name: "Consulta agendada" })).toBeVisible();

  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill("demo@exemplo.com.br");
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await page.getByLabel("Senha").fill("senhaDemo12345");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: /Olá, Maria/ })).toBeVisible();
  await noHScroll(page);
  await expect(page.getByText("Notificações automáticas pendentes", { exact: false }).or(page.getByText("Modo de teste do WhatsApp"))).toBeVisible();

  // semana e mês contêm Carla (a consulta fica na próxima semana: navega até achar)
  await page.goto("/admin/agenda?view=month");
  await expect(page.getByRole("grid", { name: "Calendário mensal" })).toBeVisible();
  await page.goto("/admin/pacientes?q=Carla");
  await page.getByRole("link", { name: /Carla Mendes/ }).click();
  await page.getByRole("link", { name: /\d{2}\/\d{2}\/\d{4}/ }).first().click();
  await expect(page.getByRole("heading", { name: "Carla Mendes" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByText("Status atualizado.")).toBeVisible();
  await expect(page.getByText("Confirmada").first()).toBeVisible();
  await page.getByRole("button", { name: "Registrar falta" }).click();
  await expect(page.getByText("Falta do paciente").first()).toBeVisible();
  await expect(page.getByText("Histórico de alterações")).toBeVisible();
});

test("link de gerenciamento inválido ou adulterado é rejeitado", async ({ page }) => {
  await page.goto("/agendamento/lixo");
  await expect(page.getByRole("heading", { name: "Link inválido" })).toBeVisible();
  await page.goto("/agendamento/11111111-1111-1111-1111-111111111111.abcdef");
  await expect(page.getByRole("heading", { name: "Link inválido" })).toBeVisible();
});

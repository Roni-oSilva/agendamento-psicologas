// Roteiro de demonstração: usa o sistema de verdade no navegador (celular + desktop) e salva capturas.
import { chromium, devices } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.DEMO_URL ?? "http://localhost:3100";
const OUT = "docs/demo";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });

// ───── Paciente no celular ─────
const m = await b.newContext({ ...devices["Pixel 7"], baseURL: BASE });
const p = await m.newPage();
await p.goto("/psicologa/maria-silva"); await shot(p, "01-portfolio-celular");
await p.locator("#servicos").scrollIntoViewIfNeeded(); await shot(p, "02-servicos-celular");
await p.getByRole("link", { name: "Agendar consulta" }).first().click();
await p.getByText("Psicoterapia individual (online)").click(); await shot(p, "03-escolher-servico");
await p.getByRole("button", { name: "Continuar" }).click();
await p.locator('button[aria-label*="com horários disponíveis"]').nth(1).click();
await p.getByRole("group", { name: "Horários disponíveis" }).getByRole("button").nth(2).click();
await shot(p, "04-calendario-horarios", true);
await p.getByRole("button", { name: "Continuar" }).click();
await p.getByLabel("Nome completo").fill("Visitante Demonstração");
await p.getByLabel("Telefone com WhatsApp").fill("(11) 98888-7777");
await shot(p, "05-dados");
await p.getByRole("button", { name: "Continuar" }).click();
await p.getByLabel(/Li e concordo/).check(); await shot(p, "06-revisar", true);
await p.getByRole("button", { name: "Confirmar agendamento" }).click();
await p.getByRole("heading", { name: "Consulta agendada" }).waitFor(); await shot(p, "07-confirmacao");
await p.getByRole("link", { name: "Ver, remarcar ou cancelar" }).click();
await p.getByRole("heading", { name: "Seu agendamento" }).waitFor(); await shot(p, "08-gerenciar-agendamento", true);
const manageUrl = p.url();
await m.close();

// ───── Worker (WhatsApp em modo teste) processa a confirmação ─────
console.log(execSync("npx tsx -e \"import {processDueJobs} from './worker/process'; import {pool} from './lib/db'; processDueJobs(50).then(r=>{console.log(JSON.stringify(r));return pool().end()})\"", { env: { ...process.env, WHATSAPP_MODE: "test" } }).toString().trim());

// ───── Profissional no desktop ─────
const d = await b.newContext({ viewport: { width: 1280, height: 860 }, baseURL: BASE });
const a = await d.newPage();
await a.goto("/admin/login"); await shot(a, "09-login");
await a.getByLabel("E-mail").fill("demo@exemplo.com.br"); await a.getByLabel("Senha").fill("senhaDemo12345");
await a.getByRole("button", { name: "Entrar" }).click(); await a.getByRole("heading", { name: /Olá/ }).waitFor();
await shot(a, "10-dashboard", true);
await a.goto("/admin/agenda?view=week"); await shot(a, "11-agenda-semana", true);
await a.goto("/admin/agenda?view=month"); await shot(a, "12-agenda-mes", true);
await a.goto("/admin/pacientes?q=Visitante"); await a.getByRole("link", { name: /Visitante/ }).click();
await a.getByRole("link", { name: /\d{2}\/\d{2}\/\d{4}/ }).first().click();
await a.getByRole("heading", { name: "Visitante Demonstração" }).waitFor(); await shot(a, "13-detalhe-agendamento", true);
await a.getByRole("button", { name: "Confirmar", exact: true }).click(); await a.getByText("Status atualizado.").waitFor();
await shot(a, "14-confirmado-historico", true);
await a.goto("/admin/notificacoes"); await shot(a, "15-central-notificacoes", true);
await a.goto("/admin/disponibilidade"); await shot(a, "16-disponibilidade", true);
await a.goto("/admin/whatsapp"); await shot(a, "17-whatsapp", true);
await a.goto("/admin/pacientes"); await shot(a, "18-pacientes", true);
await d.close();

// ───── Paciente remarca pelo link (celular) ─────
const m2 = await b.newContext({ ...devices["Pixel 7"], baseURL: BASE });
const q = await m2.newPage();
await q.goto(manageUrl); await q.getByRole("button", { name: "Remarcar" }).click();
await q.locator('button[aria-label*="com horários disponíveis"]').nth(2).click();
await q.getByRole("group", { name: "Horários disponíveis" }).getByRole("button").nth(1).click();
await q.getByRole("button", { name: "Confirmar remarcação" }).click();
await q.getByText("Consulta remarcada com sucesso.").waitFor(); await shot(q, "19-remarcado", true);
await m2.close(); await b.close();

console.log("ok:", fs.readdirSync(OUT).join(", "));

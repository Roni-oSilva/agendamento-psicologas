import { randomBytes } from "node:crypto";
import { migrate } from "./migrate";
import { createProfessional, emailInUse } from "../lib/accounts";
import { pool, query } from "../lib/db";

/** Cria uma profissional de DEMONSTRAÇÃO. Em produção use: npm run create-professional */
export async function seedDemo() {
  await migrate();
  const email = process.env.SEED_EMAIL ?? "demo@exemplo.com.br";
  if (await emailInUse(email)) { console.log("Já existe:", email); return; }
  const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url") + "9a";
  const r = await createProfessional({ name: "Maria Silva", email, password, slug: "maria-silva", published: true });
  await query(
    `update professionals set headline=$2, bio=$3, approach=$4, education=$5, experience=$6, languages=$7, specialties=$8, faq=$9,
       online_instructions=$10, how_it_works=$11, contact_email=$12 where id=$1`,
    [r.professionalId, "Psicoterapia individual com escuta cuidadosa e sem pressa.",
     "Sou psicóloga clínica e acompanho adultos em processos de autoconhecimento e de enfrentamento de dificuldades emocionais, em um espaço acolhedor e sigiloso.",
     "Terapia Cognitivo-Comportamental.", ["Graduação em Psicologia — Universidade (exemplo)", "Especialização em Terapia Cognitivo-Comportamental"],
     ["Atendimento clínico de adultos desde 2018"], ["Português", "Inglês"], ["Ansiedade", "Autoconhecimento", "Transições de vida", "Relacionamentos"],
     JSON.stringify([{ q: "Como funciona o cancelamento?", a: "Você pode remarcar ou cancelar pelo link seguro até 24h antes da consulta." },
       { q: "Preciso criar conta?", a: "Não. Basta escolher o horário e informar seus dados de contato." }]),
     "Procure um local silencioso, com boa conexão e fones de ouvido. O link da videochamada é enviado antes da sessão.",
     "O primeiro passo é escolher o melhor horário. Cada sessão tem 50 minutos.", email]);
  await query(`insert into services(professional_id,name,description,duration_minutes,modality,position) values($1,'Primeira consulta (online)','Conversa inicial para conhecermos sua demanda.',60,'online',0)`, [r.professionalId]);
  console.log(`Profissional de demonstração criada.\n  login: ${email}\n  senha: ${password}\n  página: /psicologa/maria-silva`);
}
if (process.argv[1]?.endsWith("seed.ts")) seedDemo().then(() => pool().end()).catch((e) => { console.error(e); process.exit(1); });

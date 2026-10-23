import { migrate } from "./migrate";
import { createProfessional, emailInUse, validatePasswordStrength } from "../lib/accounts";
import { pool } from "../lib/db";

/** Uso: npm run create-professional -- "Nome" email@x.com slug-da-pagina  (senha via env PROF_PASSWORD) */
async function main() {
  const [name, email, slug] = process.argv.slice(2);
  const password = process.env.PROF_PASSWORD ?? "";
  if (!name || !email || !slug) throw new Error('Uso: PROF_PASSWORD=... npm run create-professional -- "Nome" email slug');
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);
  await migrate();
  if (await emailInUse(email)) throw new Error("E-mail já cadastrado");
  await createProfessional({ name, email, password, slug, published: false });
  console.log("Criada. Entre em /admin/login, complete o portfólio e publique a página.");
}
main().then(() => pool().end()).catch((e) => { console.error(e.message); process.exit(1); });

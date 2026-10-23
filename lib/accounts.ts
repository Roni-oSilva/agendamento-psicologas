import bcrypt from "bcryptjs";
import { tx, query } from "./db";

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 12); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "A senha deve ter ao menos 10 caracteres.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Use letras e números na senha.";
  return null;
}

/** Cria usuário + profissional com jornada padrão (seg–sex 9–12 e 14–18) e um serviço inicial. */
export async function createProfessional(o: {
  name: string; email: string; password: string; slug: string; displayName?: string; published?: boolean; timezone?: string;
}) {
  const hash = await hashPassword(o.password);
  return tx(async (c) => {
    const u = (await c.query(
      `insert into users(name,email,password_hash,email_verified_at) values($1,$2,$3,now()) returning id`,
      [o.name, o.email.trim(), hash])).rows[0];
    const p = (await c.query(
      `insert into professionals(user_id, slug, display_name, published, timezone) values($1,$2,$3,$4,$5) returning *`,
      [u.id, o.slug, o.displayName ?? o.name, o.published ?? false, o.timezone ?? "America/Sao_Paulo"])).rows[0];
    for (let wd = 1; wd <= 5; wd++) {
      await c.query(`insert into availability_rules(professional_id, weekday, start_time, end_time) values($1,$2,'09:00','12:00'),($1,$2,'14:00','18:00')`, [p.id, wd]);
    }
    const s = (await c.query(
      `insert into services(professional_id, name, description, duration_minutes, modality, position)
       values($1,'Psicoterapia individual (online)','Sessão individual por videochamada.',50,'online',1) returning id`, [p.id])).rows[0];
    return { userId: u.id as string, professionalId: p.id as string, serviceId: s.id as string };
  });
}

export const emailInUse = async (email: string) =>
  (await query(`select 1 from users where lower(email)=lower($1)`, [email])).rowCount! > 0;

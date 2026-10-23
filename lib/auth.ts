import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query, one } from "./db";
import { env } from "./env";
import { randomToken, sha256 } from "./tokens";
import { verifyPassword, hashPassword, validatePasswordStrength } from "./accounts";
import { hit, clearBucket } from "./ratelimit";
import { audit } from "./audit";
import type { ProfessionalRow } from "./schedule";

const COOKIE = "session";
const SESSION_DAYS = 14;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIp();
  const mail = email.trim().toLowerCase();
  // limites por e-mail e por IP
  if (!(await hit(`login:email:${mail}`, 8, 900)) || !(await hit(`login:ip:${ip}`, 30, 900))) {
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }
  const u = await one(`select * from users where lower(email)=$1`, [mail]);
  // comparação sempre executada para evitar enumeração de usuários por tempo de resposta
  const ok = await verifyPassword(password, u?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
  if (!u || !ok || u.status !== "active") return { ok: false, error: "E-mail ou senha incorretos." };
  await clearBucket(`login:email:${mail}`);
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await query(`insert into sessions(user_id, token_hash, expires_at, user_agent) values($1,$2,$3,$4)`,
    [u.id, sha256(token), expires, ((await headers()).get("user-agent") ?? "").slice(0, 200)]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", expires });
  const prof = await one(`select id from professionals where user_id=$1`, [u.id]);
  await audit(null, { userId: u.id, professionalId: prof?.id, action: "auth.login" });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await query(`delete from sessions where token_hash=$1`, [sha256(t)]);
  jar.delete(COOKIE);
}

export interface Session { userId: string; userName: string; email: string; professional: ProfessionalRow }

export async function getSession(): Promise<Session | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const r = await one(
    `select u.id as user_id, u.name as user_name, u.email, p.*
     from sessions s join users u on u.id=s.user_id and u.status='active'
     join professionals p on p.user_id=u.id
     where s.token_hash=$1 and s.expires_at > now()`, [sha256(t)]);
  if (!r) return null;
  const { user_id, user_name, email, ...professional } = r;
  return { userId: user_id, userName: user_name, email, professional: professional as ProfessionalRow };
}

/** Toda página/ação do painel passa por aqui: o profissional vem SEMPRE da sessão, nunca de parâmetros. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return s;
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  const ip = await clientIp();
  if (!(await hit(`reset:ip:${ip}`, 5, 3600))) return null;
  const u = await one(`select id from users where lower(email)=lower($1) and status='active'`, [email.trim()]);
  if (!u) return null;
  const token = randomToken();
  await query(`insert into password_resets(user_id, token_hash, expires_at) values($1,$2, now() + interval '1 hour')`, [u.id, sha256(token)]);
  return `${env.appUrl}/admin/redefinir/${token}`;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const weak = validatePasswordStrength(newPassword);
  if (weak) return { ok: false, error: weak };
  const r = await one(`select * from password_resets where token_hash=$1 and used_at is null and expires_at > now()`, [sha256(token)]);
  if (!r) return { ok: false, error: "Link inválido ou expirado." };
  await query(`update users set password_hash=$2, updated_at=now() where id=$1`, [r.user_id, await hashPassword(newPassword)]);
  await query(`update password_resets set used_at=now() where id=$1`, [r.id]);
  await query(`delete from sessions where user_id=$1`, [r.user_id]); // encerra sessões existentes
  await audit(null, { userId: r.user_id, action: "auth.password_reset" });
  return { ok: true };
}

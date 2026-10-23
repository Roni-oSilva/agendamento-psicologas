import { createHmac, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { env } from "./env";

/** Token de gerenciamento = id.hmac(id:versão). Imprevisível, sem estado em claro no banco,
 *  revogável (incrementar manage_token_version) e com expiração verificada no servidor. */
export function signManageToken(appointmentId: string, version: number): string {
  const mac = createHmac("sha256", env.secret).update(`manage:${appointmentId}:${version}`).digest("base64url");
  return `${appointmentId}.${mac}`;
}

export function parseManageToken(token: string): { id: string; mac: string } | null {
  const [id, mac] = token.split(".");
  if (!id || !mac || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { id, mac };
}

export function verifyManageMac(id: string, version: number, mac: string): boolean {
  const expected = createHmac("sha256", env.secret).update(`manage:${id}:${version}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const randomToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function appointmentCode(): string {
  const b = randomBytes(8);
  return "AG-" + Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}

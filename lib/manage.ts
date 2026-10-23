import { one } from "./db";
import { parseManageToken, verifyManageMac } from "./tokens";

const LINK_GRACE_DAYS = 7;

export type ManageLookup =
  | { ok: true; appt: any; prof: any; svc: any; patient: any }
  | { ok: false; reason: "invalid" | "expired" };

/** Valida o token (HMAC + versão) e a expiração: link vale até 7 dias após o fim da consulta. */
export async function lookupByToken(token: string): Promise<ManageLookup> {
  const parsed = parseManageToken(token);
  if (!parsed) return { ok: false, reason: "invalid" };
  const appt = await one(`select * from appointments where id=$1`, [parsed.id]);
  if (!appt || !verifyManageMac(appt.id, appt.manage_token_version, parsed.mac)) return { ok: false, reason: "invalid" };
  if (appt.end_at.getTime() + LINK_GRACE_DAYS * 86400_000 < Date.now()) return { ok: false, reason: "expired" };
  const [prof, svc, patient] = await Promise.all([
    one(`select * from professionals where id=$1`, [appt.professional_id]),
    one(`select * from services where id=$1`, [appt.service_id]),
    one(`select id, name from patients where id=$1`, [appt.patient_id]),
  ]);
  return { ok: true, appt, prof, svc, patient };
}

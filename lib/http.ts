import { NextResponse } from "next/server";
import { env } from "./env";
import { hit } from "./ratelimit";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function ipOf(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

/** Proteção CSRF para APIs públicas que alteram estado: exige Origin do próprio site quando presente. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try { return new URL(origin).host === new URL(env.appUrl).host || new URL(origin).host === req.headers.get("host"); }
  catch { return false; }
}

export async function limited(req: Request, name: string, max: number, windowSec: number) {
  return !(await hit(`${name}:${ipOf(req)}`, max, windowSec));
}

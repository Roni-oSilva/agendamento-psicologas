import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { dayBounds, fmtDateShort, fmtTime } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/ui";
import { DateTime } from "luxon";

// Neutraliza injeção de fórmulas em planilhas (=, +, -, @) e escapa aspas
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Não autorizado", { status: 401 });
  const u = new URL(req.url);
  const from = u.searchParams.get("from") ?? "", to = u.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Período inválido", { status: 400 });
  const tz = s.professional.timezone;
  const lo = dayBounds(from, tz).start;
  const hi = dayBounds(DateTime.fromISO(to, { zone: tz }).toISODate()!, tz).end;
  const phones = u.searchParams.get("phones") === "1";
  const rows = (await query(
    `select a.code, a.start_at, a.end_at, a.status, a.modality, a.source, a.rescheduled_count, p.name, p.phone, sv.name as service
     from appointments a join patients p on p.id=a.patient_id join services sv on sv.id=a.service_id
     where a.professional_id=$1 and a.start_at >= $2 and a.start_at < $3 order by a.start_at`, [s.professional.id, lo, hi])).rows;
  const head = ["Código", "Data", "Início", "Fim", "Paciente", ...(phones ? ["Telefone"] : []), "Serviço", "Modalidade", "Status", "Origem", "Remarcações"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) lines.push([r.code, fmtDateShort(r.start_at, tz), fmtTime(r.start_at, tz), fmtTime(r.end_at, tz), r.name, ...(phones ? [r.phone] : []),
    r.service, r.modality, STATUS_LABEL[r.status], r.source, r.rescheduled_count].map(cell).join(","));
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "export.appointments_csv", meta: { from, to, rows: rows.length, phones } });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="agendamentos-${from}-${to}.csv"`, "Cache-Control": "no-store" },
  });
}

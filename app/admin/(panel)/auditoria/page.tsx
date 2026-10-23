import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateShort, fmtTime } from "@/lib/time";

export const metadata: Metadata = { title: "Auditoria — Painel", robots: { index: false } };

export default async function Page() {
  const { professional: p } = await requireSession();
  const rows = (await query(`select l.*, u.name as user_name from audit_logs l left join users u on u.id=l.user_id where l.professional_id=$1 order by l.created_at desc limit 200`, [p.id])).rows;
  return (
    <div>
      <h1 className="text-3xl">Auditoria</h1>
      <p className="hint mb-4">Registro das ações administrativas (sem dados de pacientes).</p>
      <div className="card overflow-x-auto !p-0"><table className="w-full text-left text-sm"><thead className="bg-sage-50"><tr><th className="p-3">Quando</th><th className="p-3">Quem</th><th className="p-3">Ação</th><th className="p-3">Recurso</th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.id} className="border-t border-sage-100"><td className="p-3 whitespace-nowrap">{fmtDateShort(r.created_at, p.timezone)} {fmtTime(r.created_at, p.timezone)}</td><td className="p-3">{r.user_name ?? "—"}</td><td className="p-3">{r.action}</td><td className="p-3 text-ink-soft">{r.resource_type ?? ""} {r.resource_id?.slice(0, 8) ?? ""}</td></tr>)}</tbody></table></div>
    </div>
  );
}

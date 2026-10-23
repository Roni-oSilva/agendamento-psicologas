import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/ui";
import { hit } from "@/lib/ratelimit";

export const metadata: Metadata = { title: "Conta — Painel", robots: { index: false } };

async function change(fd: FormData) {
  "use server";
  const s = await requireSession();
  if (!(await hit(`pwchange:${s.userId}`, 5, 900))) redirect("/admin/conta?err=" + encodeURIComponent("Muitas tentativas. Aguarde."));
  const u = await one(`select password_hash from users where id=$1`, [s.userId]);
  if (!(await verifyPassword(String(fd.get("current") ?? ""), u.password_hash))) redirect("/admin/conta?err=" + encodeURIComponent("Senha atual incorreta."));
  const next = String(fd.get("next") ?? "");
  const weak = validatePasswordStrength(next);
  if (weak) redirect("/admin/conta?err=" + encodeURIComponent(weak));
  await query(`update users set password_hash=$2, updated_at=now() where id=$1`, [s.userId, await hashPassword(next)]);
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "auth.password_change" });
  redirect("/admin/conta?ok=" + encodeURIComponent("Senha alterada."));
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Conta</h1>
      {sp.ok && <Flash>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      <p>{s.userName} · {s.email}</p>
      <form action={change} className="card max-w-md space-y-4"><h2 className="text-xl">Alterar senha</h2>
        <div><label className="label" htmlFor="c">Senha atual</label><input id="c" name="current" type="password" required autoComplete="current-password" className="field" /></div>
        <div><label className="label" htmlFor="n">Nova senha</label><input id="n" name="next" type="password" required minLength={10} autoComplete="new-password" className="field" /></div>
        <button className="btn-primary btn-sm">Alterar</button></form>
      <section className="card"><h2 className="text-xl">Exportar agendamentos (CSV)</h2>
        <form action="/admin/exportar" className="mt-3 flex flex-wrap items-end gap-3"><div><label className="label" htmlFor="f">De</label><input id="f" name="from" type="date" required className="field" /></div>
          <div><label className="label" htmlFor="t">Até</label><input id="t" name="to" type="date" required className="field" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="phones" value="1" className="h-5 w-5" /> Incluir telefones</label><button className="btn-secondary btn-sm">Baixar CSV</button></form>
        <p className="hint mt-2">Por padrão o relatório não inclui telefone. O download é registrado na auditoria.</p></section>
    </div>
  );
}

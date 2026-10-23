import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession, logout } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Início"], ["/admin/agenda", "Agenda"], ["/admin/agendamentos/novo", "Novo agendamento"], ["/admin/pacientes", "Pacientes"],
  ["/admin/servicos", "Serviços"], ["/admin/disponibilidade", "Disponibilidade"], ["/admin/bloqueios", "Bloqueios e férias"],
  ["/admin/portfolio", "Portfólio"], ["/admin/whatsapp", "WhatsApp"], ["/admin/notificacoes", "Notificações"],
  ["/admin/privacidade", "Privacidade"], ["/admin/auditoria", "Auditoria"], ["/admin/conta", "Conta"],
] as const;

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  async function out() { "use server"; await logout(); redirect("/admin/login"); }
  async function search(fd: FormData) { "use server"; redirect(`/admin/busca?q=${encodeURIComponent(String(fd.get("q") ?? ""))}`); }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-sage-100 bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block">
          <Link href="/admin" className="font-serif text-lg">{s.professional.display_name}</Link>
          <form action={out} className="lg:mt-1"><button className="text-sm text-ink-soft underline">Sair</button></form>
        </div>
        <details className="lg:open px-2 pb-2 lg:block" open>
          <summary className="cursor-pointer px-2 py-2 text-sm text-ink-soft lg:hidden">Menu</summary>
          <nav aria-label="Painel" className="flex flex-wrap gap-1 lg:flex-col">
            {NAV.map(([href, label]) => <Link key={href} href={href} className="rounded-xl px-3 py-2 text-sm hover:bg-sage-50">{label}</Link>)}
            <Link href={`/psicologa/${s.professional.slug}`} target="_blank" className="rounded-xl px-3 py-2 text-sm text-lav-700 hover:bg-lav-100">Ver página pública ↗</Link>
          </nav>
        </details>
      </aside>
      <div>
        <header className="border-b border-sage-100 bg-white/70 px-4 py-3">
          <form action={search} role="search" className="mx-auto flex max-w-5xl gap-2">
            <label className="sr-only" htmlFor="q">Busca global</label>
            <input id="q" name="q" className="field !py-2" placeholder="Buscar paciente, telefone, e-mail, código (AG-…) ou data (dd/mm/aaaa)" />
            <button className="btn-secondary btn-sm">Buscar</button>
          </form>
        </header>
        <main id="conteudo" className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}

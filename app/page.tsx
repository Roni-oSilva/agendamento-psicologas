import Link from "next/link";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pros = (await query(`select slug, display_name, headline from professionals where published order by display_name`)).rows;
  return (
    <main id="conteudo" className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl">Agende sua consulta de psicologia</h1>
      <p className="mt-3 text-lg text-ink-soft">Escolha a profissional, veja os horários disponíveis e agende em poucos minutos — sem precisar trocar mensagens.</p>
      <div className="mt-10 space-y-3">
        {pros.map((p) => (
          <Link key={p.slug} href={`/psicologa/${p.slug}`} className="card block transition hover:bg-sage-50">
            <span className="font-serif text-xl">{p.display_name}</span>
            {p.headline && <span className="mt-1 block text-ink-soft">{p.headline}</span>}
          </Link>
        ))}
        {pros.length === 0 && <p className="card">Nenhuma profissional publicada ainda.</p>}
      </div>
      <p className="mt-10 text-sm"><Link className="underline" href="/admin">Área da profissional</Link> · <Link className="underline" href="/privacidade">Privacidade</Link> · <Link className="underline" href="/termos">Termos</Link></p>
    </main>
  );
}

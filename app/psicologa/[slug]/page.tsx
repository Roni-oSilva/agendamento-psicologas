import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getProfessionalBySlug } from "@/lib/schedule";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProfessionalBySlug((await params).slug);
  if (!p) return { title: "Profissional não encontrada" };
  const title = `${p.display_name} — Psicóloga`;
  const description = p.headline ?? `Conheça o trabalho de ${p.display_name} e agende sua consulta online.`;
  return {
    title, description, alternates: { canonical: `${env.appUrl}/psicologa/${p.slug}` },
    openGraph: { title, description, type: "profile", url: `${env.appUrl}/psicologa/${p.slug}`, images: p.photo_url ? [p.photo_url] : undefined },
  };
}

const money = (c: number | null) => (c == null ? null : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const List = ({ items }: { items: string[] }) => <ul className="mt-2 list-disc space-y-1 pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>;

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProfessionalBySlug((await params).slug);
  if (!p) notFound();
  const services = (await query(`select * from services where professional_id=$1 and status='active' order by position, name`, [p.id])).rows;
  const book = `/psicologa/${p.slug}/agendar`;
  const faq: { q: string; a: string }[] = p.faq ?? [];
  const links: { label: string; url: string }[] = p.external_links ?? [];
  const wa = p.whatsapp_contact_enabled && p.whatsapp_contact_number ? `https://wa.me/${p.whatsapp_contact_number}` : null;
  const jsonLd = { "@context": "https://schema.org", "@type": "Psychologist", name: p.display_name, description: p.headline ?? undefined, url: `${env.appUrl}/psicologa/${p.slug}`, image: p.photo_url ?? undefined };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="sticky top-0 z-30 border-b border-sage-100 bg-sand-50/90 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3" aria-label="Principal">
          <Link href={`/psicologa/${p.slug}`} className="text-sm font-light uppercase tracking-[0.35em]">{p.display_name}</Link>
          <div className="hidden items-center gap-5 text-sm md:flex">
            <a href="#sobre">Sobre</a><a href="#especialidades">Especialidades</a><a href="#servicos">Serviços</a>
            <a href="#como-funciona">Como funciona</a>{faq.length > 0 && <a href="#faq">Perguntas</a>}
          </div>
          <Link href={book} className="btn-primary btn-sm">Agendar consulta</Link>
        </nav>
      </header>

      <main id="conteudo">
        <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-12 md:grid-cols-[1fr_320px] md:py-20" aria-labelledby="hero">
          <div>
            <p className="text-sm uppercase tracking-widest text-lav-700">Psicologia{p.show_crp && p.crp ? ` · CRP ${p.crp}` : ""}</p>
            <h1 id="hero" className="mt-3 text-6xl leading-none md:text-8xl">{p.display_name}</h1>
            {p.headline && <p className="mt-4 text-lg text-ink-soft">{p.headline}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={book} className="btn-primary">Agendar consulta</Link>
              <a href="#servicos" className="btn-secondary">Ver horários e serviços</a>
              {wa && <a href={wa} rel="noopener" className="btn-secondary">Falar no WhatsApp</a>}
            </div>
          </div>
          {p.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo_url} alt={`Foto profissional de ${p.display_name}`} className="aspect-[4/5] max-h-96 w-full rounded-[2rem] bg-sage-100 object-cover md:max-h-none" />
          ) : (
            <div className="flex aspect-[4/5] max-h-72 w-full items-center md:max-h-none justify-center rounded-[2rem] bg-gradient-to-br from-sage-800 to-sage-600 font-[family-name:var(--font-display)] text-7xl text-lav-500" aria-hidden>
              {p.display_name.split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
            </div>
          )}
        </section>

        <section id="sobre" className="bg-white py-14">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 md:grid-cols-2">
            <div>
              <h2 className="text-3xl">Sobre</h2>
              {p.bio && <p className="mt-4 whitespace-pre-line leading-relaxed">{p.bio}</p>}
              {p.approach && <><h3 className="mt-6 text-xl">Abordagem terapêutica</h3><p className="mt-2">{p.approach}</p></>}
            </div>
            <div className="space-y-6">
              {p.education?.length > 0 && <div><h3 className="text-xl">Formação</h3><List items={p.education} /></div>}
              {p.experience?.length > 0 && <div><h3 className="text-xl">Experiência</h3><List items={p.experience} /></div>}
              {p.languages?.length > 0 && <div><h3 className="text-xl">Idiomas de atendimento</h3><p className="mt-2">{p.languages.join(", ")}</p></div>}
            </div>
          </div>
        </section>

        {p.specialties?.length > 0 && (
          <section id="especialidades" className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-3xl">Áreas de atuação</h2>
            <ul className="mt-6 flex flex-wrap gap-3">
              {p.specialties.map((s: string) => <li key={s} className="rounded-full bg-lav-100 px-4 py-2 text-lav-700">{s}</li>)}
            </ul>
          </section>
        )}

        <section id="servicos" className="bg-sage-50 py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-3xl">Serviços</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {services.map((s) => (
                <article key={s.id} className="card">
                  <h3 className="text-xl">{s.name}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{s.modality === "online" ? "Online" : "Presencial"} · {s.duration_minutes} min{money(s.price_cents) ? ` · ${money(s.price_cents)}` : ""}</p>
                  {s.description && <p className="mt-3">{s.description}</p>}
                </article>
              ))}
              {services.length === 0 && <p>Em breve.</p>}
            </div>
            {services.length > 0 && <Link href={book} className="btn-primary mt-8">Escolher um horário</Link>}
          </div>
        </section>

        <section id="como-funciona" className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-3xl">Como funciona</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {["Escolha o serviço e veja os horários realmente disponíveis.", "Informe seus dados e confirme. Sem criar conta.", "Receba a confirmação e um lembrete antes da consulta. Remarque pelo link seguro, se precisar."].map((t, i) => (
              <li key={i} className="card"><span className="font-[family-name:var(--font-display)] text-4xl text-lav-500">{i + 1}</span><p className="mt-2">{t}</p></li>
            ))}
          </ol>
          {p.how_it_works && <p className="mt-6 whitespace-pre-line">{p.how_it_works}</p>}
          {p.online_instructions && <div className="mt-6 rounded-2xl bg-lav-100 p-4"><h3 className="text-lg">Atendimento online</h3><p className="mt-1 whitespace-pre-line">{p.online_instructions}</p></div>}
          {p.address && <div className="mt-4 rounded-2xl bg-sand-100 p-4"><h3 className="text-lg">Atendimento presencial</h3><p className="mt-1 whitespace-pre-line">{p.address}</p></div>}
          <p className="mt-4 text-sm text-ink-soft">Cancelamento e remarcação pelo link seguro: até {p.cancel_deadline_hours}h antes da consulta.</p>
        </section>

        {faq.length > 0 && (
          <section id="faq" className="bg-white py-14">
            <div className="mx-auto max-w-3xl px-4">
              <h2 className="text-3xl">Perguntas frequentes</h2>
              <div className="mt-6 divide-y divide-sage-100">
                {faq.map((f, i) => (
                  <details key={i} className="group py-4"><summary className="cursor-pointer list-none text-lg font-medium">{f.q}</summary><p className="mt-2 whitespace-pre-line text-ink-soft">{f.a}</p></details>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-3xl">Pronto para começar?</h2>
          <p className="mt-2 text-ink-soft">Veja os horários disponíveis e agende em poucos minutos.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={book} className="btn-primary">Agendar consulta</Link>
            {wa && <a href={wa} rel="noopener" className="btn-secondary">WhatsApp</a>}
          </div>
        </section>
      </main>

      <footer className="border-t border-sage-100 bg-sand-100 py-10 text-sm">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4">
          <p className="font-medium">{p.display_name}{p.show_crp && p.crp ? ` · CRP ${p.crp}` : ""}</p>
          {p.contact_email && <p>Contato: <a className="underline" href={`mailto:${p.contact_email}`}>{p.contact_email}</a></p>}
          {links.length > 0 && <p className="flex flex-wrap gap-4">{links.map((l) => <a key={l.url} className="underline" href={l.url} rel="noopener noreferrer">{l.label}</a>)}</p>}
          <p className="flex gap-4"><Link className="underline" href="/privacidade">Política de privacidade</Link><Link className="underline" href="/termos">Termos de uso</Link></p>
          <p className="text-ink-soft">Acessibilidade: este site é navegável por teclado e compatível com leitores de tela. Encontrou uma barreira? Fale com a profissional pelo contato acima.</p>
          <p className="text-ink-soft">Este serviço não substitui atendimento de emergência. Em crise, ligue 188 (CVV) ou 192 (SAMU).</p>
        </div>
      </footer>
    </>
  );
}

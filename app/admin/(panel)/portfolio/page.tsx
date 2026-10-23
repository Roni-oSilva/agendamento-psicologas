import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/ui";

export const metadata: Metadata = { title: "Portfólio — Painel", robots: { index: false } };

const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 30);
const httpsUrl = (u: string) => { try { return new URL(u).protocol === "https:" ? u : null; } catch { return null; } };

async function save(fd: FormData) {
  "use server";
  const s = await requireSession();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) redirect("/admin/portfolio?err=" + encodeURIComponent("Endereço inválido: use letras minúsculas, números e hífens."));
  const photo = String(fd.get("photo_url") ?? "").trim();
  if (photo && !httpsUrl(photo)) redirect("/admin/portfolio?err=" + encodeURIComponent("A URL da foto deve começar com https://"));
  const faq = lines(fd.get("faq")).map((l) => { const [q, ...a] = l.split("::"); return { q: q.trim(), a: a.join("::").trim() }; }).filter((f) => f.q && f.a);
  const links = lines(fd.get("links")).map((l) => { const [label, ...u] = l.split("::"); return { label: label.trim(), url: httpsUrl(u.join("::").trim()) }; }).filter((x) => x.label && x.url);
  const wa = String(fd.get("wa") ?? "").replace(/\D/g, "");
  const publish = fd.get("published") === "on";
  if (publish) {
    const n = await query(`select count(*)::int n from services where professional_id=$1 and status='active'`, [s.professional.id]);
    if (n.rows[0].n === 0) redirect("/admin/portfolio?err=" + encodeURIComponent("Cadastre ao menos um serviço ativo antes de publicar."));
  }
  try {
    await query(
      `update professionals set slug=$2, display_name=$3, crp=$4, show_crp=$5, headline=$6, bio=$7, photo_url=$8, approach=$9, education=$10, experience=$11, languages=$12,
         specialties=$13, faq=$14, how_it_works=$15, online_instructions=$16, address=$17, contact_email=$18, external_links=$19,
         whatsapp_contact_enabled=$20, whatsapp_contact_number=$21, published=$22, updated_at=now() where id=$1`,
      [s.professional.id, slug, String(fd.get("display_name")).trim().slice(0, 120), String(fd.get("crp") ?? "").trim() || null, fd.get("show_crp") === "on",
       String(fd.get("headline") ?? "").slice(0, 200) || null, String(fd.get("bio") ?? "").slice(0, 4000) || null, photo || null, String(fd.get("approach") ?? "").slice(0, 1000) || null,
       lines(fd.get("education")), lines(fd.get("experience")), lines(fd.get("languages")), lines(fd.get("specialties")), JSON.stringify(faq),
       String(fd.get("how_it_works") ?? "").slice(0, 2000) || null, String(fd.get("online_instructions") ?? "").slice(0, 1000) || null, String(fd.get("address") ?? "").slice(0, 500) || null,
       String(fd.get("contact_email") ?? "").trim() || null, JSON.stringify(links), fd.get("wa_enabled") === "on" && !!wa, wa || null, publish]);
  } catch (e: any) { if (e.code === "23505") redirect("/admin/portfolio?err=" + encodeURIComponent("Este endereço já está em uso.")); throw e; }
  await audit(null, { userId: s.userId, professionalId: s.professional.id, action: "portfolio.update" });
  redirect("/admin/portfolio?ok=" + encodeURIComponent("Portfólio salvo."));
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { professional: p } = await requireSession();
  const sp = await searchParams;
  const L = (a: string[]) => (a ?? []).join("\n");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Portfólio público</h1>
      {sp.ok && <Flash>{sp.ok}</Flash>}{sp.err && <Flash kind="err">{sp.err}</Flash>}
      <form action={save} className="card grid gap-4 md:grid-cols-2">
        <div><label className="label" htmlFor="slug">Endereço da página</label><input id="slug" name="slug" defaultValue={p.slug} required className="field" /><p className="hint">/psicologa/<strong>{p.slug}</strong></p></div>
        <div><label className="label" htmlFor="dn">Nome profissional</label><input id="dn" name="display_name" defaultValue={p.display_name} required className="field" /></div>
        <div><label className="label" htmlFor="crp">CRP</label><input id="crp" name="crp" defaultValue={p.crp ?? ""} className="field" /><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="show_crp" defaultChecked={p.show_crp} className="h-5 w-5" /> Exibir CRP na página (confirme que está correto e ativo)</label></div>
        <div><label className="label" htmlFor="ph">Foto (URL https)</label><input id="ph" name="photo_url" defaultValue={p.photo_url ?? ""} className="field" /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="hl">Frase de apresentação</label><input id="hl" name="headline" defaultValue={p.headline ?? ""} maxLength={200} className="field" /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="bio">Apresentação</label><textarea id="bio" name="bio" rows={5} defaultValue={p.bio ?? ""} className="field" /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="ap">Abordagem terapêutica</label><textarea id="ap" name="approach" rows={2} defaultValue={p.approach ?? ""} className="field" /></div>
        <div><label className="label" htmlFor="sp">Áreas de atuação (uma por linha)</label><textarea id="sp" name="specialties" rows={5} defaultValue={L(p.specialties)} className="field" /><p className="hint">Respeite o Código de Ética e a Resolução CFP sobre publicidade: sem promessas de resultado, sem depoimentos de pacientes.</p></div>
        <div><label className="label" htmlFor="ed">Formação (uma por linha)</label><textarea id="ed" name="education" rows={5} defaultValue={L(p.education)} className="field" /></div>
        <div><label className="label" htmlFor="ex">Experiência (uma por linha)</label><textarea id="ex" name="experience" rows={4} defaultValue={L(p.experience)} className="field" /></div>
        <div><label className="label" htmlFor="lg">Idiomas (um por linha)</label><textarea id="lg" name="languages" rows={4} defaultValue={L(p.languages)} className="field" /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="hw">Como funciona o atendimento</label><textarea id="hw" name="how_it_works" rows={3} defaultValue={p.how_it_works ?? ""} className="field" /></div>
        <div><label className="label" htmlFor="oi">Orientações para atendimento online</label><textarea id="oi" name="online_instructions" rows={3} defaultValue={p.online_instructions ?? ""} className="field" /></div>
        <div><label className="label" htmlFor="ad">Endereço (presencial)</label><textarea id="ad" name="address" rows={3} defaultValue={p.address ?? ""} className="field" /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="fq">Perguntas frequentes (uma por linha: <code>Pergunta :: Resposta</code>)</label><textarea id="fq" name="faq" rows={6} defaultValue={(p.faq ?? []).map((f: any) => `${f.q} :: ${f.a}`).join("\n")} className="field" /></div>
        <div><label className="label" htmlFor="ce">E-mail de contato (rodapé / LGPD)</label><input id="ce" name="contact_email" type="email" defaultValue={p.contact_email ?? ""} className="field" /></div>
        <div><label className="label" htmlFor="wa">WhatsApp para contato (com DDI+DDD)</label><input id="wa" name="wa" defaultValue={p.whatsapp_contact_number ?? ""} placeholder="5511912345678" className="field" /><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="wa_enabled" defaultChecked={p.whatsapp_contact_enabled} className="h-5 w-5" /> Mostrar botão de WhatsApp na página</label></div>
        <div className="md:col-span-2"><label className="label" htmlFor="ln">Links profissionais (<code>Rótulo :: https://…</code>)</label><textarea id="ln" name="links" rows={3} defaultValue={(p.external_links ?? []).map((l: any) => `${l.label} :: ${l.url}`).join("\n")} className="field" /></div>
        <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="published" defaultChecked={p.published} className="h-5 w-5" /> <strong>Página publicada</strong> (visível e com agendamento aberto)</label>
        <div className="md:col-span-2"><button className="btn-primary">Salvar portfólio</button></div>
      </form>
    </div>
  );
}

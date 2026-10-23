"use client";
import { useMemo, useRef, useState } from "react";
import { SlotPicker, type SlotOption } from "@/components/SlotPicker";

interface Svc { id: string; name: string; description: string | null; instructions: string | null; duration_minutes: number; price_cents: number | null; modality: string }
interface Props { slug: string; professionalName: string; timezone: string; services: Svc[]; requireEmail: boolean; whatsappContact: string | null; cancelHours: number }

const money = (c: number | null) => (c == null ? null : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const STEPS = ["Serviço", "Data e horário", "Seus dados", "Revisar"];

export function BookingWizard(p: Props) {
  const [step, setStep] = useState(0);
  const [svc, setSvc] = useState<Svc | null>(p.services.length === 1 ? p.services[0] : null);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [consentData, setConsentData] = useState(false);
  const [consentWa, setConsentWa] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ message: string; alternatives: { date: string; start: string; label: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; manageUrl: string; date: string; time: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const idemKey = useRef(crypto.randomUUID()); // mesma chave em reenvios/duplo clique
  const submitting = useRef(false);

  const when = useMemo(() => slot ? new Date(slot.start).toLocaleDateString("pt-BR", { timeZone: p.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "", [slot, p.timezone]);

  function validateDetails() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = "Informe seu nome completo.";
    if (form.phone.replace(/\D/g, "").length < 10) e.phone = "Informe o telefone com DDD.";
    if ((p.requireEmail || form.email) && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Informe um e-mail válido.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (submitting.current || !svc || !slot) return;
    if (!consentData) { setErrors({ consent: "É necessário concordar para continuar." }); return; }
    submitting.current = true; setBusy(true); setError(null); setConflict(null);
    try {
      const r = await fetch(`/api/public/${p.slug}/appointments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: svc.id, start: slot.start, name: form.name, phone: form.phone, email: form.email, note: form.note,
          consentData: true, consentWhatsapp: consentWa, idempotencyKey: idemKey.current }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 201) { setDone(j); return; }   // sucesso SOMENTE após o servidor confirmar a gravação
      if (r.status === 409) {
        setConflict({ message: j.message, alternatives: j.alternatives ?? [] });
        setSlot(null); setRefresh((n) => n + 1); setStep(1);
        idemKey.current = crypto.randomUUID();
      } else if (r.status === 422 && j.fields) {
        setErrors(Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, (v as string[])[0]]))); setStep(2);
      } else if (r.status === 429) setError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      else setError(j.message ?? "Não foi possível concluir o agendamento. Tente novamente.");
    } catch { setError("Sem conexão. Seu horário ainda não foi reservado — tente novamente."); }
    finally { submitting.current = false; setBusy(false); }
  }

  if (done) {
    return (
      <div className="card fade-in text-center" role="status">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 text-2xl text-sage-700" aria-hidden>✓</div>
        <h2 className="text-2xl">Consulta agendada</h2>
        <p className="mt-2 text-ink-soft">{svc?.name} com {p.professionalName}</p>
        <p className="mt-4 text-lg font-medium capitalize">{done.date}</p>
        <p className="text-3xl font-semibold text-sage-700">{done.time}</p>
        <p className="mt-4 text-sm text-ink-soft">Código do agendamento: <strong>{done.code}</strong></p>
        <p className="mt-4 text-sm text-ink-soft">Você receberá a confirmação e um lembrete 24 horas antes, no contato informado, caso o envio automático esteja ativo para esta profissional.</p>
        <a href={done.manageUrl} className="btn-primary mt-6 w-full">Ver, remarcar ou cancelar</a>
        <p className="hint mt-2">Guarde este link: ele é pessoal e dá acesso ao seu agendamento.</p>
      </div>
    );
  }

  return (
    <div>
      <ol className="mb-5 flex gap-2" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-sage-600" : "bg-sage-200"}`} aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{s}</span>
          </li>
        ))}
      </ol>
      <h2 className="mb-4 text-2xl">{STEPS[step]}</h2>

      {conflict && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4" role="alert">
          <p className="font-medium">{conflict.message}</p>
          <p className="text-sm text-ink-soft">Escolha outro horário. Algumas opções próximas:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {conflict.alternatives.map((a) => (
              <button key={a.start} type="button" className="btn-secondary btn-sm"
                onClick={() => { setSlot({ start: a.start, label: a.label }); setConflict(null); setStep(2); }}>
                {new Date(a.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        {step === 0 && (
          <fieldset>
            <legend className="sr-only">Escolha o serviço</legend>
            <div className="space-y-3">
              {p.services.map((s) => (
                <label key={s.id} className={`block cursor-pointer rounded-2xl border p-4 transition ${svc?.id === s.id ? "border-sage-700 bg-sage-50" : "border-sage-200 hover:bg-sage-50"}`}>
                  <input type="radio" name="service" className="sr-only" checked={svc?.id === s.id} onChange={() => { setSvc(s); setSlot(null); }} />
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-medium">{s.name}</span>
                    {money(s.price_cents) && <span className="text-sage-800">{money(s.price_cents)}</span>}
                  </span>
                  <span className="mt-1 block text-sm text-ink-soft">{s.modality === "online" ? "Online" : "Presencial"} · {s.duration_minutes} min</span>
                  {s.description && <span className="mt-1 block text-sm">{s.description}</span>}
                  {svc?.id === s.id && s.instructions && <span className="mt-2 block rounded-xl bg-lav-100 p-3 text-sm">{s.instructions}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && svc && (
          <SlotPicker baseUrl={`/api/public/${p.slug}/availability?serviceId=${svc.id}`} timezone={p.timezone} value={slot} onChange={setSlot} refreshKey={refresh} />
        )}

        {step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); if (validateDetails()) setStep(3); }} noValidate className="space-y-4">
            <div>
              <label className="label" htmlFor="name">Nome completo</label>
              <input id="name" className="field" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-err" : undefined} />
              {errors.name && <p id="name-err" className="err">{errors.name}</p>}
            </div>
            <div>
              <label className="label" htmlFor="phone">Telefone com WhatsApp</label>
              <input id="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-invalid={!!errors.phone} />
              {errors.phone && <p className="err">{errors.phone}</p>}
            </div>
            <div>
              <label className="label" htmlFor="email">E-mail {p.requireEmail ? "" : "(opcional)"}</label>
              <input id="email" className="field" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!errors.email} />
              {errors.email && <p className="err">{errors.email}</p>}
            </div>
            <div>
              <label className="label" htmlFor="note">Observação administrativa (opcional)</label>
              <textarea id="note" className="field" rows={2} maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <p className="hint">Use apenas para informações práticas (ex.: preferência de horário). Não escreva detalhes clínicos ou sensíveis.</p>
            </div>
            <button className="btn-primary w-full" type="submit">Continuar</button>
          </form>
        )}

        {step === 3 && svc && slot && (
          <div className="space-y-5">
            <dl className="divide-y divide-sage-100 text-base">
              {[["Profissional", p.professionalName], ["Serviço", svc.name], ["Data", when], ["Horário", `${slot.label} (${p.timezone.replace("_", " ")})`],
                ["Duração", `${svc.duration_minutes} minutos`], ["Modalidade", svc.modality === "online" ? "Online" : "Presencial"],
                ["Paciente", form.name]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-ink-soft">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
            <p className="rounded-2xl bg-sand-100 p-3 text-sm">Cancelamentos e remarcações pelo link seguro são permitidos até <strong>{p.cancelHours}h</strong> antes da consulta.</p>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[#44603f]" checked={consentData} onChange={(e) => setConsentData(e.target.checked)} />
              <span>Li e concordo com a <a className="underline" href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a> e os <a className="underline" href="/termos" target="_blank" rel="noopener">Termos de Uso</a>, e autorizo o tratamento dos meus dados para fins de agendamento.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[#44603f]" checked={consentWa} onChange={(e) => setConsentWa(e.target.checked)} />
              <span>Aceito receber confirmação e lembretes da consulta por WhatsApp (sem conteúdo clínico).</span>
            </label>
            {errors.consent && <p className="err" role="alert">{errors.consent}</p>}
            {error && <p className="err" role="alert">{error}</p>}
            <button className="btn-primary w-full" type="button" disabled={busy} onClick={submit}>{busy ? "Confirmando…" : "Confirmar agendamento"}</button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" className="btn-secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}>Voltar</button>
        {step < 2 && (
          <button type="button" className="btn-primary" disabled={(step === 0 && !svc) || (step === 1 && !slot)}
            onClick={() => setStep(step + 1)}>Continuar</button>
        )}
      </div>
      {p.whatsappContact && <p className="mt-6 text-center text-sm text-ink-soft">Dúvidas? <a className="underline" href={`https://wa.me/${p.whatsappContact}`} rel="noopener">Fale pelo WhatsApp</a></p>}
    </div>
  );
}

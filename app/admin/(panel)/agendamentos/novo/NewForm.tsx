"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlotPicker, type SlotOption } from "@/components/SlotPicker";

type Result = { ok: true; id: string } | { ok: false; message: string };
export function NewForm({ services, timezone, initialStart, prefill, action }: {
  services: { id: string; name: string; duration_minutes: number }[]; timezone: string; initialStart: string | null;
  prefill: { name: string; phone: string; email: string | null } | null;
  action: (i: { serviceId: string; start: string; name: string; phone: string; email: string; note: string }) => Promise<Result>;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [slot, setSlot] = useState<SlotOption | null>(initialStart ? { start: initialStart, label: new Date(initialStart).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }) } : null);
  const [f, setF] = useState({ name: prefill?.name ?? "", phone: prefill?.phone ?? "", email: prefill?.email ?? "", note: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pending, start] = useTransition();

  if (!services.length) return <p className="card">Cadastre ao menos um serviço ativo antes de criar agendamentos.</p>;
  return (
    <form className="space-y-5" onSubmit={(e) => {
      e.preventDefault();
      if (!slot) { setMsg("Escolha um horário."); return; }
      start(async () => {
        const r = await action({ serviceId, start: slot.start, ...f });
        if (r.ok) router.push(`/admin/agendamentos/${r.id}?ok=${encodeURIComponent("Agendamento criado.")}`);
        else { setMsg(r.message); setSlot(null); setRefresh((n) => n + 1); }
      });
    }}>
      <div className="card space-y-4">
        <div><label className="label" htmlFor="svc">Serviço</label>
          <select id="svc" className="field" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlot(null); }}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min)</option>)}
          </select></div>
        {initialStart && slot && <p className="rounded-xl bg-sage-100 p-3 text-sm">Horário pré-selecionado: {new Date(slot.start).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "full", timeStyle: "short" })}</p>}
        <SlotPicker baseUrl={`/api/admin/slots?serviceId=${serviceId}`} timezone={timezone} value={slot} onChange={setSlot} refreshKey={refresh} />
      </div>
      <div className="card space-y-4">
        <div><label className="label" htmlFor="n">Nome do paciente</label><input id="n" className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="p">Telefone (WhatsApp)</label><input id="p" className="field" required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label className="label" htmlFor="e">E-mail (opcional)</label><input id="e" type="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label className="label" htmlFor="o">Observação administrativa</label><input id="o" className="field" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      {msg && <p className="err" role="alert">{msg}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>{pending ? "Criando…" : "Criar agendamento"}</button>
    </form>
  );
}

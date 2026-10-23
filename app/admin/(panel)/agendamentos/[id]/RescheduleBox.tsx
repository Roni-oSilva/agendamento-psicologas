"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlotPicker, type SlotOption } from "@/components/SlotPicker";

export function RescheduleBox({ serviceId, appointmentId, timezone, action }: {
  serviceId: string; appointmentId: string; timezone: string; action: (start: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>Reagendar</button>;
  return (
    <div className="rounded-2xl border border-sage-200 p-4">
      <h3 className="mb-3 text-lg">Novo horário</h3>
      <SlotPicker baseUrl={`/api/admin/slots?serviceId=${serviceId}&excludeId=${appointmentId}`} timezone={timezone} value={slot} onChange={setSlot} refreshKey={refresh} />
      {msg && <p className="err" role="alert">{msg}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary btn-sm" disabled={!slot || pending} onClick={() => start(async () => {
          const r = await action(slot!.start);
          if (r.ok) { router.push(`/admin/agendamentos/${appointmentId}?ok=${encodeURIComponent("Consulta reagendada. O paciente será notificado.")}`); router.refresh(); setOpen(false); }
          else { setMsg(r.message ?? "Não foi possível reagendar."); setSlot(null); setRefresh((n) => n + 1); }
        })}>{pending ? "Salvando…" : "Confirmar reagendamento"}</button>
        <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Fechar</button>
      </div>
    </div>
  );
}

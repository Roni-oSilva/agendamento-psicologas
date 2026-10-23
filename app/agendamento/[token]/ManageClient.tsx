"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlotPicker, type SlotOption } from "@/components/SlotPicker";

export function ManageClient({ token, timezone }: { token: string; timezone: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const lock = useRef(false);

  async function post(path: string, body: unknown) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/manage/${token}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setMsg({ kind: "ok", text: path === "cancel" ? "Consulta cancelada." : "Consulta remarcada com sucesso." }); setMode("idle"); router.refresh(); }
      else if (r.status === 409) { setMsg({ kind: "err", text: "Este horário acabou de ficar indisponível. Escolha outro." }); setSlot(null); setRefresh((n) => n + 1); }
      else setMsg({ kind: "err", text: j.message ?? "Não foi possível concluir. Tente novamente." });
    } catch { setMsg({ kind: "err", text: "Sem conexão. Nada foi alterado — tente novamente." }); }
    finally { lock.current = false; setBusy(false); }
  }

  return (
    <div className="mt-4 space-y-4">
      {msg && <p role="status" className={`rounded-2xl p-3 text-sm ${msg.kind === "ok" ? "bg-sage-100 text-sage-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
      {mode === "idle" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button className="btn-primary" onClick={() => setMode("reschedule")}>Remarcar</button>
          <button className="btn-danger" onClick={() => setMode("cancel")}>Cancelar consulta</button>
        </div>
      )}
      {mode === "reschedule" && (
        <div className="card fade-in">
          <h2 className="mb-3 text-xl">Escolha o novo horário</h2>
          <SlotPicker baseUrl={`/api/manage/${token}/slots`} timezone={timezone} value={slot} onChange={setSlot} refreshKey={refresh} />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="btn-primary" disabled={!slot || busy} onClick={() => post("reschedule", { start: slot!.start })}>{busy ? "Remarcando…" : "Confirmar remarcação"}</button>
            <button className="btn-secondary" onClick={() => { setMode("idle"); setSlot(null); }}>Voltar</button>
          </div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="card fade-in">
          <h2 className="text-xl">Cancelar esta consulta?</h2>
          <p className="hint">O horário será liberado. Esta ação não pode ser desfeita, mas você poderá agendar novamente.</p>
          <label className="label mt-4" htmlFor="reason">Motivo (opcional)</label>
          <input id="reason" className="field" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button className="btn-danger" disabled={busy} onClick={() => post("cancel", { reason })}>{busy ? "Cancelando…" : "Sim, cancelar"}</button>
            <button className="btn-secondary" onClick={() => setMode("idle")}>Manter consulta</button>
          </div>
        </div>
      )}
    </div>
  );
}

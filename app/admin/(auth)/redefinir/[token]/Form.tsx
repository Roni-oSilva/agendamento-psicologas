"use client";
import { useActionState } from "react";

export function ResetForm({ action }: { action: (s: unknown, fd: FormData) => Promise<{ error?: string } | undefined> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card space-y-4">
      <div><label className="label" htmlFor="password">Nova senha</label><input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="field" /><p className="hint">Mínimo de 10 caracteres, com letras e números.</p></div>
      <div><label className="label" htmlFor="confirm">Confirmar senha</label><input id="confirm" name="confirm" type="password" required autoComplete="new-password" className="field" /></div>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>Salvar senha</button>
    </form>
  );
}

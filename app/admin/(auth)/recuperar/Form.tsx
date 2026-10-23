"use client";
import { useActionState } from "react";

export function ResetRequestForm({ action }: { action: (s: unknown, fd: FormData) => Promise<{ done: boolean }> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if ((state as any)?.done) return <p className="card" role="status">Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha. O link vale por 1 hora.</p>;
  return (
    <form action={formAction} className="card space-y-4">
      <div><label className="label" htmlFor="email">E-mail da conta</label><input id="email" name="email" type="email" required className="field" /></div>
      <button className="btn-primary w-full" disabled={pending}>Enviar link</button>
    </form>
  );
}

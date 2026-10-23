"use client";
import { useActionState } from "react";

export function LoginForm({ action }: { action: (s: unknown, fd: FormData) => Promise<{ error?: string; email?: string } | undefined> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card space-y-4">
      <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="username" defaultValue={state?.email} className="field" /></div>
      <div><label className="label" htmlFor="password">Senha</label><input id="password" name="password" type="password" required autoComplete="current-password" className="field" /></div>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

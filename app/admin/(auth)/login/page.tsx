import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { login, getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar — Painel", robots: { index: false } };
export const dynamic = "force-dynamic";

async function action(_: unknown, fd: FormData) {
  "use server";
  const r = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error, email: String(fd.get("email") ?? "") };
  redirect("/admin");
}

import { LoginForm } from "./LoginForm";
export default async function Page() {
  if (await getSession()) redirect("/admin");
  return (
    <main id="conteudo" className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-6 text-3xl">Entrar no painel</h1>
      <LoginForm action={action} />
      <p className="mt-4 text-center text-sm"><Link className="underline" href="/admin/recuperar">Esqueci minha senha</Link></p>
    </main>
  );
}

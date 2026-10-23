import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { resetPassword } from "@/lib/auth";
import { ResetForm } from "./Form";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  async function action(_: unknown, fd: FormData) {
    "use server";
    const pw = String(fd.get("password") ?? "");
    if (pw !== String(fd.get("confirm") ?? "")) return { error: "As senhas não conferem." };
    const r = await resetPassword(token, pw);
    if (!r.ok) return { error: r.error };
    redirect("/admin/login");
  }
  return (
    <main id="conteudo" className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-6 text-3xl">Definir nova senha</h1>
      <ResetForm action={action} />
    </main>
  );
}

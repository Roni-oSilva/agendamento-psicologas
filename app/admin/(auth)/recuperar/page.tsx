import type { Metadata } from "next";
import { requestPasswordReset } from "@/lib/auth";
import { env } from "@/lib/env";
import { emailConfigured, sendEmail } from "@/lib/providers/email";

export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false } };

async function action(_: unknown, fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "");
  const link = await requestPasswordReset(email);
  if (link) {
    if (emailConfigured()) {
      await sendEmail({ to: email, subject: "Redefinição de senha", text: `Para redefinir sua senha, acesse (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.` }).catch((e) => console.error("[reset] falha ao enviar e-mail:", e.message));
    } else if (!env.isProd) {
      console.log(`[dev] link de redefinição (e-mail não configurado): ${link}`);
    } else {
      console.error("[reset] RESEND_API_KEY ausente: não foi possível enviar o link de redefinição");
    }
  }
  // mesma resposta existindo ou não a conta (evita enumeração)
  return { done: true };
}

import { ResetRequestForm } from "./Form";
export default function Page() {
  return (
    <main id="conteudo" className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-6 text-3xl">Recuperar senha</h1>
      <ResetRequestForm action={action} />
    </main>
  );
}

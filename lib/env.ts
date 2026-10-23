function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get appUrl() { return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""); },
  get secret() {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET deve ter ao menos 32 caracteres");
    return s;
  },
  get isProd() { return process.env.NODE_ENV === "production"; },
  get whatsappMode(): "disabled" | "test" | "cloud" {
    const m = process.env.WHATSAPP_MODE ?? "disabled";
    return m === "test" || m === "cloud" ? m : "disabled";
  },
};

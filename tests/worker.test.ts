import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { query, pool } from "@/lib/db";
import { createAppointment, cancelAppointment, rescheduleAppointment } from "@/lib/booking";
import { processDueJobs } from "@/worker/process";
import { resetDb, setup, nextMonday, baseInput } from "./helpers";
import { verifyMetaSignature } from "@/lib/providers/whatsapp";
import { createHmac } from "node:crypto";

let r: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => { await resetDb(); r = await setup(); process.env.WHATSAPP_MODE = "test"; });
afterEach(() => { vi.restoreAllMocks(); process.env.WHATSAPP_MODE = "test"; });
afterAll(async () => { await pool().end(); });

const jobs = async () => (await query(`select type, status, attempts, last_error, provider_message_id from notification_jobs order by created_at, type`)).rows;
const future = new Date(nextMonday("09:00").getTime() - 60_000); // logo antes da 1ª consulta: lembretes de 24h já vencidos

describe("worker de notificações", () => {
  it("modo disabled: não envia nada e mantém jobs pendentes (sem simular envio)", async () => {
    process.env.WHATSAPP_MODE = "disabled";
    await createAppointment(baseInput(r, nextMonday("10:00")));
    const s = await processDueJobs(20, future);
    expect(s.claimed).toBe(0);
    expect((await jobs()).every((j: any) => j.status === "pending")).toBe(true);
  });

  it("modo test: marca como test_sent (jamais como sent) e só processa o que já venceu", async () => {
    await createAppointment(baseInput(r, nextMonday("10:00")));
    const s = await processDueJobs(20, new Date());
    expect(s.testSent).toBe(1); // somente a confirmação (lembrete é futuro)
    const j = await jobs();
    expect(j.find((x: any) => x.type === "confirmation").status).toBe("test_sent");
    expect(j.find((x: any) => x.type === "reminder_24h").status).toBe("pending");
    expect(j.some((x: any) => x.status === "sent")).toBe(false);
  });

  it("dois workers simultâneos nunca processam o mesmo job duas vezes", async () => {
    for (let i = 0; i < 6; i++)
      await createAppointment(baseInput(r, nextMonday(["09:00","10:00","11:00","14:00","15:00","16:00"][i]), { patient: { name: `P${i}`, phone: `55119999${i}0000` } }));
    const res = await Promise.all([processDueJobs(20, future), processDueJobs(20, future), processDueJobs(20, future)]);
    const total = res.reduce((n, x) => n + x.claimed, 0);
    expect(total).toBe(12); // 6 confirmações + 6 lembretes, cada um exatamente uma vez
    expect((await jobs()).every((j: any) => j.attempts === 1 && j.status === "test_sent")).toBe(true);
  });

  it("falha temporária: reagenda com backoff e depois envia; falha não afeta o agendamento", async () => {
    process.env.WHATSAPP_MODE = "cloud";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123"; process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    process.env.WHATSAPP_TEMPLATE_CONFIRMATION = "confirmacao_consulta";
    const { appointment: a } = await createAppointment(baseInput(r, nextMonday("10:00")));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "temporário", code: 131000 } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 }));
    const s1 = await processDueJobs(20, new Date());
    expect(s1.retried).toBe(1);
    let j = (await jobs()).find((x: any) => x.type === "confirmation");
    expect(j.status).toBe("pending");
    expect(j.attempts).toBe(1);
    expect(j.last_error).toContain("500");
    // ainda não venceu o backoff
    expect((await processDueJobs(20, new Date())).claimed).toBe(0);
    // após o backoff
    const s2 = await processDueJobs(20, new Date(Date.now() + 3 * 60_000));
    expect(s2.sent).toBe(1);
    j = (await jobs()).find((x: any) => x.type === "confirmation");
    expect(j.status).toBe("sent");
    expect(j.provider_message_id).toBe("wamid.ABC");
    expect((await query(`select status from appointments where id=$1`, [a.id])).rows[0].status).toBe("pending");
    const body = JSON.parse((fetchMock.mock.calls[1][1] as any).body);
    expect(body.template.name).toBe("confirmacao_consulta");
    expect(body.template.components[0].parameters).toHaveLength(6);
  });

  it("erro permanente (modelo ausente) falha de imediato, mantendo o agendamento", async () => {
    process.env.WHATSAPP_MODE = "cloud";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123"; process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    delete process.env.WHATSAPP_TEMPLATE_CONFIRMATION;
    const { appointment: a } = await createAppointment(baseInput(r, nextMonday("10:00")));
    const s = await processDueJobs(20, new Date());
    expect(s.failed).toBe(1);
    const j = (await jobs()).find((x: any) => x.type === "confirmation");
    expect(j.status).toBe("failed");
    expect(j.last_error).toMatch(/Modelo/);
    expect((await query(`select 1 from appointments where id=$1`, [a.id])).rowCount).toBe(1);
  });

  it("esgota tentativas e marca como failed", async () => {
    process.env.WHATSAPP_MODE = "cloud";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123"; process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    process.env.WHATSAPP_TEMPLATE_CONFIRMATION = "x";
    await createAppointment(baseInput(r, nextMonday("10:00")));
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 503 }));
    let t = Date.now();
    for (let i = 0; i < 7; i++) { await processDueJobs(20, new Date(t)); t += 3600_000 * 2; }
    const j = (await jobs()).find((x: any) => x.type === "confirmation");
    expect(j.status).toBe("failed");
    expect(j.attempts).toBe(5);
  });

  it("resposta sem id de mensagem não é tratada como enviada", async () => {
    process.env.WHATSAPP_MODE = "cloud";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123"; process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    process.env.WHATSAPP_TEMPLATE_CONFIRMATION = "x";
    await createAppointment(baseInput(r, nextMonday("10:00")));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const s = await processDueJobs(20, new Date());
    expect(s.sent).toBe(0);
    expect(s.retried).toBe(1);
  });

  it("lembretes antigos nunca são enviados após remarcação ou cancelamento", async () => {
    const { appointment: a } = await createAppointment(baseInput(r, nextMonday("10:00")));
    await rescheduleAppointment({ appointmentId: a.id, newStart: nextMonday("15:00"), actor: { type: "patient" } });
    await processDueJobs(50, future);
    const j = await jobs();
    expect(j.filter((x: any) => x.type === "reminder_24h" && x.status === "test_sent")).toHaveLength(1);
    expect(j.filter((x: any) => x.type === "reminder_24h" && x.status === "cancelled")).toHaveLength(1);
    await cancelAppointment({ appointmentId: a.id, actor: { type: "patient" } });
    const row = (await query(`select count(*)::int n from notification_jobs where type like 'reminder%' and status='pending'`)).rows[0];
    expect(row.n).toBe(0);
  });

  it("job processing preso (worker morreu) é retomado", async () => {
    const { appointment: a } = await createAppointment(baseInput(r, nextMonday("10:00")));
    await query(`update notification_jobs set status='processing', locked_at=now() - interval '1 hour', attempts=1 where appointment_id=$1 and type='confirmation'`, [a.id]);
    const s = await processDueJobs(20, new Date());
    expect(s.testSent).toBe(1);
  });
});

describe("webhook Meta", () => {
  it("valida assinatura HMAC", () => {
    process.env.WHATSAPP_APP_SECRET = "segredo";
    const body = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "segredo").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig)).toBe(true);
    expect(verifyMetaSignature(body + " ", sig)).toBe(false);
    expect(verifyMetaSignature(body, null)).toBe(false);
  });
});

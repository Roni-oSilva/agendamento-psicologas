import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { query, pool } from "@/lib/db";
import { createAppointment, rescheduleAppointment, cancelAppointment, createBlock, BookingError } from "@/lib/booking";
import { resetDb, setup, nextMonday, baseInput } from "./helpers";
import { signManageToken, verifyManageMac, parseManageToken } from "@/lib/tokens";

let r: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => { await resetDb(); r = await setup(); });
afterAll(async () => { await pool().end(); });

const count = async (status = "pending") =>
  Number((await query(`select count(*)::int n from appointments where status=$1`, [status])).rows[0].n);

describe("conflitos de horário", () => {
  it("agenda em horário livre", async () => {
    const { appointment } = await createAppointment(baseInput(r, nextMonday("14:00")));
    expect(appointment.status).toBe("pending");
    expect(appointment.code).toMatch(/^AG-/);
    expect((await query(`select * from appointment_history where appointment_id=$1`, [appointment.id])).rowCount).toBe(1);
  });

  it("rejeita o mesmo horário", async () => {
    await createAppointment(baseInput(r, nextMonday("14:00"), { patient: { name: "A", phone: "5511999990001" } }));
    await expect(createAppointment(baseInput(r, nextMonday("14:00"), { patient: { name: "B", phone: "5511999990002" } })))
      .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("rejeita sobreposição parcial (14:00–14:50 vs 14:30)", async () => {
    await createAppointment(baseInput(r, nextMonday("14:00")));
    await expect(createAppointment(baseInput(r, nextMonday("14:30"), { patient: { name: "B", phone: "5511999990002" } })))
      .rejects.toBeInstanceOf(BookingError);
  });

  it("permite consultas consecutivas sem intervalo (14:00–14:50 e 14:50 com step 10)", async () => {
    await query(`update professionals set slot_step_minutes=10 where id=$1`, [r.professionalId]);
    await createAppointment(baseInput(r, nextMonday("14:00")));
    const b = await createAppointment(baseInput(r, nextMonday("14:50"), { patient: { name: "B", phone: "5511999990002" } }));
    expect(b.appointment.start_at.toISOString()).toBe(nextMonday("14:50").toISOString());
  });

  it("respeita o intervalo entre consultas", async () => {
    await query(`update professionals set buffer_minutes=10, slot_step_minutes=10 where id=$1`, [r.professionalId]);
    await createAppointment(baseInput(r, nextMonday("14:00")));
    await expect(createAppointment(baseInput(r, nextMonday("14:50"), { patient: { name: "B", phone: "5511999990002" } })))
      .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await createAppointment(baseInput(r, nextMonday("15:00"), { patient: { name: "B", phone: "5511999990002" } }));
  });

  it("impede agendar fora do expediente e no almoço", async () => {
    for (const t of ["08:00", "12:00", "13:00", "17:30", "18:00", "20:00"]) {
      await expect(createAppointment(baseInput(r, nextMonday(t)))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    }
  });

  it("respeita duração específica do serviço", async () => {
    const s2 = (await query(`insert into services(professional_id,name,duration_minutes,modality) values($1,'Longa',90,'online') returning id`, [r.professionalId])).rows[0];
    // 16:30 + 90min = 18:00 cabe; 17:00 + 90 = 18:30 não cabe
    await createAppointment(baseInput(r, nextMonday("16:30"), { serviceId: s2.id }));
    await expect(createAppointment(baseInput(r, nextMonday("17:00"), { serviceId: s2.id, patient: { name: "B", phone: "5511999990002" } })))
      .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("impede agendar durante bloqueios", async () => {
    const start = nextMonday("15:00");
    await createBlock({ professionalId: r.professionalId, userId: r.userId, start, end: new Date(start.getTime() + 3600_000), kind: "block" });
    await expect(createAppointment(baseInput(r, nextMonday("15:00")))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(createAppointment(baseInput(r, nextMonday("14:30")))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("exige consentimento e e-mail quando configurado", async () => {
    await expect(createAppointment(baseInput(r, nextMonday("14:00"), { consent: { dataProcessing: false, textVersion: "v1" } })))
      .rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    await query(`update professionals set require_email=true where id=$1`, [r.professionalId]);
    await expect(createAppointment(baseInput(r, nextMonday("14:00")))).rejects.toMatchObject({ code: "EMAIL_REQUIRED" });
  });
});

describe("concorrência", () => {
  it("20 requisições simultâneas para o mesmo horário: exatamente 1 vence", async () => {
    const start = nextMonday("10:00");
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        createAppointment(baseInput(r, start, { patient: { name: `P${i}`, phone: `55119999${String(i).padStart(5, "0")}` }, idempotencyKey: `k${i}` }))),
    );
    const ok = results.filter((x) => x.status === "fulfilled");
    const failed = results.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(19);
    expect(failed.every((f) => f.reason?.code === "SLOT_UNAVAILABLE")).toBe(true);
    expect(await count("pending")).toBe(1);
  });

  it("sobreposições parciais simultâneas: nunca dois agendamentos sobrepostos", async () => {
    await query(`update professionals set slot_step_minutes=10 where id=$1`, [r.professionalId]);
    const times = ["14:00", "14:10", "14:20", "14:30", "14:40", "15:00", "15:10", "15:20"];
    await Promise.allSettled(times.map((t, i) =>
      createAppointment(baseInput(r, nextMonday(t), { patient: { name: `P${i}`, phone: `55119999${String(i).padStart(5, "0")}` } }))));
    const rows = (await query(`select start_at, block_end_at from appointments order by start_at`)).rows;
    for (let i = 1; i < rows.length; i++) expect(rows[i].start_at.getTime()).toBeGreaterThanOrEqual(rows[i - 1].block_end_at.getTime());
  });

  it("restrição de exclusão do banco rejeita inserção direta sobreposta (defesa em profundidade)", async () => {
    const { appointment: a } = await createAppointment(baseInput(r, nextMonday("14:00")));
    const p = (await query(`select patient_id from appointments where id=$1`, [a.id])).rows[0];
    await expect(query(
      `insert into appointments(code,professional_id,patient_id,service_id,start_at,end_at,block_end_at,modality,timezone)
       values('AG-RAW',$1,$2,$3,$4::timestamptz + interval '10 minutes',$4::timestamptz + interval '60 minutes',$4::timestamptz + interval '60 minutes','online','America/Sao_Paulo')`,
      [r.professionalId, p.patient_id, r.serviceId, a.start_at],
    )).rejects.toMatchObject({ code: "23P01" });
  });

  it("idempotência: mesma chave não duplica (duplo clique / retry)", async () => {
    const start = nextMonday("10:00");
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      createAppointment(baseInput(r, start, { idempotencyKey: "same-key" }))));
    expect(new Set(results.map((x) => x.appointment.id)).size).toBe(1);
    expect(results.filter((x) => !x.replay)).toHaveLength(1);
    expect(await count("pending")).toBe(1);
    const jobs = await query(`select type, count(*)::int n from notification_jobs group by type`);
    expect(jobs.rows.find((j: any) => j.type === "confirmation")?.n).toBe(1);
  });

  it("bloqueio criado concorrentemente com agendamento: nunca agenda dentro de bloqueio já confirmado", async () => {
    const start = nextMonday("15:00");
    await createBlock({ professionalId: r.professionalId, userId: r.userId, start, end: new Date(start.getTime() + 3600_000), kind: "block" });
    const res = await Promise.allSettled(Array.from({ length: 5 }, (_, i) =>
      createAppointment(baseInput(r, start, { patient: { name: `P${i}`, phone: `55119999${i}0000` } }))));
    expect(res.every((x) => x.status === "rejected")).toBe(true);
  });

  it("limite de consultas por dia é respeitado sob concorrência", async () => {
    await query(`update professionals set max_per_day=2 where id=$1`, [r.professionalId]);
    const times = ["09:00", "10:00", "11:00", "14:00", "15:00"];
    const res = await Promise.allSettled(times.map((t, i) =>
      createAppointment(baseInput(r, nextMonday(t), { patient: { name: `P${i}`, phone: `55119999${i}0000` } }))));
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(2);
  });
});

describe("remarcação e cancelamento", () => {
  const mk = async (t = "10:00") => (await createAppointment(baseInput(r, nextMonday(t)))).appointment;

  it("remarca para horário livre, mantém o registro e o histórico", async () => {
    const a = await mk();
    const u = await rescheduleAppointment({ appointmentId: a.id, newStart: nextMonday("15:00"), actor: { type: "patient" } });
    expect(u.id).toBe(a.id);
    expect(u.start_at.toISOString()).toBe(nextMonday("15:00").toISOString());
    expect(u.rescheduled_count).toBe(1);
    const h = await query(`select action, from_start, to_start from appointment_history where appointment_id=$1 order by id`, [a.id]);
    expect(h.rows.map((x: any) => x.action)).toEqual(["created", "rescheduled"]);
    // horário antigo foi liberado
    await createAppointment(baseInput(r, nextMonday("10:00"), { patient: { name: "B", phone: "5511999990009" } }));
  });

  it("rejeita remarcação para horário ocupado e preserva o original", async () => {
    const a = await mk("10:00");
    await createAppointment(baseInput(r, nextMonday("15:00"), { patient: { name: "B", phone: "5511999990009" } }));
    await expect(rescheduleAppointment({ appointmentId: a.id, newStart: nextMonday("15:00"), actor: { type: "patient" } }))
      .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    const cur = (await query(`select start_at from appointments where id=$1`, [a.id])).rows[0];
    expect(cur.start_at.toISOString()).toBe(nextMonday("10:00").toISOString());
  });

  it("pode remarcar sobre o próprio horário parcialmente sobreposto (desloca 30min)", async () => {
    await query(`update professionals set slot_step_minutes=30 where id=$1`, [r.professionalId]);
    const a = await mk("10:00");
    const u = await rescheduleAppointment({ appointmentId: a.id, newStart: nextMonday("10:30"), actor: { type: "patient" } });
    expect(u.start_at.toISOString()).toBe(nextMonday("10:30").toISOString());
  });

  it("cancelamento libera o horário e preserva o histórico", async () => {
    const a = await mk();
    await cancelAppointment({ appointmentId: a.id, actor: { type: "patient" }, reason: "imprevisto" });
    expect(await count("cancelled")).toBe(1);
    await createAppointment(baseInput(r, nextMonday("10:00"), { patient: { name: "B", phone: "5511999990009" } }));
    const h = await query(`select action from appointment_history where appointment_id=$1 order by id`, [a.id]);
    expect(h.rows.map((x: any) => x.action)).toEqual(["created", "cancelled"]);
  });

  it("não cancela duas vezes", async () => {
    const a = await mk();
    await cancelAppointment({ appointmentId: a.id, actor: { type: "patient" } });
    await expect(cancelAppointment({ appointmentId: a.id, actor: { type: "patient" } })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("paciente respeita o prazo mínimo; profissional não", async () => {
    await query(`update professionals set cancel_deadline_hours=24*30 where id=$1`, [r.professionalId]);
    const a = await mk();
    await expect(cancelAppointment({ appointmentId: a.id, actor: { type: "patient" } })).rejects.toMatchObject({ code: "TOO_LATE" });
    await expect(rescheduleAppointment({ appointmentId: a.id, newStart: nextMonday("15:00"), actor: { type: "patient" } })).rejects.toMatchObject({ code: "TOO_LATE" });
    await cancelAppointment({ appointmentId: a.id, actor: { type: "professional", userId: r.userId }, professionalId: r.professionalId });
  });

  it("isolamento: outra profissional não acessa o agendamento", async () => {
    const a = await mk();
    const other = await setup({ slug: "outra-pessoa" });
    await expect(cancelAppointment({ appointmentId: a.id, actor: { type: "professional", userId: other.userId }, professionalId: other.professionalId }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("notificações programadas", () => {
  it("programa confirmação + lembrete 24h; remarcar cancela o antigo e cria o novo; sem duplicidade", async () => {
    const a = (await createAppointment(baseInput(r, nextMonday("10:00"), { patient: { name: "A", phone: "5511999990001" } }))).appointment;
    let jobs = (await query(`select type, status, scheduled_at from notification_jobs where appointment_id=$1 order by type`, [a.id])).rows;
    expect(jobs.map((j: any) => j.type)).toEqual(["confirmation", "reminder_24h"]);
    const rem = jobs.find((j: any) => j.type === "reminder_24h");
    expect(rem.scheduled_at.getTime()).toBe(a.start_at.getTime() - 24 * 3600_000);

    await rescheduleAppointment({ appointmentId: a.id, newStart: nextMonday("15:00"), actor: { type: "patient" } });
    jobs = (await query(`select type, status, scheduled_at from notification_jobs where appointment_id=$1 order by created_at, type`, [a.id])).rows;
    const oldRem = jobs.filter((j: any) => j.type === "reminder_24h");
    expect(oldRem.filter((j: any) => j.status === "pending")).toHaveLength(1);
    expect(oldRem.filter((j: any) => j.status === "cancelled")).toHaveLength(1);
    expect(jobs.some((j: any) => j.type === "rescheduled")).toBe(true);

    await cancelAppointment({ appointmentId: a.id, actor: { type: "patient" } });
    const pend = (await query(`select type from notification_jobs where appointment_id=$1 and status='pending'`, [a.id])).rows.map((x: any) => x.type);
    expect(pend.filter((t: string) => t.startsWith("reminder"))).toEqual([]);
    expect(pend).toContain("cancelled");
  });

  it("paciente sem opt-in de lembretes não recebe lembrete", async () => {
    await query(`update professionals set send_reminders=false where id=$1`, [r.professionalId]);
    const a = (await createAppointment(baseInput(r, nextMonday("10:00")))).appointment;
    const jobs = (await query(`select type from notification_jobs where appointment_id=$1`, [a.id])).rows.map((x: any) => x.type);
    expect(jobs).toEqual(["confirmation"]);
  });
});

describe("tokens de gerenciamento", () => {
  it("assina, valida, rejeita adulteração e revogação por versão", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const tok = signManageToken(id, 1);
    const p = parseManageToken(tok)!;
    expect(verifyManageMac(p.id, 1, p.mac)).toBe(true);
    expect(verifyManageMac(p.id, 2, p.mac)).toBe(false); // revogado
    expect(verifyManageMac("22222222-2222-2222-2222-222222222222", 1, p.mac)).toBe(false);
    expect(parseManageToken("lixo")).toBeNull();
  });
});

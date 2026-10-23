import { DateTime } from "luxon";
import { seedDemo } from "./seed";
import { pool, query } from "../lib/db";
import { createAppointment, cancelAppointment, rescheduleAppointment, setAppointmentStatus, createBlock } from "../lib/booking";
import { processDueJobs } from "../worker/process";

/** Popula a demonstração usando as MESMAS funções do sistema (nada é inserido "no braço"). */
async function main() {
  process.env.SEED_PASSWORD ??= "senhaDemo12345";
  await seedDemo();
  const prof = (await query(`select p.*, u.id as uid from professionals p join users u on u.id=p.user_id where slug='maria-silva'`)).rows[0];
  await query(`truncate appointments, patients, blocked_periods cascade`);
  await query(`update professionals set min_notice_hours=2, cancel_deadline_hours=24, buffer_minutes=10, slot_step_minutes=30, extra_reminder_hours=2, whatsapp_contact_enabled=true, whatsapp_contact_number='5511912345678' where id=$1`, [prof.id]);
  await query(`delete from services where professional_id=$1`, [prof.id]);
  const mk = async (name: string, desc: string, min: number, mod: string, price: number | null, pos: number) =>
    (await query(`insert into services(professional_id,name,description,duration_minutes,modality,price_cents,position,instructions)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [prof.id, name, desc, min, mod, price, pos, mod === "online" ? "Use fones de ouvido e um local reservado." : null])).rows[0].id as string;
  const first = await mk("Primeira consulta (online)", "Conversa inicial para conhecermos sua demanda.", 60, "online", 18000, 1);
  const indiv = await mk("Psicoterapia individual (online)", "Sessão individual por videochamada.", 50, "online", 15000, 2);
  const pres = await mk("Psicoterapia individual (presencial)", "Sessão individual no consultório.", 50, "presencial", 17000, 3);
  await query(`update professionals set address='Rua das Acácias, 120, sala 4 — Pinheiros, São Paulo/SP' where id=$1`, [prof.id]);

  const tz = prof.timezone;
  const today = DateTime.now().setZone(tz).startOf("day");
  const at = (offset: number, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    let d = today; // offset em DIAS ÚTEIS
    for (let n = Math.abs(offset), step = offset < 0 ? -1 : 1; n > 0; ) { d = d.plus({ days: step }); if (d.weekday <= 5) n--; }
    return d.set({ hour: h, minute: m }).toJSDate();
  };
  const people = [
    ["Ana Paula Souza", "11912340001"], ["Bruno Carvalho", "11912340002"], ["Carla Mendes", "11912340003"], ["Daniel Ferreira", "11912340004"],
    ["Eduarda Lima", "11912340005"], ["Felipe Andrade", "11912340006"], ["Gabriela Rocha", "11912340007"], ["Henrique Alves", "11912340008"],
  ];
  const plan: [number, number, string, string][] = [ // dias úteis relativos a hoje // [pessoa, dia, hora, serviço]
    [0, -4, "09:00", indiv], [1, -3, "10:00", indiv], [2, -2, "14:00", pres], [3, -1, "15:00", indiv],
    [4, 1, "09:00", first], [0, 1, "10:00", indiv], [5, 1, "14:00", pres], [6, 2, "09:00", indiv],
    [7, 2, "15:00", first], [1, 3, "10:00", indiv], [2, 4, "14:00", pres], [3, 5, "16:00", indiv], [4, 6, "09:00", indiv],
  ];
  const created: any[] = [];
  for (const [pi, off, hh, svc] of plan) {
    try {
      const start = at(off, hh);
      const past = start < new Date();
      const { appointment } = await createAppointment({
        professionalId: prof.id, serviceId: svc, start, source: past ? "manual" : "online", actor: past ? { type: "professional", userId: prof.uid } : { type: "patient" },
        patient: { name: people[pi][0], phone: "55" + people[pi][1], email: null }, consent: { dataProcessing: true, whatsappContact: true, textVersion: "demo" },
        now: past ? new Date(start.getTime() - 86400_000 * 3) : undefined,
      });
      created.push({ appointment, past });
    } catch (e: any) { console.log("pulou", pi, off, hh, e.message); }
  }
  // desfechos variados
  const past = created.filter((c) => c.past);
  if (past[0]) await setAppointmentStatus({ appointmentId: past[0].appointment.id, professionalId: prof.id, userId: prof.uid, status: "completed" });
  if (past[1]) await setAppointmentStatus({ appointmentId: past[1].appointment.id, professionalId: prof.id, userId: prof.uid, status: "completed" });
  if (past[2]) await setAppointmentStatus({ appointmentId: past[2].appointment.id, professionalId: prof.id, userId: prof.uid, status: "no_show" });
  if (past[3]) await setAppointmentStatus({ appointmentId: past[3].appointment.id, professionalId: prof.id, userId: prof.uid, status: "completed" });
  const fut = created.filter((c) => !c.past);
  if (fut[0]) await setAppointmentStatus({ appointmentId: fut[0].appointment.id, professionalId: prof.id, userId: prof.uid, status: "confirmed" });
  if (fut[3]) await setAppointmentStatus({ appointmentId: fut[3].appointment.id, professionalId: prof.id, userId: prof.uid, status: "confirmed" });
  if (fut[2]) await cancelAppointment({ appointmentId: fut[2].appointment.id, actor: { type: "professional", userId: prof.uid }, professionalId: prof.id, reason: "Paciente avisou imprevisto" });
  if (fut[5]) await rescheduleAppointment({ appointmentId: fut[5].appointment.id, newStart: at(9, "11:00"), actor: { type: "professional", userId: prof.uid }, professionalId: prof.id });
  // feriado/folga
  const fri = today.plus({ days: 21 }); 
  await createBlock({ professionalId: prof.id, userId: prof.uid, start: fri.startOf("week").plus({ days: 4 }).toJSDate(), end: fri.startOf("week").plus({ days: 5 }).toJSDate(), kind: "holiday", reason: "Feriado" });

  // worker em modo teste: processa o que já venceu (confirmações); lembretes de 24h seguem agendados
  process.env.WHATSAPP_MODE ??= "test";
  console.log("worker:", await processDueJobs(100));
  const n = (await query(`select status, count(*)::int n from notification_jobs group by status order by 1`)).rows;
  console.log("fila:", JSON.stringify(n));
  console.log("agendamentos:", (await query(`select count(*)::int n from appointments`)).rows[0].n);
}
main().then(() => pool().end()).catch((e) => { console.error(e); process.exit(1); });

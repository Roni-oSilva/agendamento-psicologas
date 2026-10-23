import { processDueJobs } from "./process";
import { pool } from "../lib/db";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15000);
let stopping = false;

async function loop() {
  console.log(`[worker] iniciado (intervalo ${INTERVAL_MS}ms, WHATSAPP_MODE=${process.env.WHATSAPP_MODE ?? "disabled"})`);
  while (!stopping) {
    try {
      const s = await processDueJobs();
      if (s.claimed) console.log("[worker]", JSON.stringify(s));
    } catch (e) {
      console.error("[worker] erro no ciclo:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await pool().end();
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; });
loop();

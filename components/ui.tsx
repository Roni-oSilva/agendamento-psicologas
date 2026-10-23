import { STATUS_CLASS, STATUS_LABEL } from "@/lib/ui";

export function StatusBadge({ status, rescheduled }: { status: string; rescheduled?: number }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`badge ${STATUS_CLASS[status] ?? "bg-gray-100"}`}>{STATUS_LABEL[status] ?? status}</span>
      {!!rescheduled && status !== "cancelled" && <span className="badge bg-lav-100 text-lav-700">Reagendada</span>}
    </span>
  );
}

export function Flash({ kind = "ok", children }: { kind?: "ok" | "err" | "warn"; children: React.ReactNode }) {
  const c = kind === "ok" ? "bg-sage-100 text-sage-800" : kind === "warn" ? "bg-amber-50 text-amber-900 border border-amber-300" : "bg-red-50 text-red-800";
  return <p role={kind === "err" ? "alert" : "status"} className={`mb-4 rounded-2xl p-3 text-sm ${c}`}>{children}</p>;
}

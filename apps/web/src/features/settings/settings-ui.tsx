export type StatusTone = "ready" | "working" | "attention" | "idle";

export function toneClass(tone: StatusTone) {
  if (tone === "ready") return "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20";
  if (tone === "attention") return "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20";
  if (tone === "working") return "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20";
  return "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60";
}

export function StatusTile({ label, value, detail, tone = "idle" }: { label: string; value: string; detail: string; tone?: StatusTone }) {
  return <div className={`rounded-lg border p-4 ${toneClass(tone)}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><span className={`h-2.5 w-2.5 rounded-full ${tone === "ready" ? "bg-emerald-500" : tone === "attention" ? "bg-rose-500" : tone === "working" ? "bg-amber-500" : "bg-slate-300"}`} /></div><p className="mt-2 text-sm font-bold text-slate-950 dark:text-slate-100">{value}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{detail}</p></div>;
}

export function SettingsMessage({ message }: { message: { type: "success" | "error"; text: string } | null }) {
  if (!message) return null;
  return <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300"}`}>{message.text}</div>;
}

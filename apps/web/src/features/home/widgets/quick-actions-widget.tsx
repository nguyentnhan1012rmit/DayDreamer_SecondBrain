import Link from "next/link";
import { MessageCircleQuestion, PencilLine } from "lucide-react";

export function QuickActionsWidget() {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-1 2xl:grid-cols-2"><Link href="/diary" className="flex min-h-24 flex-col justify-between rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 text-cyan-900 transition hover:bg-cyan-100 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-100"><PencilLine className="h-5 w-5" /><span className="text-sm font-semibold">Write memory</span></Link><Link href="/search" className="flex min-h-24 flex-col justify-between rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 text-indigo-900 transition hover:bg-indigo-100 dark:border-indigo-900/70 dark:bg-indigo-950/30 dark:text-indigo-100"><MessageCircleQuestion className="h-5 w-5" /><span className="text-sm font-semibold">Ask memories</span></Link></div>;
}

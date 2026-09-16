import Link from "next/link";
import { MessageCircleQuestion, Search } from "lucide-react";
import { PERSONAL_QUESTIONS } from "../home-config";

export function MemoryQuestionsWidget() {
  return <section className="mt-8" aria-labelledby="today-questions-heading"><div className="mb-4 flex items-end justify-between gap-3"><div><p className="flex items-center gap-2 text-[13px] font-semibold text-indigo-600 dark:text-indigo-300"><MessageCircleQuestion className="h-4 w-4" />Ask your memories</p><h2 id="today-questions-heading" className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">Questions worth asking today</h2></div><Link href="/search" className="hidden text-sm font-semibold text-indigo-600 sm:inline dark:text-indigo-300">Open AI Search</Link></div><div className="grid gap-3 md:grid-cols-2">{PERSONAL_QUESTIONS.map((question) => <Link key={question} href={{ pathname: "/search", query: { q: question } }} className="group flex min-h-20 items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-900/60"><span className="text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{question}</span><Search className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" /></Link>)}</div></section>;
}

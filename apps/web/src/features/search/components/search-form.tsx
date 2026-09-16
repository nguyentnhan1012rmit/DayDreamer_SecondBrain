import type { FormEvent } from "react";
import { Lightbulb, LockKeyhole, Paperclip, Search, X } from "lucide-react";
import { answerStrategies, suggestedQuestions } from "../search-config";
import type {
  AnswerStrategy,
  ResponseLanguage,
  SearchScope,
} from "../search-types";

type SearchFormProps = {
  question: string;
  answerStrategy: AnswerStrategy;
  responseLanguage: ResponseLanguage;
  sourceScope: SearchScope | null;
  error: string | null;
  isSearching: boolean;
  canSubmit: boolean;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  showAuthPrompt: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQuestionChange: (value: string) => void;
  onSuggestionSelect: (value: string) => void;
  onStrategyChange: (value: AnswerStrategy) => void;
  onLanguageChange: (value: ResponseLanguage) => void;
  onClearScope: () => void;
};

export function SearchForm({
  question,
  answerStrategy,
  responseLanguage,
  sourceScope,
  error,
  isSearching,
  canSubmit,
  isAuthLoading,
  isAuthenticated,
  showAuthPrompt,
  onSubmit,
  onQuestionChange,
  onSuggestionSelect,
  onStrategyChange,
  onLanguageChange,
  onClearScope,
}: SearchFormProps) {
  return (
    <section className="enterprise-card p-5">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          AI-powered recall
        </p>
        <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
          Ask your Second Brain
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Type a natural-language question. Your memories will surface the most
          relevant answer.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {sourceScope ? (
          <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900/70 dark:bg-indigo-950/30">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm dark:bg-slate-950 dark:text-indigo-300">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-indigo-600 dark:text-indigo-300">
                Asking about one file
              </span>
              <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {sourceScope.sourceTitle || "Selected attachment"}
              </span>
            </span>
            <button
              type="button"
              onClick={onClearScope}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-indigo-500 transition hover:bg-white hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-slate-950"
              aria-label="Search all memories instead"
              title="Search all memories instead"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Question
          </span>
          <textarea
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="Example: What did I write about my capstone progress?"
            className="mt-2 min-h-28 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
          <SegmentedSetting label="Mode">
            {answerStrategies.map((strategy) => (
              <button
                key={strategy.value}
                type="button"
                onClick={() => onStrategyChange(strategy.value)}
                className={`segment-option ${answerStrategy === strategy.value ? "segment-option-active" : ""}`}
              >
                {strategy.label}
              </button>
            ))}
          </SegmentedSetting>
          <SegmentedSetting label="Language">
            {(["en", "vi"] as const).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => onLanguageChange(language)}
                className={`segment-option ${responseLanguage === language ? "segment-option-active" : ""}`}
              >
                {language.toUpperCase()}
              </button>
            ))}
          </SegmentedSetting>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionSelect(suggestion)}
              className="cursor-pointer rounded-full border border-blue-100 bg-blue-50/60 px-3.5 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-400">
            {error}
          </div>
        ) : null}

        {showAuthPrompt ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-3 dark:border-indigo-600 dark:bg-indigo-900/30">
            <LockKeyhole className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="min-w-48 flex-1">
              <span className="block text-sm font-medium text-indigo-900 dark:text-indigo-200">
                Sign in to search your memories
              </span>
              <span className="mt-0.5 block text-xs text-indigo-700 dark:text-indigo-400">
                Search requires authentication to access private memories.
              </span>
            </span>
            <a href="/login" className="action-primary min-h-10 shrink-0 px-3">
              Sign in
            </a>
          </div>
        ) : null}

        {!isAuthLoading && !isAuthenticated && !showAuthPrompt ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              You&apos;re exploring as a guest. <a href="/login" className="font-medium text-indigo-600 underline">Sign in</a> to search your personal memories.
            </span>
          </p>
        ) : null}

        <button type="submit" disabled={!canSubmit} className="action-primary cursor-pointer px-5">
          {isSearching ? "Searching memories..." : <><Search className="h-4 w-4" />Ask question</>}
        </button>
      </form>
    </section>
  );
}

function SegmentedSetting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
      <div className="segment-control">{children}</div>
    </div>
  );
}

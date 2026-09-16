"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSearchHistory,
  clearSearchHistory as apiClearHistory,
  deleteSearchHistoryItem as apiDeleteHistoryItem,
} from "@/lib/api/search-api";
import { SearchForm } from "@/features/search/components/search-form";
import { SearchAnswerCard } from "@/features/search/components/search-answer-card";
import { CitationList } from "@/features/search/components/citation-list";
import { SearchHistory } from "@/features/search/components/search-history";
import { cleanSourceTitle } from "@/features/search/search-formatters";
import type {
  AnswerStrategy,
  ResponseLanguage,
  SearchCitation,
  SearchHistoryEntry,
  SearchResponse,
  SearchScope,
} from "@/features/search/search-types";

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export default function SearchPage() {
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    getAccessToken,
    isAdmin,
  } = useAuth();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [responseLanguage, setResponseLanguage] =
    useState<ResponseLanguage>("en");
  const [answerStrategy, setAnswerStrategy] = useState<AnswerStrategy>("auto");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [showAiDebug, setShowAiDebug] = useState(false);
  const [sourceScope, setSourceScope] = useState<SearchScope | null>(null);
  const autoRunRequested = useRef(false);

  // Load language preference on mount
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const saved = localStorage.getItem(
        "dd-response-lang",
      ) as ResponseLanguage | null;
      if (saved === "en" || saved === "vi") {
        setResponseLanguage(saved);
      } else if (localStorage.getItem("dd-response-lang") === "auto") {
        localStorage.setItem("dd-response-lang", "en");
        setResponseLanguage("en");
      }

      const savedStrategy = localStorage.getItem(
        "dd-answer-strategy",
      ) as AnswerStrategy | null;
      if (
        savedStrategy === "auto" ||
        savedStrategy === "fast" ||
        savedStrategy === "deep"
      ) {
        setAnswerStrategy(savedStrategy);
      }

      setShowAiDebug(localStorage.getItem("dd-show-ai-debug") === "true");

      const searchParams = new URLSearchParams(window.location.search);
      const initialQuestion = searchParams.get("q");
      if (initialQuestion?.trim()) {
        setQuestion(initialQuestion.trim());
      }

      const sourceType = searchParams.get("sourceType")?.trim();
      const sourceId = searchParams.get("sourceId")?.trim();
      if (sourceType && sourceId) {
        setSourceScope({
          sourceType,
          sourceId,
          sourceTitle: searchParams.get("sourceTitle")?.trim() || undefined,
        });
        autoRunRequested.current = searchParams.get("run") === "1";
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  // Load search history from server when authenticated
  const loadServerHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const token = getAccessToken();
      const history = await getSearchHistory(token);
      setSearchHistory(history);
    } catch {
      // Silently fail — not critical
    }
  }, [isAuthenticated, getAccessToken]);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      const timeoutId = window.setTimeout(() => {
        void loadServerHistory();
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [isAuthLoading, isAuthenticated, loadServerHistory]);

  const handleClearHistory = useCallback(async () => {
    try {
      const token = getAccessToken();
      await apiClearHistory(token);
      setSearchHistory([]);
    } catch {
      // Silently fail
    }
  }, [getAccessToken]);

  const handleDeleteHistoryItem = useCallback(
    async (id: string) => {
      try {
        const token = getAccessToken();
        await apiDeleteHistoryItem(id, token);
        setSearchHistory((prev) => prev.filter((h) => h.id !== id));
      } catch {
        // Silently fail
      }
    },
    [getAccessToken],
  );

  const canSubmit = useMemo(
    () => question.trim().length > 0 && !isSearching,
    [question, isSearching],
  );

  const runSearch = useCallback(
    async (normalizedQuestion: string, scopeOverride?: SearchScope | null) => {
      if (!normalizedQuestion) {
        setError("Please enter a question before searching.");
        return;
      }

      // Gate: must be signed in to search
      if (!isAuthenticated) {
        setError(null);
        setShowAuthPrompt(true);
        return;
      }

      const token = getAccessToken();
      if (!token) {
        setError("Session expired. Please sign in again.");
        return;
      }

      setShowAuthPrompt(false);

      setIsSearching(true);
      setError(null);

      try {
        const activeScope =
          scopeOverride === undefined ? sourceScope : scopeOverride;
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const timeZone = getBrowserTimeZone();
        const response = await fetch(`${apiUrl}/api/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            question: normalizedQuestion,
            limit: 8,
            responseLanguage,
            ...(timeZone ? { timeZone } : {}),
            ...(answerStrategy === "auto" ? {} : { answerStrategy }),
            ...(activeScope
              ? {
                  sourceType: activeScope.sourceType,
                  sourceId: activeScope.sourceId,
                }
              : {}),
          }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              "Session expired or invalid. Please sign in again.",
            );
          }

          const requestId = response.headers.get("x-request-id");
          const errorBody = (await response.json().catch(() => null)) as {
            message?: string;
            requestId?: string;
          } | null;
          const detail =
            errorBody?.message ||
            `Search failed with status ${response.status}`;
          throw new Error(
            requestId || errorBody?.requestId
              ? `${detail} (request ${requestId || errorBody?.requestId})`
              : detail,
          );
        }

        const data = (await response.json()) as SearchResponse;
        setResult(data);

        // Refresh history from server (backend auto-saved)
        loadServerHistory();

        // Persist token usage for sidebar widget
        if (data.analytics?.tokenUsage) {
          try {
            const todayKey = new Date().toISOString().slice(0, 10);
            const stored = JSON.parse(
              localStorage.getItem("dd-token-usage") || "{}",
            );
            const today = stored[todayKey] || { tokens: 0, queries: 0 };
            today.tokens += data.analytics.tokenUsage.totalTokens;
            today.queries += 1;
            stored[todayKey] = today;
            localStorage.setItem("dd-token-usage", JSON.stringify(stored));
          } catch {
            /* ignore localStorage errors */
          }
        }
      } catch (searchError) {
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Search failed. Please try again.",
        );
        setResult(null);
      } finally {
        setIsSearching(false);
      }
    },
    [
      answerStrategy,
      getAccessToken,
      isAuthenticated,
      loadServerHistory,
      responseLanguage,
      sourceScope,
    ],
  );

  useEffect(() => {
    if (
      isAuthLoading ||
      !isAuthenticated ||
      !autoRunRequested.current ||
      !question.trim() ||
      !sourceScope
    ) {
      return;
    }

    autoRunRequested.current = false;
    void runSearch(question.trim());
  }, [isAuthLoading, isAuthenticated, question, runSearch, sourceScope]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearch(question.trim());
  }

  const handleAskSource = useCallback((source: SearchCitation) => {
    setSourceScope({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceTitle: cleanSourceTitle(source.sourceTitle),
    });
    setQuestion("What else should I know about this file?");
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => document.querySelector("textarea")?.focus(), 250);
  }, []);

  return (
    <DashboardShell
      title="Memory Search"
      description="Ask a question and get an answer grounded in your saved memories."
    >
      <div className="space-y-6">
        <SearchForm
          question={question}
          answerStrategy={answerStrategy}
          responseLanguage={responseLanguage}
          sourceScope={sourceScope}
          error={error}
          isSearching={isSearching}
          canSubmit={canSubmit}
          isAuthLoading={isAuthLoading}
          isAuthenticated={isAuthenticated}
          showAuthPrompt={showAuthPrompt}
          onSubmit={handleSearch}
          onQuestionChange={setQuestion}
          onSuggestionSelect={(value) => {
            setSourceScope(null);
            setQuestion(value);
          }}
          onStrategyChange={(value) => {
            setAnswerStrategy(value);
            localStorage.setItem("dd-answer-strategy", value);
          }}
          onLanguageChange={(value) => {
            setResponseLanguage(value);
            localStorage.setItem("dd-response-lang", value);
          }}
          onClearScope={() => {
            autoRunRequested.current = false;
            setSourceScope(null);
            setResult(null);
            window.history.replaceState(null, "", "/search");
          }}
        />

        <SearchAnswerCard
          result={result}
          isSearching={isSearching}
          language={responseLanguage}
          isAdmin={isAdmin}
          showDebug={showAiDebug}
          onShowDebugChange={(enabled) => {
            setShowAiDebug(enabled);
            localStorage.setItem("dd-show-ai-debug", enabled ? "true" : "false");
          }}
          onReset={() => {
            setResult(null);
            window.setTimeout(() => document.querySelector("textarea")?.focus(), 0);
          }}
          onQuestionChange={(value) => {
            setSourceScope(null);
            setQuestion(value);
          }}
        />
      </div>

      <CitationList
        sources={result?.sources ?? []}
        onAskSource={handleAskSource}
      />

      <SearchHistory
        items={searchHistory}
        expanded={showHistory}
        onExpandedChange={setShowHistory}
        onClear={() => void handleClearHistory()}
        onDelete={(id) => void handleDeleteHistoryItem(id)}
        onSelect={(historyQuestion) => {
          setSourceScope(null);
          setQuestion(historyQuestion);
          void runSearch(historyQuestion, null);
        }}
      />
    </DashboardShell>
  );
}

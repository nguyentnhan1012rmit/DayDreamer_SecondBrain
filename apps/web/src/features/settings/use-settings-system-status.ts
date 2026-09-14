"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAdminDiagnostics,
  getDemoReadiness,
  getIndexingStatus,
  requeueDeadLetterIndexingJobs,
  requeueIndexingJob,
  type AdminDiagnostics,
  type DemoReadiness,
  type IndexingStatus,
} from "@/lib/api/admin-api";

export function useSettingsSystemStatus({ includeAdmin = false }: { includeAdmin?: boolean } = {}) {
  const { getAccessToken, isAuthenticated, isAdmin } = useAuth();
  const [diagnostics, setDiagnostics] = useState<AdminDiagnostics | null>(null);
  const [indexing, setIndexing] = useState<IndexingStatus | null>(null);
  const [readiness, setReadiness] = useState<DemoReadiness | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequeueing, setIsRequeueing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const token = getAccessToken();
      const [nextIndexing, nextReadiness, nextDiagnostics] = await Promise.all([
        getIndexingStatus(token),
        getDemoReadiness(token),
        includeAdmin && isAdmin ? getAdminDiagnostics(token) : Promise.resolve(null),
      ]);
      setIndexing(nextIndexing);
      setReadiness(nextReadiness);
      setDiagnostics(nextDiagnostics);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load system status." });
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, includeAdmin, isAdmin, isAuthenticated]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const requeueJob = useCallback(async (jobId: string) => {
    setIsRequeueing(true);
    setMessage(null);
    try {
      await requeueIndexingJob(getAccessToken(), jobId);
      setMessage({ type: "success", text: "Indexing job requeued." });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not requeue indexing job." });
    } finally {
      setIsRequeueing(false);
    }
  }, [getAccessToken, refresh]);

  const requeueDeadLetters = useCallback(async () => {
    setIsRequeueing(true);
    setMessage(null);
    try {
      const result = await requeueDeadLetterIndexingJobs(getAccessToken());
      setMessage({ type: "success", text: result.requeued ? `Requeued ${result.requeued} dead-letter job(s).` : "No dead-letter jobs to requeue." });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not requeue dead-letter jobs." });
    } finally {
      setIsRequeueing(false);
    }
  }, [getAccessToken, refresh]);

  return {
    diagnostics,
    indexing,
    readiness,
    isLoading,
    isRequeueing,
    message,
    refresh,
    requeueJob,
    requeueDeadLetters,
  };
}

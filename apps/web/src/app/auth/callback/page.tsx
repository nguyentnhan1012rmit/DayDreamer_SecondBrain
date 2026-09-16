"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { syncSessionWithBackend } from "@/lib/auth-flow";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase, session, isLoading } = useAuth();
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const [message, setMessage] = useState("Processing your authentication...");
  const hasExchangedCode = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setStatus("error");
      setMessage("Authentication service is not configured.");
      return;
    }

    const authError =
      searchParams.get("error_description") || searchParams.get("error");
    if (authError) {
      setStatus("error");
      setMessage(authError);
      return;
    }

    const code = searchParams.get("code");
    if (code && !hasExchangedCode.current) {
      hasExchangedCode.current = true;
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setStatus("error");
          setMessage(error.message);
        }
      });
      // Do not return here; let the session effect handle the rest
      // once exchangeCodeForSession triggers onAuthStateChange
    }

    // Wait for the auth context to finish loading the session
    if (isLoading) return;

    if (session) {
      const type = searchParams.get("type");

      if (type === "recovery") {
        setStatus("success");
        setMessage("Password reset confirmed. Redirecting...");
        const timer = setTimeout(() => router.push("/diary"), 2000);
        return () => clearTimeout(timer);
      } else {
        setStatus("success");
        setMessage("Authentication successful! Redirecting to your diary...");
        const timer = setTimeout(() => router.push("/diary"), 1500);
        return () => clearTimeout(timer);
      }
    } else {
      // No session. If there's an access_token in the hash, Supabase might still be parsing it.
      // But typically isLoading would be true until onAuthStateChange fires.
      // Just in case, check the hash.
      if (
        typeof window !== "undefined" &&
        window.location.hash.includes("access_token")
      ) {
        // Still processing hash, stay in processing state
        return;
      }

      // No session and no hash, meaning email is confirmed but user needs to log in,
      // or they just visited the callback page directly.
      setStatus("success");
      setMessage("Email confirmed! You can now sign in.");
      const timer = setTimeout(() => router.push("/login"), 2000);
      return () => clearTimeout(timer);
    }
  }, [supabase, router, searchParams, session, isLoading]);

  return (
    <div className="w-full max-w-md enterprise-card p-8 text-center">
      {status === "processing" && (
        <>
          <div className="mx-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="skeleton-line mx-auto h-3 w-36" />
            <div className="skeleton-line mx-auto h-3 w-24" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
            {message}
          </p>
        </>
      )}

      {status === "success" && (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <svg
              className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {message}
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40">
            <svg
              className="h-7 w-7 text-rose-600 dark:text-rose-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-rose-700 dark:text-rose-300">
            {message}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="mt-4 cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            Go to Login
          </button>
        </>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
      <Suspense
        fallback={
          <div className="w-full max-w-md enterprise-card p-8 text-center">
            <div className="mx-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="skeleton-line mx-auto h-3 w-36" />
              <div className="skeleton-line mx-auto h-3 w-24" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
              Processing...
            </p>
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </div>
  );
}

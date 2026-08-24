"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { syncSessionWithBackend } from "@/lib/auth-flow";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase } = useAuth();
  const [status, setStatus] = useState<"processing" | "recovery" | "success" | "error">("processing");
  const [message, setMessage] = useState("Processing your authentication...");
  const [nextPath, setNextPath] = useState<"/diary" | "/login">("/diary");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const hasProcessedCallback = useRef(false);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const handleCallback = async () => {
      if (hasProcessedCallback.current) return;
      hasProcessedCallback.current = true;

      try {
        const authError = searchParams.get("error_description") || searchParams.get("error");
        if (authError) {
          setStatus("error");
          setMessage(authError);
          return;
        }

        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setStatus("error");
            setMessage(exchangeError.message);
            return;
          }
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setStatus("error");
          setMessage(error.message);
          return;
        }

        if (data.session) {
          await syncSessionWithBackend(data.session).catch((syncError) => {
            console.warn(
              "[Auth] Backend sync after OAuth callback failed:",
              syncError instanceof Error ? syncError.message : syncError,
            );
          });

          const type = searchParams.get("type");

          if (type === "recovery") {
            setStatus("recovery");
            setMessage("Choose a new password for your account.");
          } else {
            setStatus("success");
            setMessage("Email confirmed. Your diary is ready.");
            setNextPath("/diary");
          }
        } else {
          setStatus("success");
          setMessage("Email confirmed! You can now sign in.");
          setNextPath("/login");
        }
      } catch {
        setStatus("error");
        setMessage("Something went wrong during authentication.");
      }
    };

    handleCallback();
  }, [supabase, router, searchParams]);

  const displayedStatus = supabase ? status : "error";
  const displayedMessage = supabase
    ? message
    : "Authentication service is not configured.";

  const handlePasswordUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecoveryError("");

    if (newPassword.length < 6) {
      setRecoveryError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setRecoveryError("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setRecoveryError("Authentication service is not configured.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setRecoveryError(error.message);
        return;
      }

      setNextPath("/diary");
      setMessage("Your password has been updated securely.");
      setStatus("success");
    } catch (error) {
      setRecoveryError(
        error instanceof Error ? error.message : "Could not update your password. Please try again.",
      );
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="w-full max-w-md enterprise-card p-6 text-center sm:p-8" aria-live="polite">
      <h1 className="sr-only">DayDreamer authentication</h1>
      {displayedStatus === "processing" && (
        <>
          <div className="mx-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="skeleton-line mx-auto h-3 w-36" />
            <div className="skeleton-line mx-auto h-3 w-24" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">{displayedMessage}</p>
        </>
      )}

      {displayedStatus === "recovery" && (
        <form onSubmit={handlePasswordUpdate} className="text-left">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="mt-4 text-center text-xl font-semibold text-slate-950 dark:text-white">
            Set a new password
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">{message}</p>

          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                autoComplete="new-password"
                aria-invalid={Boolean(confirmPassword && newPassword !== confirmPassword)}
                aria-describedby={recoveryError ? "recovery-error" : undefined}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
              />
            </label>
          </div>

          {recoveryError ? (
            <p id="recovery-error" role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {recoveryError}
            </p>
          ) : null}

          <button type="submit" disabled={isUpdatingPassword} className="action-primary mt-5 w-full">
            {isUpdatingPassword ? "Updating password…" : "Update password"}
          </button>
        </form>
      )}

      {displayedStatus === "success" && (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">{displayedMessage}</p>
          <button onClick={() => router.replace(nextPath)} className="action-primary mt-5">
            {nextPath === "/diary" ? "Continue to diary" : "Go to sign in"}
          </button>
        </>
      )}

      {displayedStatus === "error" && (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40">
            <svg className="h-7 w-7 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-rose-700 dark:text-rose-300">{displayedMessage}</p>
          <button
            onClick={() => router.replace("/login")}
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
    <main className="auth-canvas flex min-h-dvh items-center justify-center px-4 py-8">
      <Suspense
        fallback={
          <div className="w-full max-w-md enterprise-card p-8 text-center">
            <div className="mx-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="skeleton-line mx-auto h-3 w-36" />
              <div className="skeleton-line mx-auto h-3 w-24" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Processing...</p>
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </main>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function ProfileSettingsTab() {
  const { user, isAuthenticated, isLoading, supabase, role, isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const savedName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "User";
  const avatarUrl = avatarPreview ?? user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const provider = user?.app_metadata?.provider ?? "email";

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDisplayName(savedName), 0);
    return () => window.clearTimeout(timeoutId);
  }, [savedName]);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (newPassword.length >= 6) score++;
    if (newPassword.length >= 10) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    return score;
  }, [newPassword]);

  async function updateName() {
    if (!supabase || !displayName.trim()) return;
    setIsSavingName(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Display name updated." });
    setIsSavingName(false);
  }

  async function updateAvatar(file?: File) {
    if (!file || !supabase || !user) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Choose an image smaller than 2MB." });
      return;
    }
    setIsUploadingAvatar(true);
    setMessage(null);
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    try {
      const extension = file.name.split(".").pop() || "jpg";
      const filePath = `avatars/${user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      if (updateError) throw updateError;
      setAvatarPreview(publicUrl);
      setMessage({ type: "success", text: "Avatar updated." });
    } catch (error) {
      setAvatarPreview(null);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Avatar upload failed." });
    } finally {
      URL.revokeObjectURL(preview);
      setIsUploadingAvatar(false);
    }
  }

  async function updatePassword() {
    if (!supabase) return;
    if (newPassword.length < 6 || newPassword !== confirmPassword) {
      setMessage({ type: "error", text: newPassword.length < 6 ? "Password must be at least 6 characters." : "Passwords do not match." });
      return;
    }
    setIsSavingPassword(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Password updated." });
    if (!error) {
      setNewPassword("");
      setConfirmPassword("");
    }
    setIsSavingPassword(false);
  }

  if (isLoading) return <section className="enterprise-card p-5"><div className="skeleton-line h-24" /></section>;
  if (!isAuthenticated) return <section className="enterprise-card p-5 text-sm text-slate-600 dark:text-slate-300">Sign in to manage your profile.</section>;

  return (
    <div className="space-y-6">
      <section className="enterprise-card p-5">
        <TabHeading eyebrow="Account" title="Your Profile" />
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void updateAvatar(event.target.files?.[0])} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploadingAvatar} className="group relative h-16 w-16 shrink-0 cursor-pointer" aria-label="Change avatar">
            {avatarUrl ? <Image src={avatarUrl} alt={savedName} width={64} height={64} className="h-16 w-16 rounded-lg object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-900 text-2xl font-bold text-white">{savedName.charAt(0).toUpperCase()}</span>}
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="h-5 w-5" /></span>
          </button>
          <div><p className="font-semibold text-slate-950 dark:text-slate-100">{savedName}</p><p className="text-sm text-slate-500">{user?.email}</p><div className="mt-2 flex gap-2"><span className="status-badge capitalize">{provider}</span><span className="status-badge">{isAdmin ? "Admin" : role}</span></div></div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="min-h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" aria-label="Display name" />
          <button type="button" onClick={() => void updateName()} disabled={isSavingName || displayName.trim() === savedName} className="action-primary px-4">{isSavingName ? "Saving..." : "Save name"}</button>
        </div>
      </section>

      <section className="enterprise-card p-5">
        <TabHeading eyebrow="Security" title="Password" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PasswordField label="New password" value={newPassword} show={showPassword} onChange={setNewPassword} onToggle={() => setShowPassword((value) => !value)} />
          <PasswordField label="Confirm password" value={confirmPassword} show={showPassword} onChange={setConfirmPassword} onToggle={() => setShowPassword((value) => !value)} />
        </div>
        {newPassword ? <div className="mt-3 flex gap-1" aria-label={`Password strength ${passwordStrength} of 5`}>{[1, 2, 3, 4, 5].map((step) => <span key={step} className={`h-1.5 flex-1 rounded-full ${step <= passwordStrength ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"}`} />)}</div> : null}
        <button type="button" onClick={() => void updatePassword()} disabled={isSavingPassword || !newPassword} className="action-primary mt-4 px-4">{isSavingPassword ? "Updating..." : provider === "google" ? "Set password" : "Update password"}</button>
      </section>

      {message ? <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{message.text}</div> : null}
    </div>
  );
}

function TabHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{eyebrow}</p><h3 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">{title}</h3></div>;
}

function PasswordField({ label, value, show, onChange, onToggle }: { label: string; value: string; show: boolean; onChange: (value: string) => void; onToggle: () => void }) {
  return <label className="relative block"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span><input type={show ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-12 text-sm dark:border-slate-700 dark:bg-slate-950" /><button type="button" onClick={onToggle} className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-slate-500" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></label>;
}

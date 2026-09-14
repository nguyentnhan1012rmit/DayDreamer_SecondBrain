"use client";

import { GoogleWorkspaceCard } from "@/components/integrations/google-workspace-card";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsSystemStatus } from "../use-settings-system-status";

export function GoogleSettingsTab() {
  const { isAdmin } = useAuth();
  const { indexing } = useSettingsSystemStatus();
  return <GoogleWorkspaceCard indexingStatus={indexing} variant={isAdmin ? "admin" : "user"} />;
}

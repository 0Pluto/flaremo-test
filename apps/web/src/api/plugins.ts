import { apiRequest } from "./client";

export type CardOptionValue = string | number | boolean;

export type PluginSettings = {
  enabledPlugins: string[];
  disabledPlugins: string[];
  cards: {
    order: string[];
    hidden: string[];
    default: string | null;
    options: Record<string, Record<string, CardOptionValue>>;
  };
};

/** Public plugin configuration, readable without a session. */
export async function getPublicPluginSettings(): Promise<PluginSettings | null> {
  try {
    const response = await fetch("/api/app/plugins");
    if (!response.ok) return null;
    return (await response.json()) as PluginSettings;
  } catch {
    return null;
  }
}

export async function getAdminPluginSettings() {
  return apiRequest<PluginSettings>("/api/app/admin/plugins");
}

export async function updateAdminPluginSettings(patch: {
  enabledPlugins?: string[];
  disabledPlugins?: string[];
  cards?: {
    order?: string[];
    hidden?: string[];
    default?: string | null;
    options?: Record<string, Record<string, CardOptionValue>>;
  };
}) {
  return apiRequest<PluginSettings>("/api/app/admin/plugins", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteEmailSettings,
  deleteOauthSettings,
  type EmailSettings,
  getEmailSettings,
  getOauthSettings,
  type OauthSettings,
  saveEmailSettings,
  saveOauthSettings,
  testEmailSettings,
} from "@/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";

/**
 * Owner-only instance integration settings: transactional email (Resend) and
 * social sign-in (Google, GitHub). Same shape as the voice panel: masked
 * write-only previews, revision-checked saves, env-first resolution.
 */

export function EmailSettingsCard() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [config, setConfig] = useState<EmailSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [fields, setFields] = useState({ apiKey: "", from: "", fromName: "" });
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "test" | "delete" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["email-settings"],
    queryFn: getEmailSettings,
  });
  useEffect(() => {
    const value = settingsQuery.data;
    if (!value) return;
    setConfig(value);
    setEnabled(value.enabled);
  }, [settingsQuery.data]);

  const envManaged = config?.source === "environment";
  const emailEditingDisabled =
    busy || envManaged || !config || config.unreadable;

  async function run(
    action: "save" | "test" | "delete",
    task: () => Promise<unknown>,
    successKey: Parameters<ReturnType<typeof useI18n>["t"]>[0],
  ) {
    setBusy(true);
    setPendingAction(action);
    try {
      await task();
      const value = await cache.fetchQuery({
        queryKey: ["email-settings"],
        queryFn: getEmailSettings,
        staleTime: 0,
      });
      setConfig(value);
      setEnabled(value.enabled);
      setFields({ apiKey: "", from: "", fromName: "" });
      toast.success(t(successKey));
    } catch (error) {
      toast.error(errorMessage(error, t("admin.integrations.emailError")));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.integrations.emailTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("admin.integrations.emailDescription")}
        </p>
        {!config && settingsQuery.isPending && (
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
        {config && (
          <>
            <p className="text-sm">
              {envManaged
                ? t("admin.integrations.emailEnvManaged")
                : config.configured
                  ? t("admin.integrations.emailConfigured", {
                      provider: config.provider,
                    })
                  : t("admin.integrations.emailUnconfigured")}
            </p>
            {!config.canEncrypt && (
              <p className="text-sm text-muted-foreground">
                {t("admin.integrations.plainStore")}
              </p>
            )}
            {config.unreadable && (
              <p className="text-destructive text-sm">
                {t("admin.integrations.unreadable")}
              </p>
            )}
            {config.provider === "cloudflare" ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.integrations.emailCloudflareNote")}
              </p>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    "save",
                    () =>
                      saveEmailSettings({
                        revision: config.revision,
                        enabled,
                        credentials: {
                          apiKey: fields.apiKey.trim(),
                          from: fields.from.trim(),
                          fromName: fields.fromName.trim(),
                        },
                      }),
                    "admin.integrations.saved",
                  );
                }}
              >
                <label
                  className="flex flex-col gap-1.5 text-sm font-medium"
                  htmlFor="email-from"
                >
                  {t("admin.integrations.emailFrom")}
                  <Input
                    autoComplete="off"
                    disabled={emailEditingDisabled}
                    id="email-from"
                    placeholder={config.previews?.from ?? ""}
                    value={fields.from}
                    onChange={(event) =>
                      setFields({ ...fields, from: event.target.value })
                    }
                  />
                </label>
                <label
                  className="flex flex-col gap-1.5 text-sm font-medium"
                  htmlFor="email-from-name"
                >
                  {t("admin.integrations.emailFromName")}
                  <Input
                    autoComplete="off"
                    disabled={emailEditingDisabled}
                    id="email-from-name"
                    placeholder={config.previews?.fromName ?? ""}
                    value={fields.fromName}
                    onChange={(event) =>
                      setFields({ ...fields, fromName: event.target.value })
                    }
                  />
                </label>
                <label
                  className="flex flex-col gap-1.5 text-sm font-medium"
                  htmlFor="email-api-key"
                >
                  {t("admin.integrations.emailApiKey")}
                  <PasswordInput
                    autoComplete="new-password"
                    disabled={emailEditingDisabled}
                    id="email-api-key"
                    placeholder={config.previews?.apiKey ?? ""}
                    value={fields.apiKey}
                    onChange={(event) =>
                      setFields({ ...fields, apiKey: event.target.value })
                    }
                  />
                </label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={enabled}
                    disabled={emailEditingDisabled}
                    id="email-enabled"
                    onCheckedChange={setEnabled}
                  />
                  <label
                    className="text-sm font-medium"
                    htmlFor="email-enabled"
                  >
                    {t("admin.integrations.enabled")}
                  </label>
                </div>
                <Button disabled={emailEditingDisabled} type="submit">
                  {pendingAction === "save" && (
                    <Loader2Icon
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  {t("admin.integrations.save")}
                </Button>
              </form>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || !config.configured}
                onClick={() =>
                  void run(
                    "test",
                    testEmailSettings,
                    "admin.integrations.testSuccess",
                  )
                }
              >
                {pendingAction === "test" && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("admin.integrations.testEmail")}
              </Button>
              <Button
                variant="destructive"
                disabled={busy || !config.revision}
                onClick={() => setConfirmDelete(true)}
              >
                {t("admin.integrations.delete")}
              </Button>
            </div>
          </>
        )}
        <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("admin.integrations.delete")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("admin.integrations.emailConfirmDelete")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (config)
                    void run(
                      "delete",
                      () => deleteEmailSettings(config.revision),
                      "admin.integrations.deleted",
                    );
                }}
              >
                {t("admin.integrations.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

type OauthProviderKey = "google" | "github";

export function OauthSettingsCard() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [config, setConfig] = useState<OauthSettings | null>(null);
  const [fields, setFields] = useState({
    googleClientId: "",
    googleClientSecret: "",
    githubClientId: "",
    githubClientSecret: "",
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["oauth-settings"],
    queryFn: getOauthSettings,
  });
  useEffect(() => {
    if (settingsQuery.data) setConfig(settingsQuery.data);
  }, [settingsQuery.data]);

  const envManaged = config?.source === "environment";
  const editingDisabled = busy || envManaged || !config || config.unreadable;

  async function run(
    task: () => Promise<unknown>,
    successKey: Parameters<ReturnType<typeof useI18n>["t"]>[0],
  ) {
    setBusy(true);
    try {
      await task();
      const value = await cache.fetchQuery({
        queryKey: ["oauth-settings"],
        queryFn: getOauthSettings,
        staleTime: 0,
      });
      setConfig(value);
      setFields({
        googleClientId: "",
        googleClientSecret: "",
        githubClientId: "",
        githubClientSecret: "",
      });
      toast.success(t(successKey));
    } catch (error) {
      toast.error(errorMessage(error, t("admin.integrations.oauthError")));
    } finally {
      setBusy(false);
    }
  }

  const providerRow = (key: OauthProviderKey) => {
    const preview = config?.previews?.[key] ?? null;
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            {key === "google" ? "Google" : "GitHub"}
          </p>
          {preview?.active && (
            <span className="text-muted-foreground text-xs">
              {t("admin.integrations.providerActive")}
            </span>
          )}
        </div>
        <label
          className="flex flex-col gap-1.5 text-sm font-medium"
          htmlFor={`${key}-client-id`}
        >
          {t("admin.integrations.oauthClientId")}
          <Input
            autoComplete="off"
            disabled={editingDisabled}
            id={`${key}-client-id`}
            placeholder={preview?.clientId ?? ""}
            value={fields[`${key}ClientId`]}
            onChange={(event) =>
              setFields({
                ...fields,
                [`${key}ClientId`]: event.target.value,
              })
            }
          />
        </label>
        <label
          className="flex flex-col gap-1.5 text-sm font-medium"
          htmlFor={`${key}-client-secret`}
        >
          {t("admin.integrations.oauthClientSecret")}
          <PasswordInput
            autoComplete="new-password"
            disabled={editingDisabled}
            id={`${key}-client-secret`}
            placeholder={preview?.clientSecret ?? ""}
            value={fields[`${key}ClientSecret`]}
            onChange={(event) =>
              setFields({
                ...fields,
                [`${key}ClientSecret`]: event.target.value,
              })
            }
          />
        </label>
        <p className="text-muted-foreground text-xs">
          {t("admin.integrations.oauthCallbackPrefix")}{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            {typeof window !== "undefined"
              ? window.location.origin
              : "https://your-instance"}
            /api/auth/callback/{key}
          </code>
        </p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.integrations.oauthTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {t("admin.integrations.oauthDescription")}
        </p>
        {!config && settingsQuery.isPending && (
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
        {config && (
          <>
            {envManaged && (
              <p className="text-sm">
                {t("admin.integrations.oauthEnvManaged")}
              </p>
            )}
            {!config.canEncrypt && (
              <p className="text-sm text-muted-foreground">
                {t("admin.integrations.plainStore")}
              </p>
            )}
            {config.unreadable && (
              <p className="text-destructive text-sm">
                {t("admin.integrations.unreadable")}
              </p>
            )}
            <div className="flex flex-col gap-3">
              {providerRow("google")}
              {providerRow("github")}
            </div>
            <Button
              disabled={editingDisabled}
              onClick={() =>
                void run(
                  () =>
                    saveOauthSettings({
                      revision: config.revision,
                      credentials: {
                        google: {
                          clientId: fields.googleClientId.trim(),
                          clientSecret: fields.googleClientSecret.trim(),
                        },
                        github: {
                          clientId: fields.githubClientId.trim(),
                          clientSecret: fields.githubClientSecret.trim(),
                        },
                      },
                    }),
                  "admin.integrations.saved",
                )
              }
            >
              {busy && (
                <Loader2Icon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("admin.integrations.save")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !config.revision}
              onClick={() => setConfirmDelete(true)}
            >
              {t("admin.integrations.delete")}
            </Button>
          </>
        )}
        <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("admin.integrations.delete")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("admin.integrations.oauthConfirmDelete")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (config)
                    void run(
                      () => deleteOauthSettings(config.revision),
                      "admin.integrations.deleted",
                    );
                }}
              >
                {t("admin.integrations.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

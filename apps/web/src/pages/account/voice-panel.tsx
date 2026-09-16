import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteVoiceSettings,
  getVoiceSettings,
  saveVoiceSettings,
  testVoiceSettings,
  type VoiceSettings,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/key";

type CredentialField =
  | "appId"
  | "secretId"
  | "secretKey"
  | "apiKey"
  | "volcAppId"
  | "volcAccessToken"
  | "volcBoostingTable"
  | "volcCorrectTable"
  | "baseUrl";
const TENCENT_FIELDS: CredentialField[] = ["appId", "secretId", "secretKey"];
const VOLCENGINE_FIELDS: CredentialField[] = [
  "volcAppId",
  "volcAccessToken",
  "volcBoostingTable",
  "volcCorrectTable",
];
const MINIMAX_FIELDS: CredentialField[] = ["apiKey", "baseUrl"];
const PROVIDERS = ["tencent", "dashscope", "volcengine", "minimax"] as const;
type Provider = (typeof PROVIDERS)[number];

// Mounted only after a fresh, user-scoped owner permission check succeeds.
export function VoicePanel() {
  const cache = useQueryClient();
  const { t } = useI18n();
  const mounted = useRef(false);
  const [config, setConfig] = useState<VoiceSettings | null>(null);
  const [provider, setProvider] = useState<Provider>("tencent");
  const [model, setModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [fields, setFields] = useState({
    appId: "",
    secretId: "",
    secretKey: "",
    apiKey: "",
    volcAppId: "",
    volcAccessToken: "",
    volcBoostingTable: "",
    volcCorrectTable: "",
    baseUrl: "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "test" | "delete" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Shared cache key: the account page prefetches it while the lazy chunk is
  // still downloading, so config often renders on the first paint.
  const settingsQuery = useQuery({
    queryKey: ["voice-settings"],
    queryFn: getVoiceSettings,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const value = settingsQuery.data;
    if (!value) return;
    setConfig(value);
    setProvider(value.provider ?? "tencent");
    setModel(value.model);
    setEnabled(value.enabled);
  }, [settingsQuery.data]);
  useEffect(() => {
    if (settingsQuery.isError) setMessage(t("voiceSettings.loadError"));
  }, [settingsQuery.isError, t]);

  // Environment credentials take precedence over anything saved here, so
  // editing the database copy while they are active would be misleading.
  const envManaged = config?.source === "environment";
  const editingDisabled =
    busy || envManaged || !config || (config.unreadable ?? false);

  async function run(
    action: "save" | "test" | "delete",
    task: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(true);
    setPendingAction(action);
    setMessage("");
    try {
      await task();
      if (!mounted.current) return;
      setFields({
        appId: "",
        secretId: "",
        secretKey: "",
        apiKey: "",
        volcAppId: "",
        volcAccessToken: "",
        volcBoostingTable: "",
        volcCorrectTable: "",
        baseUrl: "",
      });
      const value = await cache.fetchQuery({
        queryKey: ["voice-settings"],
        queryFn: getVoiceSettings,
        staleTime: 0,
      });
      if (!mounted.current) return;
      setConfig(value);
      setEnabled(value.enabled);
      setProvider(value.provider ?? "tencent");
      setModel(value.model);
      await cache.invalidateQueries({ queryKey: ["capture-status"] });
      setMessage(success);
      toast.success(success);
    } catch {
      if (!mounted.current) return;
      setMessage(t("voiceSettings.error"));
      toast.error(t("voiceSettings.error"));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setPendingAction(null);
      }
    }
  }

  const previewFor = (field: CredentialField) => {
    if (provider !== (config?.provider ?? provider)) return "";
    // Wire spells the MiniMax endpoint key `minimaxBaseUrl`; the panel state
    // key stays `baseUrl` (single mapping point, rollout §3.4).
    const wireField =
      field === "baseUrl" ? ("minimaxBaseUrl" as const) : field;
    return config?.previews?.[wireField] ?? "";
  };

  const fieldLabel = (field: CredentialField) => {
    if (provider === "minimax")
      return field === "apiKey"
        ? t("voiceSettings.minimaxApiKey")
        : t("voiceSettings.minimaxBaseUrl");
    // Minimax labels are handled above; the remaining credential fields map
    // 1:1 onto existing voiceSettings keys (baseUrl is minimax-only).
    return t(`voiceSettings.${field}` as TranslationKey);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("voiceSettings.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          {t("voiceSettings.description")} {t("voiceSettings.migration")}
        </p>
        {!config && settingsQuery.isPending && (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
        {config && (
          <>
            <p>
              {envManaged
                ? t("voiceSettings.envManaged")
                : config.configured
                  ? t("voiceSettings.configured")
                  : t("voiceSettings.unconfigured")}
            </p>
            {!config.canEncrypt && <p>{t("voiceSettings.plainStore")}</p>}
            {config.unreadable && <p>{t("voiceSettings.unreadable")}</p>}
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  "save",
                  () => {
                    const { baseUrl, ...rest } = fields;
                    return saveVoiceSettings({
                      revision: config.revision,
                      enabled,
                      credentials: {
                        provider,
                        model,
                        ...rest,
                        // Wire contract: minimax endpoint key (strict schema).
                        minimaxBaseUrl: baseUrl,
                      },
                    });
                  },
                  t("voiceSettings.saved"),
                );
              }}
            >
              <div className="flex flex-col gap-1.5 text-sm font-medium">
                <span>{t("voiceSettings.provider")}</span>
                <ToggleGroup
                  variant="outline"
                  value={provider ? [provider] : []}
                  disabled={editingDisabled}
                  onValueChange={(values) => {
                    if (values.length === 0) return;
                    setProvider(values[values.length - 1] as Provider);
                    setModel("");
                    setFields({
                      appId: "",
                      secretId: "",
                      secretKey: "",
                      apiKey: "",
                      volcAppId: "",
                      volcAccessToken: "",
                      volcBoostingTable: "",
                      volcCorrectTable: "",
                      baseUrl: "",
                    });
                  }}
                >
                  <ToggleGroupItem value="tencent">
                    {t("voiceSettings.tencent")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="dashscope">DashScope</ToggleGroupItem>
                  <ToggleGroupItem value="volcengine">
                    {t("voiceSettings.volcengine")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="minimax">
                    {t("voiceSettings.minimax")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="voice-model"
              >
                {t("voiceSettings.model")}
                <Input
                  autoComplete="off"
                  disabled={editingDisabled}
                  id="voice-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </label>
              {(provider === "tencent"
                ? TENCENT_FIELDS
                : provider === "volcengine"
                  ? VOLCENGINE_FIELDS
                  : provider === "minimax"
                    ? MINIMAX_FIELDS
                    : (["apiKey"] as const)
              ).map((field) => (
                <label
                  className="flex flex-col gap-1.5 text-sm font-medium"
                  key={field}
                  htmlFor={`voice-${field}`}
                >
                  {fieldLabel(field)}
                  <Input
                    autoComplete={field === "baseUrl" ? "off" : "new-password"}
                    disabled={editingDisabled}
                    id={`voice-${field}`}
                    placeholder={previewFor(field)}
                    type={field === "baseUrl" ? "text" : "password"}
                    value={fields[field]}
                    onChange={(event) =>
                      setFields({ ...fields, [field]: event.target.value })
                    }
                  />
                </label>
              ))}
              <div className="flex items-center gap-2">
                <Switch
                  checked={enabled}
                  disabled={editingDisabled}
                  id="voice-enabled"
                  onCheckedChange={setEnabled}
                />
                <label className="text-sm font-medium" htmlFor="voice-enabled">
                  {t("voiceSettings.enabled")}
                </label>
              </div>
              <Button disabled={editingDisabled} type="submit">
                {pendingAction === "save" && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("voiceSettings.save")}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground">
              {t("voiceSettings.testWarning")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || !config.enabled || !config.configured}
                onClick={() =>
                  void run(
                    "test",
                    testVoiceSettings,
                    t("voiceSettings.testSuccess"),
                  )
                }
              >
                {pendingAction === "test" && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("voiceSettings.test")}
              </Button>
              <Button
                variant="destructive"
                disabled={busy || !config.revision}
                onClick={() => setConfirmDelete(true)}
              >
                {t("voiceSettings.delete")}
              </Button>
            </div>
          </>
        )}
        <p role="status">{message}</p>
        <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("voiceSettings.delete")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("voiceSettings.confirmDelete")}
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
                      () => deleteVoiceSettings(config.revision),
                      t("voiceSettings.deleted"),
                    );
                }}
              >
                {t("voiceSettings.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

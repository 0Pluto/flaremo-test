import {
  type BundledShareCard,
  listBundledPluginsSorted,
  type PluginTier,
  resolveOptionValues,
  type ShareCardOptionValue,
} from "@flaremo/plugins";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  StarIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getAdminPluginSettings,
  type PluginSettings,
  updateAdminPluginSettings,
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";

/**
 * Owner-side plugin panel. The plugin registry lives in the frontend bundle
 * (`@flaremo/plugins`); this card edits the instance configuration the server
 * stores: which plugins are enabled/disabled, and — per share-card
 * contribution — visibility, order, the default card, and option values.
 * Official plugins default on, community plugins default off; enabling a
 * community plugin here is the only path that makes it visible to users.
 */

type CardEntry = { card: BundledShareCard; pluginId: string; tier: PluginTier };

function pluginLabel(
  plugin: { manifest: { name: Record<string, string>; id: string } },
  locale: string,
): string {
  return (
    plugin.manifest.name[locale] ??
    plugin.manifest.name["en-US"] ??
    Object.values(plugin.manifest.name)[0] ??
    plugin.manifest.id
  );
}

function cardLabel(card: BundledShareCard, locale: string): string {
  return card.name[locale] ?? card.name["en-US"] ?? Object.values(card.name)[0] ?? card.id;
}

export function PluginsCard() {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin-plugins"],
    queryFn: getAdminPluginSettings,
    retry: false,
  });
  const [draft, setDraft] = useState<PluginSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const plugins = useMemo(() => listBundledPluginsSorted(), []);
  const entries: CardEntry[] = useMemo(
    () =>
      plugins.flatMap((plugin) =>
        plugin.cards.map((card) => ({
          card,
          pluginId: plugin.manifest.id,
          tier: plugin.tier,
        })),
      ),
    [plugins],
  );

  const saveMutation = useMutation({
    mutationFn: (next: PluginSettings) =>
      updateAdminPluginSettings({
        enabledPlugins: next.enabledPlugins,
        disabledPlugins: next.disabledPlugins,
        cards: {
          order: next.cards.order,
          hidden: next.cards.hidden,
          default: next.cards.default,
          options: next.cards.options,
        },
      }),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.setQueryData(["admin-plugins"], saved);
      void queryClient.invalidateQueries({ queryKey: ["plugin-settings"] });
      toast.success(t("admin.plugins.saved"));
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.plugins.failed"))),
  });

  const persist = (next: PluginSettings) => {
    setDraft(next);
    saveMutation.mutate(next);
  };

  if (!draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.plugins.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {t("admin.plugins.loading")}
          </div>
        </CardContent>
      </Card>
    );
  }

  const enabledSet = new Set(draft.enabledPlugins);
  const disabledSet = new Set(draft.disabledPlugins);
  const hiddenSet = new Set(draft.cards.hidden);

  const pluginEnabled = (plugin: (typeof plugins)[number]) =>
    enabledSet.has(plugin.manifest.id)
      ? true
      : disabledSet.has(plugin.manifest.id)
        ? false
        : (plugin.manifest.defaultEnabled ?? plugin.tier === "official");

  const togglePlugin = (plugin: (typeof plugins)[number], on: boolean) => {
    const next: PluginSettings = {
      ...draft,
      enabledPlugins: draft.enabledPlugins.filter(
        (id) => id !== plugin.manifest.id,
      ),
      disabledPlugins: draft.disabledPlugins.filter(
        (id) => id !== plugin.manifest.id,
      ),
    };
    if (on) {
      next.enabledPlugins.push(plugin.manifest.id);
    } else {
      next.disabledPlugins.push(plugin.manifest.id);
    }
    persist(next);
  };

  const moveCard = (cardId: string, direction: -1 | 1) => {
    const visibleIds = entries
      .filter((entry) => !hiddenSet.has(entry.card.id))
      .map((entry) => entry.card.id);
    const order = [...draft.cards.order];
    // Materialize the current visible order first so partially-ordered
    // settings swap correctly, then swap neighbors.
    const base = [
      ...order.filter((id) => visibleIds.includes(id)),
      ...visibleIds.filter((id) => !order.includes(id)),
    ];
    const index = base.indexOf(cardId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= base.length) return;
    const nextBase = [...base];
    const [moved] = nextBase.splice(index, 1);
    nextBase.splice(target, 0, moved as string);
    persist({
      ...draft,
      cards: { ...draft.cards, order: nextBase },
    });
  };

  const toggleHidden = (cardId: string) => {
    const hidden = hiddenSet.has(cardId)
      ? draft.cards.hidden.filter((id) => id !== cardId)
      : [...draft.cards.hidden, cardId];
    const isDefault = draft.cards.default === cardId && hidden.includes(cardId);
    persist({
      ...draft,
      cards: {
        ...draft.cards,
        hidden,
        default: isDefault ? null : draft.cards.default,
      },
    });
  };

  const setDefault = (cardId: string) => {
    persist({
      ...draft,
      cards: {
        ...draft.cards,
        default: draft.cards.default === cardId ? null : cardId,
      },
    });
  };

  const setOption = (cardId: string, key: string, value: ShareCardOptionValue) => {
    const cardOptions = { ...(draft.cards.options[cardId] ?? {}) };
    cardOptions[key] = value;
    persist({
      ...draft,
      cards: {
        ...draft.cards,
        options: { ...draft.cards.options, [cardId]: cardOptions },
      },
    });
  };

  const orderedEntries = (() => {
    const orderIndex = new Map(
      draft.cards.order.map((id, index) => [id, index] as const),
    );
    const registryIndex = new Map(
      entries.map((entry, index) => [entry.card.id, index] as const),
    );
    return [...entries].sort((a, b) => {
      const aOrder = orderIndex.get(a.card.id);
      const bOrder = orderIndex.get(b.card.id);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return (
        (registryIndex.get(a.card.id) ?? 0) -
        (registryIndex.get(b.card.id) ?? 0)
      );
    });
  })();

  const isSaving = saveMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.plugins.title")}</CardTitle>
        <CardDescription>{t("admin.plugins.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("admin.plugins.plugins")}</p>
          {plugins.map((plugin) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              key={plugin.manifest.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {pluginLabel(plugin, locale)}
                  </p>
                  <Badge variant="secondary">
                    {t(
                      plugin.tier === "official"
                        ? "admin.plugins.tierOfficial"
                        : "admin.plugins.tierCommunity",
                    )}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {t("admin.plugins.cardCount", {
                    count: plugin.cards.length,
                  })}{" "}
                  · v{plugin.manifest.version}
                </p>
              </div>
              <Switch
                checked={pluginEnabled(plugin)}
                disabled={isSaving}
                onCheckedChange={(checked) => togglePlugin(plugin, checked)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("admin.plugins.cards")}</p>
          {orderedEntries.map((entry, _index, all) => {
            const { card, pluginId } = entry;
            const plugin = plugins.find(
              (candidate) => candidate.manifest.id === pluginId,
            );
            const reachable = plugin ? pluginEnabled(plugin) : false;
            const hidden = hiddenSet.has(card.id);
            const isDefault = draft.cards.default === card.id;
            const options = resolveOptionValues(
              card.options,
              draft.cards.options[card.id],
            );
            const visibleEntries = all.filter(
              (candidate) => !hiddenSet.has(candidate.card.id),
            );
            const visibleIndex = visibleEntries.findIndex(
              (candidate) => candidate.card.id === card.id,
            );
            return (
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-lg border px-3 py-3",
                  !reachable && "opacity-60",
                )}
                key={card.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {cardLabel(card, locale)}
                      </p>
                      <Badge variant="outline">
                        {t(
                          card.kind === "sandbox"
                            ? "admin.plugins.kindSandbox"
                            : "admin.plugins.kindDocument",
                        )}
                      </Badge>
                      {isDefault && (
                        <Badge>{t("admin.plugins.defaultBadge")}</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {plugin ? pluginLabel(plugin, locale) : card.pluginId}
                      {!reachable && ` · ${t("admin.plugins.pluginOff")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      aria-label={t("admin.plugins.moveUp")}
                      disabled={isSaving || hidden || visibleIndex <= 0}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => moveCard(card.id, -1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      aria-label={t("admin.plugins.moveDown")}
                      disabled={
                        isSaving ||
                        hidden ||
                        visibleIndex === -1 ||
                        visibleIndex >= visibleEntries.length - 1
                      }
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => moveCard(card.id, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      aria-label={t("admin.plugins.setDefault")}
                      disabled={isSaving || hidden}
                      size="icon-sm"
                      type="button"
                      variant={isDefault ? "secondary" : "ghost"}
                      onClick={() => setDefault(card.id)}
                    >
                      <StarIcon />
                    </Button>
                    <Button
                      aria-label={
                        hidden
                          ? t("admin.plugins.show")
                          : t("admin.plugins.hide")
                      }
                      disabled={isSaving}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => toggleHidden(card.id)}
                    >
                      {hidden ? <EyeOffIcon /> : <EyeIcon />}
                    </Button>
                  </div>
                </div>
                {card.options && card.options.length > 0 && (
                  <div className="flex flex-col gap-2 border-t pt-3">
                    {card.options.map((spec) => {
                      const value = options[spec.key];
                      return (
                        <div
                          className="flex items-center justify-between gap-3"
                          key={spec.key}
                        >
                          <span className="text-xs text-muted-foreground">
                            {spec.label[locale] ??
                              spec.label["en-US"] ??
                              Object.values(spec.label)[0] ??
                              spec.key}
                          </span>
                          {spec.type === "boolean" && (
                            <Switch
                              checked={value === true}
                              disabled={isSaving}
                              onCheckedChange={(checked) =>
                                setOption(card.id, spec.key, checked)
                              }
                            />
                          )}
                          {spec.type === "text" && (
                            <Input
                              className="h-7 w-44"
                              disabled={isSaving}
                              maxLength={spec.maxLength ?? 500}
                              value={typeof value === "string" ? value : ""}
                              onChange={(event) =>
                                setOption(card.id, spec.key, event.target.value)
                              }
                            />
                          )}
                          {spec.type === "color" && (
                            <input
                              className="size-7 cursor-pointer rounded border bg-transparent"
                              disabled={isSaving}
                              type="color"
                              value={
                                typeof value === "string" ? value : "#000000"
                              }
                              onChange={(event) =>
                                setOption(card.id, spec.key, event.target.value)
                              }
                            />
                          )}
                          {spec.type === "number" && (
                            <Input
                              className="h-7 w-24"
                              disabled={isSaving}
                              max={spec.max}
                              min={spec.min}
                              step={spec.step}
                              type="number"
                              value={typeof value === "number" ? value : 0}
                              onChange={(event) =>
                                setOption(
                                  card.id,
                                  spec.key,
                                  Number(event.target.value),
                                )
                              }
                            />
                          )}
                          {spec.type === "enum" && (
                            <select
                              className="h-7 rounded-md border bg-transparent px-2 text-xs"
                              disabled={isSaving}
                              value={typeof value === "string" ? value : ""}
                              onChange={(event) =>
                                setOption(card.id, spec.key, event.target.value)
                              }
                            >
                              {spec.choices.map((choice) => (
                                <option key={choice.value} value={choice.value}>
                                  {choice.label[locale] ??
                                    choice.label["en-US"] ??
                                    choice.value}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import {
  type BundledShareCard,
  listBundledPluginsSorted,
  resolveOptionValues,
} from "@flaremo/plugins";
import { toPng } from "html-to-image";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Memo } from "@/api";
import { getMemoStats } from "@/api";
import { useBranding } from "@/branding";
import { ShareCardDocumentView } from "@/components/share-card-document";
import {
  ShareCardSandboxHost,
  type ShareCardSandboxHandle,
} from "@/components/share-card-sandbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type TranslationKey, useI18n } from "@/i18n";
import { formatMemoTime } from "@/lib/memo";
import { cn } from "@/lib/utils";

/**
 * The "output" half of sharing (flomo's 生成分享图片): turn one memo into a
 * card image. Cards come from the plugin registry (`@flaremo/plugins`):
 * `document` cards render in-app from data; `sandbox` cards run in an
 * opaque-origin iframe and hand back a PNG. Permission lives in the ⋯
 * visibility submenu — this dialog only renders and exports.
 */

type ShareImageDialogProps = {
  memo: Memo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Card-image body: markdown flattened to the text a picture should carry. */
function shareBodyText(content: string) {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^- \[[ xX]\] /gm, "☐ ")
    .replace(/^#{1,3} /gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/**
 * Free-text label a template picker shows. Contributions carry their own
 * localized table; `labelKey` is the legacy fallback for card ids that shipped
 * with core i18n keys before the plugin platform.
 */
const LEGACY_TEMPLATE_LABEL_KEYS: Record<string, TranslationKey> = {
  plain: "share.template.plain",
  daily: "share.template.daily",
  ticket: "share.template.ticket",
};

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function resolveCardLabel(
  card: BundledShareCard,
  locale: string,
  t: (key: TranslationKey) => string,
): string {
  const localized = card.name[locale] ??
    card.name["en-US"] ??
    Object.values(card.name)[0];
  if (localized) return localized;
  const legacyKey = LEGACY_TEMPLATE_LABEL_KEYS[card.id];
  return legacyKey ? t(legacyKey) : card.id;
}

/** Bundled cards that exist unless instance settings say otherwise. */
export function bundledCards(): BundledShareCard[] {
  return listBundledPluginsSorted().flatMap((plugin) => {
    const defaultEnabled =
      plugin.manifest.defaultEnabled ?? plugin.tier === "official";
    return defaultEnabled ? plugin.cards : [];
  });
}

export function ShareImageDialog({
  memo,
  open,
  onOpenChange,
}: ShareImageDialogProps) {
  const { locale, t } = useI18n();
  const branding = useBranding();
  const dark = useDarkMode();
  const cards = useMemo(() => bundledCards(), []);
  const [templateId, setTemplateId] = useState(() => cards[0]?.id ?? "");
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const sandboxRef = useRef<ShareCardSandboxHandle>(null);
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const statsQuery = useQuery({
    queryKey: ["memo-stats", timeZone, "all"],
    queryFn: () => getMemoStats(timeZone),
    enabled: open,
    staleTime: 60_000,
  });

  // The active card can disappear when the template list changes (plugin
  // disabled); fall back to the first available card.
  const card = cards.find((candidate) => candidate.id === templateId) ?? cards[0];

  const date = formatMemoTime(memo.display_time, locale);
  const day = useMemo(() => {
    const parsed = new Date(memo.display_time);
    return Number.isNaN(parsed.getTime()) ? "" : String(parsed.getDate());
  }, [memo.display_time]);
  const body = useMemo(() => shareBodyText(memo.content), [memo.content]);
  // The card shows real account stats, so while the query is in flight the
  // stats line stays blank rather than flashing "0 memos · 0 days" — and the
  // export button stays disabled so an early export cannot bake zeros into
  // the image.
  const stats =
    statsQuery.isPending || statsQuery.isError
      ? ""
      : t("share.imageStats", {
          count: statsQuery.data.counts.total,
          days: statsQuery.data.active_days,
        });

  const cardData = useMemo(
    () => ({
      body,
      date,
      day,
      stats,
      locale,
      brand: {
        product: branding.product,
        markLight: branding.markLightUrl,
        markDark: branding.markDarkUrl,
      },
    }),
    [body, branding, date, day, locale, stats],
  );

  const optionValues = useMemo(
    () => resolveOptionValues(card?.options, undefined),
    [card?.options],
  );

  const exportImage = async () => {
    if (!card) return;
    setIsExporting(true);
    try {
      let dataUrl: string | null = null;
      if (card.payload.kind === "sandbox") {
        dataUrl = await sandboxRef.current?.exportPng() ?? null;
        if (!dataUrl) toast.error(t("share.exportFailed"));
      } else {
        const node = previewRef.current;
        if (node) {
          dataUrl = await toPng(node, { pixelRatio: 2 });
        }
      }
      if (!dataUrl) return;
      const anchor = document.createElement("a");
      anchor.download = `flaremo-${memo.id}.png`;
      anchor.href = dataUrl;
      anchor.click();
    } catch {
      toast.error(t("share.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const size = card?.size ?? { width: 340, height: 420 };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("share.imageTitle")}</DialogTitle>
          <DialogDescription>{t("share.imageSubtitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          {card?.payload.kind === "document" && (
            <div ref={previewRef}>
              <ShareCardDocumentView
                context={{
                  data: cardData,
                  options: optionValues,
                  mode: dark ? "dark" : "light",
                }}
                document={card.payload.document}
                height={size.height}
                mode={dark ? "dark" : "light"}
                width={size.width}
              />
            </div>
          )}
          {card?.payload.kind === "sandbox" && (
            <ShareCardSandboxHost
              height={size.height}
              html={card.payload.html}
              payload={{
                data: cardData,
                mode: dark ? "dark" : "light",
                options: optionValues,
              }}
              ref={sandboxRef}
              width={size.width}
            />
          )}
        </div>
        <fieldset
          aria-label={t("share.templateLabel")}
          className="flex flex-wrap justify-center gap-1.5 border-0 p-0"
        >
          {cards.map((item) => (
            <button
              aria-pressed={card?.id === item.id}
              className={cn(
                "rounded-md px-3 py-1 text-xs motion-safe:transition-colors",
                card?.id === item.id
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              key={item.id}
              type="button"
              onClick={() => setTemplateId(item.id)}
            >
              {resolveCardLabel(item, locale, t)}
            </button>
          ))}
        </fieldset>
        <DialogFooter>
          <Button
            className="w-full sm:w-auto"
            disabled={isExporting || statsQuery.isPending || !card}
            onClick={() => void exportImage()}
            type="button"
            variant="brand"
          >
            {isExporting ? (
              <Loader2Icon
                className="motion-safe:animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            {isExporting ? t("share.exporting") : t("share.exportImage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

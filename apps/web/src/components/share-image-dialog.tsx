import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Memo } from "@/api";
import { getMemoStats } from "@/api";
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
 * card image. Permission lives in the ⋯ visibility submenu — this dialog only
 * renders and exports, it never changes who can see the note.
 */

type ShareImageDialogProps = {
  memo: Memo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TemplateId = "plain" | "daily" | "ticket";

const TEMPLATES: Array<{ id: TemplateId; labelKey: TranslationKey }> = [
  { id: "plain", labelKey: "share.template.plain" },
  { id: "daily", labelKey: "share.template.daily" },
  { id: "ticket", labelKey: "share.template.ticket" },
];

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

type CardProps = {
  date: string;
  day: string;
  body: string;
  stats: string;
};

/** 素白: the note on bare white, one quiet brand mark. */
function PlainCard({ date, body, stats }: CardProps) {
  return (
    <div className="flex h-[420px] w-[340px] flex-col rounded-lg bg-white p-7 text-neutral-800 shadow-sm dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-400 dark:text-neutral-500">
          {date}
        </span>
        <span className="font-heading text-sm font-semibold text-brand-500 dark:text-brand-400">
          FlareMo
        </span>
      </div>
      <div className="mt-7 min-h-0 flex-1 overflow-hidden text-[15px] leading-7 whitespace-pre-wrap">
        {body}
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span className="text-xs tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          {stats}
        </span>
        <PixelDots />
      </div>
    </div>
  );
}

/** 日签: the date as the hero, the note beneath, a stamp-like sign-off. */
function DailyCard({ date, day, body, stats }: CardProps) {
  return (
    <div className="flex h-[420px] w-[340px] flex-col rounded-lg bg-brand-50 p-7 text-brand-950 shadow-sm dark:bg-brand-950 dark:text-brand-50">
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-5xl leading-none font-semibold">
          {day}
        </span>
        <span className="text-xs text-brand-700/70 dark:text-brand-200/60">
          {date}
        </span>
      </div>
      <div className="mt-6 min-h-0 flex-1 overflow-hidden text-[15px] leading-7 whitespace-pre-wrap">
        {body}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-brand-700/70 dark:text-brand-200/60">
          {stats}
        </span>
        <span className="flex size-7 items-center justify-center rounded bg-brand-500 font-heading text-xs font-semibold text-white">
          F
        </span>
      </div>
    </div>
  );
}

/** 票根: a keepsake ticket — framed, perforated, with a barcode strip. */
function TicketCard({ date, body, stats }: CardProps) {
  return (
    <div className="flex h-[420px] w-[340px] flex-col rounded-lg border border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-7 py-4 dark:border-neutral-800">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {date}
        </span>
        <span className="font-heading text-xs font-semibold text-neutral-400 dark:text-neutral-500">
          FlareMo
        </span>
      </div>
      <div className="relative">
        <div className="mx-7 border-t border-dashed border-neutral-300 dark:border-neutral-700" />
        <span className="absolute top-1/2 -left-2 size-4 -translate-y-1/2 rounded-full bg-white dark:bg-neutral-900" />
        <span className="absolute top-1/2 -right-2 size-4 -translate-y-1/2 rounded-full bg-white dark:bg-neutral-900" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-7 text-[15px] leading-7 text-neutral-800 whitespace-pre-wrap dark:text-neutral-100">
        {body}
      </div>
      <div className="flex items-end justify-between px-7 pb-5">
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {stats}
        </span>
        <span
          aria-hidden="true"
          className="h-6 w-24"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px)",
            color: "currentColor",
            opacity: 0.35,
          }}
        />
      </div>
    </div>
  );
}

/** Deterministic pixel cluster (flomo's dot-matrix nod, no RNG flicker). */
function PixelDots() {
  const lit = new Set([4, 7, 10, 11, 13]);
  return (
    <span aria-hidden="true" className="grid grid-cols-5 gap-0.5">
      {Array.from({ length: 15 }, (_, index) => `dot-${index}`).map((key) => (
        <span
          className={cn(
            "size-1 rounded-[1px]",
            lit.has(Number(key.slice(4)))
              ? "bg-brand-400/70 dark:bg-brand-500/70"
              : "bg-neutral-200 dark:bg-neutral-700",
          )}
          key={key}
        />
      ))}
    </span>
  );
}

export function ShareImageDialog({
  memo,
  open,
  onOpenChange,
}: ShareImageDialogProps) {
  const { locale, t } = useI18n();
  const [template, setTemplate] = useState<TemplateId>("plain");
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const statsQuery = useQuery({
    queryKey: ["memo-stats", timeZone, "all"],
    queryFn: () => getMemoStats(timeZone),
    enabled: open,
    staleTime: 60_000,
  });
  const date = formatMemoTime(memo.display_time, locale);
  const day = useMemo(() => {
    const parsed = new Date(memo.display_time);
    return Number.isNaN(parsed.getTime()) ? "" : String(parsed.getDate());
  }, [memo.display_time]);
  const body = useMemo(() => shareBodyText(memo.content), [memo.content]);
  const stats = t("share.imageStats", {
    count: statsQuery.data?.counts.total ?? 0,
    days: statsQuery.data?.active_days ?? 0,
  });

  const exportImage = async () => {
    const node = previewRef.current;
    if (!node) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2 });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("share.imageTitle")}</DialogTitle>
          <DialogDescription>{t("share.imageSubtitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          <div ref={previewRef}>
            {template === "plain" && (
              <PlainCard body={body} date={date} day={day} stats={stats} />
            )}
            {template === "daily" && (
              <DailyCard body={body} date={date} day={day} stats={stats} />
            )}
            {template === "ticket" && (
              <TicketCard body={body} date={date} day={day} stats={stats} />
            )}
          </div>
        </div>
        <fieldset
          aria-label={t("share.templateLabel")}
          className="flex justify-center gap-1.5 border-0 p-0"
        >
          {TEMPLATES.map((item) => (
            <button
              aria-pressed={template === item.id}
              className={cn(
                "rounded-md px-3 py-1 text-xs motion-safe:transition-colors",
                template === item.id
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              key={item.id}
              type="button"
              onClick={() => setTemplate(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </fieldset>
        <DialogFooter>
          <Button
            className="w-full sm:w-auto"
            disabled={isExporting}
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

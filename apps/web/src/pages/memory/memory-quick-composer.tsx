import { useMutation } from "@tanstack/react-query";
import { CornerDownLeftIcon, PinIcon } from "lucide-react";
import { type KeyboardEvent, type RefObject, useState } from "react";
import { toast } from "sonner";
import { createMemory } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";

export function MemoryQuickComposer({
  onCreated,
  inputRef,
}: {
  onCreated: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(true);

  const createMutation = useMutation({
    mutationFn: (text: string) =>
      createMemory({
        content: text.trim(),
        type: "semantic",
        kind: "preference",
        scope_type: "global",
        tier: pinned ? "core" : "normal",
        importance: pinned ? 80 : 50,
        lock: pinned,
      }),
    onSuccess: () => {
      toast.success(
        pinned ? t("toast.memoryPinned") : t("toast.memoryConfirmed"),
      );
      setContent("");
      onCreated();
    },
    onError: (error) => {
      toast.error(errorMessage(error, t("memory.createFailed")));
    },
  });

  const handleSubmit = () => {
    const text = content.trim();
    if (!text || createMutation.isPending) return;
    createMutation.mutate(text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative flex items-center gap-1.5 rounded-xl border border-border/80 bg-card p-1.5 shadow-2xs motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150 focus-within:border-brand-500/80 focus-within:ring-2 focus-within:ring-brand-500/15">
      <Input
        ref={inputRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("memory.quickAddPlaceholder")}
        disabled={createMutation.isPending}
        className="h-9 border-0 bg-transparent px-2.5 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/70"
      />
      <button
        type="button"
        title={t("memory.quickAddPinned")}
        aria-pressed={pinned}
        onClick={() => setPinned(!pinned)}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium motion-safe:transition-colors",
          pinned
            ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
            : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
        )}
      >
        <PinIcon className={cn("size-3.5", pinned && "fill-current")} />
        <span className="hidden sm:inline">{t("memory.quickAddPinned")}</span>
      </button>
      <Button
        size="icon-sm"
        disabled={!content.trim() || createMutation.isPending}
        onClick={handleSubmit}
        className="size-8 shrink-0 rounded-lg"
      >
        <CornerDownLeftIcon className="size-3.5" />
      </Button>
    </div>
  );
}

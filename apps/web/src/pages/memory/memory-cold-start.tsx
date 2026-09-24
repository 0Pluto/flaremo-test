import { useMutation } from "@tanstack/react-query";
import { PlusIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { createMemory } from "@/api";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";

export function MemoryColdStart({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();

  const createMutation = useMutation({
    mutationFn: (text: string) =>
      createMemory({
        content: text,
        type: "semantic",
        kind: "preference",
        scope_type: "global",
        tier: "core",
        importance: 80,
        lock: true,
      }),
    onSuccess: () => {
      toast.success(t("toast.memoryPinned"));
      onCreated();
    },
    onError: (error) => {
      toast.error(errorMessage(error, t("memory.createFailed")));
    },
  });

  const suggestions = [
    t("memory.coldStart1"),
    t("memory.coldStart2"),
    t("memory.coldStart3"),
  ];

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/15 p-6 text-center sm:p-8">
      <div className="flex size-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
        <SparklesIcon className="size-5" />
      </div>
      <h3 className="mt-3 font-semibold text-sm text-foreground">
        {t("memory.emptyTitle")}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {t("memory.emptyDescription")}
      </p>

      <div className="mt-5 flex w-full max-w-md flex-col gap-2">
        <p className="text-left font-medium text-xs text-muted-foreground/80">
          {t("memory.coldStartTitle")}
        </p>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate(suggestion)}
            className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-3 text-left text-xs motion-safe:transition-all hover:border-brand-500/60 hover:bg-muted/40 hover:shadow-2xs active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 truncate pr-2 text-foreground/90">
              {suggestion}
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-brand-500 group-hover:text-primary-foreground motion-safe:transition-colors">
              <PlusIcon className="size-3.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

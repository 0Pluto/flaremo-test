import { useQueryClient } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createMemo } from "@/api";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";

/**
 * The day panel's inline quick note. The draft deliberately outlives a close
 * and reopen (the caller only toggles `open`), matching the previous inline
 * behaviour; a successful submit clears it. Mounting is conditional inside so
 * the entrance animation still runs on every reopen.
 */
export function QuickNoteComposer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);

  const submitQuickNote = async () => {
    const value = quickNoteContent.trim();
    if (!value) return;
    setCreatingNote(true);
    try {
      await createMemo({
        content: value,
        visibility: "private",
        source: "web",
      });
      setQuickNoteContent("");
      onClose();
      toast.success(t("calendar.noteCreated"));
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    } finally {
      setCreatingNote(false);
    }
  };

  if (!open) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 p-3 motion-safe:animate-rise">
      <textarea
        className="w-full resize-none rounded-md border border-border/60 bg-background p-2 text-xs leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-brand-500"
        disabled={creatingNote}
        placeholder={t("calendar.quickNotePlaceholder")}
        rows={3}
        value={quickNoteContent}
        onChange={(e) => setQuickNoteContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submitQuickNote();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          size="xs"
          type="button"
          variant="ghost"
          onClick={() => onClose()}
        >
          {t("common.cancel")}
        </Button>
        <Button
          disabled={creatingNote || !quickNoteContent.trim()}
          size="xs"
          type="button"
          onClick={() => void submitQuickNote()}
        >
          <SendIcon className="size-3" />
          {t("calendar.createNote")}
        </Button>
      </div>
    </div>
  );
}

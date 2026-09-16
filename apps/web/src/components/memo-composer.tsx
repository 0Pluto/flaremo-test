import {
  HashIcon,
  ImageIcon,
  ListIcon,
  ListTodoIcon,
  Loader2Icon,
  LockIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { getCaptureStatus, type MemoVisibility, uploadAttachment } from "@/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { CaptureController } from "@/lib/audio-capture/controller";
import { openMicrophone } from "@/lib/audio-capture/microphone";
import { joinFinalSentences } from "@/lib/audio-capture/plain-text";
import {
  extractImageFiles,
  inlineImageMarkdown,
  insertSnippetAt,
} from "@/lib/image-insert";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";
import { extractTags } from "@/lib/memo";
import {
  type ActiveTagToken,
  extractActiveTagToken,
  filterTagSuggestions,
  type TagSuggestion,
} from "@/lib/tag-autocomplete";

type MemoComposerProps = {
  draft: MemoCaptureInput;
  isPending: boolean;
  /** Rendered only when the viewer holds a team membership. */
  showVisibility?: boolean;
  /** Known tags with usage counts, powering the "#" autocomplete. */
  tags?: TagSuggestion[];
  /** Streaming ASR is configured on the instance. */
  captureAvailable?: boolean;
  onDraftChange: (draft: MemoCaptureInput) => void;
  onSubmit: (input: MemoCaptureInput) => Promise<void>;
  onVisibilityChange?: (visibility: MemoVisibility) => void;
};

const fileKeys = new WeakMap<File, string>();
let nextFileKey = 0;

function formatVoiceClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getFileKey(file: File) {
  const existing = fileKeys.get(file);
  if (existing) return existing;

  const key = `file-${nextFileKey}`;
  nextFileKey += 1;
  fileKeys.set(file, key);
  return key;
}

export function MemoComposer({
  draft,
  isPending,
  showVisibility = false,
  tags,
  captureAvailable = false,
  onDraftChange,
  onSubmit,
  onVisibilityChange,
}: MemoComposerProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = Boolean(draft.content.trim() || draft.files.length > 0);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  // "#" autocomplete: the in-progress tag token under the caret plus the
  // highlighted row. Highlight resets whenever the token changes.
  const [activeTagToken, setActiveTagToken] = useState<ActiveTagToken | null>(
    null,
  );
  const [tagHighlight, setTagHighlight] = useState(0);
  // Caret to restore after an accepted suggestion rewrites the content.
  const pendingCaretRef = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset keys are the token identity, not values the effect reads.
  useEffect(() => {
    setTagHighlight(0);
  }, [activeTagToken?.start, activeTagToken?.token]);

  // Quick voice capture: one shared streaming-ASR session per composer.
  // The controller persists with the composer (workspace filters keep it
  // mounted) so a draft survives a visit to the archive or trash.
  const [captureController] = useState(
    () =>
      new CaptureController({
        microphone: openMicrophone,
        status: getCaptureStatus,
        socket: () =>
          new WebSocket(
            `${location.origin.replace(/^http/, "ws")}/api/app/capture/ws`,
          ),
      }),
  );
  const capture = useSyncExternalStore(
    captureController.subscribe,
    captureController.getSnapshot,
  );
  const voiceActive = capture.state !== "idle" && capture.state !== "error";
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!voiceActive) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [voiceActive]);
  useEffect(() => () => captureController.dispose(), [captureController]);
  // Uploads read the latest draft through a ref: the async chain would
  // otherwise insert into a stale closure while the user keeps typing.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pendingUploadsRef = useRef(0);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  // Inline markdown per preuploaded attachment, so a content edit can tell
  // which references were deleted and prune the bind list (otherwise a
  // deleted image would be re-bound on submit).
  const preuploadMarkdownRef = useRef(new Map<string, string>());

  // Pasted/dropped images upload immediately (unbound; the send flow claims
  // them afterwards) and their references land at the recorded caret once the
  // upload settles. Tasks chain so two rapid pastes never drift positions.
  const enqueueInlineUploads = (files: File[], caret: number) => {
    if (files.length === 0) return;
    pendingUploadsRef.current += files.length;
    setIsUploadingImages(true);
    uploadChainRef.current = uploadChainRef.current
      .catch(() => undefined)
      .then(async () => {
        let cursor = caret;
        try {
          for (const file of files) {
            let attachment: Awaited<ReturnType<typeof uploadAttachment>>;
            try {
              attachment = await uploadAttachment({ file });
            } catch {
              toast.error(t("composer.imageUploadFailed"));
              break;
            }
            // Read after the upload: the user may have kept typing while the
            // network was pending. Never replace that text with an old draft.
            const current = draftRef.current;
            const next = insertSnippetAt(
              current.content,
              cursor,
              inlineImageMarkdown(attachment.id, attachment.filename),
            );
            cursor = next.caret;
            const markdown = inlineImageMarkdown(
              attachment.id,
              attachment.filename,
            );
            preuploadMarkdownRef.current.set(attachment.name, markdown);
            const nextDraft = {
              ...current,
              content: next.content,
              tags: extractTags(next.content),
              preuploadedAttachmentNames: [
                ...(current.preuploadedAttachmentNames ?? []),
                attachment.name,
              ],
            };
            draftRef.current = nextDraft;
            onDraftChange(nextDraft);
          }
        } finally {
          // A failed batch also releases the files skipped after the failure.
          pendingUploadsRef.current -= files.length;
          setIsUploadingImages(pendingUploadsRef.current > 0);
        }
      });
  };

  // The composer grows with the draft instead of scrolling, up to a cap.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure the height whenever the draft text changes.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
    // An accepted suggestion rewrites the text; put the caret past "#tag ".
    const caret = pendingCaretRef.current;
    if (caret != null) {
      pendingCaretRef.current = null;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    }
  }, [draft.content]);

  const tagSuggestions =
    tags && activeTagToken
      ? filterTagSuggestions(tags, activeTagToken.token)
      : [];
  const showTagSuggestions = tagSuggestions.length > 0 && !isPending;

  // All edits rebuild from draftRef, not the render-time prop: an inline
  // upload chain can land between the render and this event, and building
  // from the old prop would silently drop the chain's inserted markdown.
  const commitDraft = (patch: Partial<MemoCaptureInput>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    onDraftChange(next);
  };
  const updateContent = (content: string) => {
    // Drop preuploaded entries whose inline reference was deleted, so sending
    // never re-binds an image the author removed from the text.
    const kept = draftRef.current.preuploadedAttachmentNames?.filter((name) => {
      const markdown = preuploadMarkdownRef.current.get(name);
      // Names without a tracked markdown (restored drafts) stay bound.
      return !markdown || content.includes(markdown);
    });
    commitDraft({
      content,
      tags: extractTags(content),
      preuploadedAttachmentNames: kept,
    });
  };
  const appendText = (value: string) => {
    const base = draftRef.current.content;
    updateContent(`${base}${base && !base.endsWith("\n") ? " " : ""}${value}`);
  };
  const syncTagToken = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const caret = textarea.selectionStart ?? draftRef.current.content.length;
    setActiveTagToken(extractActiveTagToken(draftRef.current.content, caret));
  };
  const acceptTagSuggestion = (name: string) => {
    if (!activeTagToken) return;
    const textarea = textareaRef.current;
    const caret =
      textarea?.selectionStart ??
      activeTagToken.start + 1 + activeTagToken.token.length;
    const content = draftRef.current.content;
    const replaced = `${content.slice(0, activeTagToken.start)}#${name} ${content.slice(caret)}`;
    pendingCaretRef.current = activeTagToken.start + name.length + 2;
    setActiveTagToken(null);
    updateContent(replaced);
  };

  // A finished session flows straight into the draft: review state carries
  // the final sentences, everything else collapses back to idle. The draft
  // writer goes through a ref so the effect never re-runs on every keystroke.
  const updateContentRef = useRef(updateContent);
  updateContentRef.current = updateContent;
  useEffect(() => {
    if (capture.state === "error") {
      if (capture.error) toast.error(t(`capture.${capture.error}`));
      captureController.reset();
      return;
    }
    if (capture.state !== "review") return;
    const text = joinFinalSentences(capture.sentences);
    if (text) {
      const base = draftRef.current.content;
      const separator = base && !base.endsWith("\n") ? " " : "";
      const next = `${base}${separator}${text}`;
      pendingCaretRef.current = next.length;
      updateContentRef.current(next);
    }
    captureController.reset();
  }, [capture.state, capture.sentences, capture.error, captureController, t]);
  const submit = async () => {
    // Images still uploading have no reference in the content yet; sending
    // now would lose them to the orphan GC. A live voice session belongs to
    // the draft in progress, not to a memo being sent.
    if (!canSubmit || isUploadingImages || voiceActive) {
      return;
    }
    try {
      await onSubmit(draft);
    } catch {
      // The mutation owns user-facing error feedback; keep the draft intact.
    }
  };

  return (
    <form
      className="group relative flex w-full flex-col rounded-xl border border-border bg-card shadow-xs motion-safe:animate-rise motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 focus-within:border-brand-400/60 focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand-400/25"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Textarea
        aria-controls={
          showTagSuggestions ? "composer-tag-suggestions" : undefined
        }
        aria-expanded={showTagSuggestions || undefined}
        aria-label={t("composer.ariaLabel")}
        className="min-h-32 resize-none overflow-y-auto rounded-t-xl border-0 px-4 pt-4 pb-2 text-[15px] leading-7 shadow-none focus-visible:ring-0"
        disabled={isPending}
        id="flaremo-composer-input"
        placeholder={t("composer.placeholder")}
        ref={textareaRef}
        value={draft.content}
        onChange={(event) => {
          updateContent(event.target.value);
          const caret =
            event.currentTarget.selectionStart ?? event.target.value.length;
          setActiveTagToken(extractActiveTagToken(event.target.value, caret));
        }}
        onClick={syncTagToken}
        onKeyUp={syncTagToken}
        onKeyDown={(event) => {
          if (showTagSuggestions && !event.nativeEvent.isComposing) {
            const last = tagSuggestions.length - 1;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setTagHighlight((index) => (index >= last ? 0 : index + 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setTagHighlight((index) => (index <= 0 ? last : index - 1));
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              acceptTagSuggestion(tagSuggestions[tagHighlight]?.name ?? "");
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setActiveTagToken(null);
              return;
            }
          }
          // Enter sends; IME composition and Shift+Enter never submit.
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (!isUploadingImages) void submit();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            if (!isUploadingImages) void submit();
          }
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          const files = extractImageFiles(event.dataTransfer.files);
          if (files.length === 0) return;
          event.preventDefault();
          enqueueInlineUploads(
            files,
            event.currentTarget.selectionStart ?? draft.content.length,
          );
        }}
        onPaste={(event) => {
          const files = extractImageFiles(event.clipboardData.files);
          if (files.length === 0) return;
          event.preventDefault();
          enqueueInlineUploads(
            files,
            event.currentTarget.selectionStart ?? draft.content.length,
          );
        }}
      />
      {voiceActive && (
        <div className="absolute inset-x-4 bottom-12 z-30 flex items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-md motion-safe:animate-rise">
          {capture.state === "recording" || capture.state === "reconnecting" ? (
            <>
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-red-500 motion-safe:animate-pulse"
              />
              <span className="shrink-0 font-mono text-sm tabular-nums">
                {formatVoiceClock(
                  capture.startedAt
                    ? Math.max(
                        0,
                        Math.floor(
                          ((capture.stoppedAt ?? now) - capture.startedAt) /
                            1000,
                        ),
                      )
                    : 0,
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {capture.partial || t("capture.recording")}
              </span>
            </>
          ) : (
            <>
              <Loader2Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {capture.state === "requesting_permission"
                  ? t("capture.requestingPermission")
                  : capture.state === "connecting"
                    ? t("capture.connecting")
                    : t("capture.stopping")}
              </span>
            </>
          )}
          {capture.state !== "stopping" && (
            <Button
              className="h-8 shrink-0 px-2.5 text-xs"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => captureController.reset()}
            >
              {t("composer.voiceCancel")}
            </Button>
          )}
          <Button
            className="h-8 shrink-0 px-2.5 text-xs"
            size="sm"
            type="button"
            variant="brand"
            onClick={() => void captureController.stop()}
          >
            {t("composer.voiceStop")}
          </Button>
        </div>
      )}
      {showTagSuggestions && (
        <div
          className="absolute inset-x-4 bottom-12 z-30 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md motion-safe:animate-rise"
          id="composer-tag-suggestions"
        >
          {tagSuggestions.map((suggestion, index) => (
            <button
              className={`flex w-full items-center justify-between gap-3 rounded-md px-3.5 py-1.5 text-left text-sm motion-safe:transition-colors ${
                index === tagHighlight
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
              key={suggestion.name}
              type="button"
              onMouseDown={(event) => {
                // Keep textarea focus/selection so the rewritten caret lands.
                event.preventDefault();
                acceptTagSuggestion(suggestion.name);
              }}
              onMouseEnter={() => setTagHighlight(index)}
            >
              <span className="truncate">
                <span className="text-muted-foreground">#</span>
                {suggestion.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {suggestion.count}
              </span>
            </button>
          ))}
        </div>
      )}
      {draft.files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {draft.files.map((file) => (
            <div
              className="flex max-w-full items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              key={getFileKey(file)}
            >
              <PaperclipIcon />
              <span className="truncate">{file.name}</span>
              <Button
                aria-label={t("composer.removeFile", { filename: file.name })}
                disabled={isPending}
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={() =>
                  commitDraft({
                    files: draftRef.current.files.filter(
                      (item) => item !== file,
                    ),
                  })
                }
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex h-10 items-center justify-between gap-2 rounded-b-xl bg-card px-3 pb-1">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            aria-label={t("composer.addTag")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => {
              const content = draftRef.current.content;
              const separator =
                content && !content.endsWith("\n") && !content.endsWith(" ")
                  ? " "
                  : "";
              const next = `${content}${separator}#`;
              const caret = next.length;
              pendingCaretRef.current = caret;
              updateContent(next);
              setActiveTagToken(extractActiveTagToken(next, caret));
            }}
          >
            <HashIcon />
          </Button>
          <Button
            render={
              <label
                aria-label={t("composer.addAttachment")}
                htmlFor="flaremo-attachment-input"
              />
            }
            disabled={isPending}
            size="icon-sm"
            variant="ghost"
          >
            <ImageIcon />
            <Input
              className="hidden"
              id="flaremo-attachment-input"
              multiple
              type="file"
              disabled={isPending}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length === 0) return;
                onDraftChange({
                  ...draft,
                  files: [...draft.files, ...files],
                });
              }}
            />
          </Button>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <Button
            aria-label={t("composer.bulletList")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => appendText("- ")}
          >
            <ListIcon />
          </Button>
          <Button
            aria-label={t("composer.checklist")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => appendText("- [ ] ")}
          >
            <ListTodoIcon />
          </Button>
          {captureAvailable && (
            <Button
              aria-label={t("composer.voice")}
              className={voiceActive ? "text-brand-600" : undefined}
              disabled={isPending}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => {
                if (voiceActive) return;
                setActiveTagToken(null);
                void captureController.start();
              }}
            >
              <MicIcon />
            </Button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          {showVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("composer.visibility.aria")}
                    className="h-8 px-2 text-xs"
                    disabled={isPending}
                    size="sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                {draft.visibility === "protected" ? (
                  <UsersIcon data-icon="inline-start" />
                ) : (
                  <LockIcon data-icon="inline-start" />
                )}
                <span>
                  {draft.visibility === "protected"
                    ? t("composer.visibility.team")
                    : t("composer.visibility.personal")}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    if (draft.visibility === "protected") return;
                    commitDraft({ visibility: "private" });
                    onVisibilityChange?.("private");
                  }}
                >
                  <LockIcon />
                  {t("composer.visibility.personal")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (draft.visibility !== "protected") return;
                    commitDraft({ visibility: "protected" });
                    onVisibilityChange?.("protected");
                  }}
                >
                  <UsersIcon />
                  {t("composer.visibility.team")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            className="h-8 px-3"
            disabled={
              isPending || isUploadingImages || !canSubmit || voiceActive
            }
            type="submit"
            variant="brand"
          >
            {isPending ? (
              <>
                <Loader2Icon
                  className="motion-safe:animate-spin"
                  data-icon="inline-start"
                />
                {t("composer.sending")}
              </>
            ) : (
              <SendIcon
                className="motion-safe:animate-scale-in"
                data-icon="inline-start"
              />
            )}
            <span>{t("composer.send")}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}

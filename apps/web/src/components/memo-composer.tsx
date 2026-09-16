import type { Editor } from "@tiptap/react";
import {
  CheckSquareIcon,
  HashIcon,
  ImageIcon,
  ListIcon,
  Loader2Icon,
  LockIcon,
  PaperclipIcon,
  SendIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { type MemoVisibility, uploadAttachment } from "@/api";
import { RichComposerEditor } from "@/components/rich-composer-editor-lazy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { inlineImageMarkdown } from "@/lib/image-insert";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";
import { extractTags } from "@/lib/memo";
import { insertMarkdownAt } from "@/lib/rich-editor-upload";

type MemoComposerProps = {
  draft: MemoCaptureInput;
  isPending: boolean;
  /** Rendered only when the viewer holds a team membership. */
  showVisibility?: boolean;
  onDraftChange: (draft: MemoCaptureInput) => void;
  onSubmit: (input: MemoCaptureInput) => Promise<void>;
  onVisibilityChange?: (visibility: MemoVisibility) => void;
};

const fileKeys = new WeakMap<File, string>();
let nextFileKey = 0;

/**
 * Placeholder while the editor chunk streams in on the very first visit; the
 * idle prefetch makes this flash last one frame in practice.
 */
function ComposerEditorSkeleton() {
  return (
    <div className="min-h-32 rounded-t-xl bg-muted/30" aria-hidden="true" />
  );
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
  onDraftChange,
  onSubmit,
  onVisibilityChange,
}: MemoComposerProps) {
  const { t } = useI18n();
  const editorRef = useRef<Editor | null>(null);
  const canSubmit = Boolean(draft.content.trim() || draft.files.length > 0);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
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
  // them afterwards) and their references land at the recorded document
  // position once the upload settles. Tasks chain so two rapid pastes never
  // drift positions.
  const enqueueInlineUploads = (files: File[], position: number) => {
    if (files.length === 0) return;
    pendingUploadsRef.current += files.length;
    setIsUploadingImages(true);
    uploadChainRef.current = uploadChainRef.current
      .catch(() => undefined)
      .then(async () => {
        let cursor = position;
        try {
          for (const file of files) {
            let attachment: Awaited<ReturnType<typeof uploadAttachment>>;
            try {
              attachment = await uploadAttachment({ file });
            } catch {
              toast.error(t("composer.imageUploadFailed"));
              break;
            }
            const editor = editorRef.current;
            if (!editor) break;
            const markdown = inlineImageMarkdown(
              attachment.id,
              attachment.filename,
            );
            // Insert at the position captured when the paste happened (the
            // user may have kept typing while the network was pending); the
            // cursor advances by the insertion's real size delta.
            cursor = insertMarkdownAt(editor, cursor, markdown);
            preuploadMarkdownRef.current.set(attachment.name, markdown);
            commitDraft({
              preuploadedAttachmentNames: [
                ...(draftRef.current.preuploadedAttachmentNames ?? []),
                attachment.name,
              ],
            });
          }
        } finally {
          // A failed batch also releases the files skipped after the failure.
          pendingUploadsRef.current -= files.length;
          setIsUploadingImages(pendingUploadsRef.current > 0);
        }
      });
  };

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
  const submit = async () => {
    // Images still uploading have no reference in the content yet; sending
    // now would lose them to the orphan GC.
    if (!canSubmit || isUploadingImages) {
      return;
    }
    try {
      await onSubmit(draft);
    } catch {
      // The mutation owns user-facing error feedback; keep the draft intact.
    }
  };
  const withEditor = (action: (editor: Editor) => void) => {
    if (isPending) return;
    const editor = editorRef.current;
    if (!editor) return;
    action(editor);
  };

  return (
    <form
      className="group relative flex w-full flex-col rounded-xl border border-border bg-card shadow-xs motion-safe:animate-rise motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 focus-within:border-brand-400/60 focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand-400/25"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Suspense fallback={<ComposerEditorSkeleton />}>
        <RichComposerEditor
          ariaLabel={t("composer.ariaLabel")}
          content={draft.content}
          disabled={isPending}
          editorRef={editorRef}
          onContentChange={updateContent}
          onImageFiles={enqueueInlineUploads}
          onSubmitRequest={() => {
            if (!isUploadingImages) void submit();
          }}
          placeholder={t("composer.placeholder")}
        />
      </Suspense>
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
            onClick={() =>
              withEditor((editor) => {
                editor
                  .chain()
                  .insertContentAt(editor.state.selection.to, "#")
                  .run();
              })
            }
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
            onClick={() =>
              withEditor((editor) => {
                editor.chain().focus().toggleBulletList().run();
              })
            }
          >
            <ListIcon />
          </Button>
          <Button
            aria-label={t("composer.taskList")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() =>
              withEditor((editor) => {
                editor.chain().focus().toggleTaskList().run();
              })
            }
          >
            <CheckSquareIcon />
          </Button>
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
            disabled={isPending || isUploadingImages || !canSubmit}
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

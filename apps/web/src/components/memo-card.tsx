import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Editor } from "@tiptap/react";
import {
  ArchiveIcon,
  Edit3Icon,
  Globe2Icon,
  ImageIcon,
  Loader2Icon,
  LockIcon,
  MicIcon,
  MoreHorizontalIcon,
  PinIcon,
  RotateCcwIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { memo, Suspense, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Attachment, Memo, MemoState, MemoVisibility, Share } from "@/api";
import {
  createTask,
  getMemoContext,
  getRelatedMemos,
  listShares,
  uploadAttachment,
} from "@/api";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import { MemoSearchExcerpt } from "@/components/memo-search-excerpt";
import { MemoVisibilityDialog } from "@/components/memo-visibility-dialog";
import { RichComposerEditor } from "@/components/rich-composer-editor-lazy";
import { ShareImageDialog } from "@/components/share-image-dialog";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import {
  createImageDimensionResolver,
  filterUnreferencedAttachments,
} from "@/lib/attachment-refs";
import { errorMessage } from "@/lib/error";
import {
  extractTags,
  formatMemoRelativeTime,
  formatMemoTime,
  getMemoResourceId,
} from "@/lib/memo";
import { countTaskItems, toggleMemoTaskLine } from "@/lib/memo-tasks";
import { uploadAndInsertImages } from "@/lib/rich-editor-upload";
import { formatClock } from "@/lib/transcript";
import { cn } from "@/lib/utils";

/** Bodies beyond this size collapse in the timeline. */
const COLLAPSE_THRESHOLD = 600;

type MemoCardProps = {
  memo: Memo;
  attachments: Attachment[];
  onArchive: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  /** Creates (or reuses) the memo's public share and resolves with it, so a
      caller that has no share yet can still obtain the token in one step. */
  onShare: (id: string) => Promise<Share>;
  /** Tear down the public link after a memo leaves "public". */
  onRevokeShare?: (share: Share) => void;
  onUpdate: (
    id: string,
    input: { content: string; visibility: MemoVisibility },
  ) => Promise<void>;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onHardDelete: (id: string) => Promise<void>;
  share?: Share;
  searchQuery?: string;
  /** Position in the list, used to stagger the entrance animation. */
  index?: number;
  /** Called when a tag chip is clicked to filter the timeline by that tag. */
  onTagClick?: (tag: string) => void;
  canManage?: boolean;
  /** Lifecycle governance (archive/trash/restore) without content editing. */
  canGovern?: boolean;
  /** Focused via J/K keyboard navigation. */
  isFocused?: boolean;
  onRequestDelete?: (memo: Memo) => void;
  onRequestShareImage?: (memo: Memo) => void;
  onRequestVisibility?: (memo: Memo) => void;
};

export const MemoCard = memo(function MemoCard({
  memo,
  attachments,
  onArchive,
  onPin,
  onShare,
  onRevokeShare,
  onUpdate,
  onTrash,
  onRestore,
  onHardDelete,
  share,
  searchQuery,
  index = 0,
  onTagClick,
  canManage = false,
  canGovern = false,
  isFocused = false,
  onRequestDelete,
  onRequestShareImage,
  onRequestVisibility,
}: MemoCardProps) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const id = getMemoResourceId(memo);
  const tags = memo.payload.tags ?? extractTags(memo.content);
  const isTrashed = memo.state === "trashed";
  // Body-referenced images render inline; the gallery keeps only the rest.
  const galleryAttachments = filterUnreferencedAttachments(
    attachments,
    memo.content,
  );
  // Long bodies (transcripts, articles) collapse so one memo cannot dominate
  // the timeline. Expanded state is per-card and resets on remount.
  const isCollapsible =
    memo.content.length > COLLAPSE_THRESHOLD ||
    memo.content.split("\n").length > 12;
  const [expanded, setExpanded] = useState(false);
  const collapsed = isCollapsible && !expanded;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingInline, setIsUploadingInline] = useState(false);
  // Hovering the title telegraphs "opening the detail page": warm its two
  // queries so the route paints with data instead of a full-page skeleton.
  const prefetchDetail = () => {
    void queryClient.prefetchQuery({
      queryKey: ["memo-context", memo.id],
      queryFn: () => getMemoContext(memo.id),
    });
    void queryClient.prefetchQuery({
      queryKey: ["memo-related", memo.id],
      queryFn: () => getRelatedMemos(memo.id),
    });
  };
  // Intrinsic boxes for body images: uploaded dimensions ride the
  // attachments list, so a photo the author placed inline never shoves the
  // cards below it aside while loading.
  const resolveImageDimensions = useMemo(
    () => createImageDimensionResolver(attachments),
    [attachments],
  );
  // Task-list checkboxes are clickable for editors: LazyMemoContent maps the
  // rendered checkbox back to its source line and D2 rewrites just that
  // marker through the memo update mutation (optimistic, so it settles fast).
  const taskCount = useMemo(() => countTaskItems(memo.content), [memo.content]);
  const convertTaskMutation = useMutation({
    mutationFn: (title: string) =>
      createTask({ title, source_memo_id: memo.name }),
    onSuccess: () => {
      toast.success(t("toast.taskCreated"));
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.taskCreateFailed"))),
  });
  const taskInteraction =
    !canManage || isTrashed
      ? undefined
      : {
          onToggleTask: (lineIndex: number) => {
            const next = toggleMemoTaskLine(memo.content, lineIndex);
            if (next) {
              void onUpdate(id, {
                content: next,
                visibility: memo.visibility,
              });
            }
          },
          onConvertTask: (_lineIndex: number, text: string) => {
            convertTaskMutation.mutate(text);
          },
        };

  // Editing an existing memo: pasted images upload bound to the memo right
  // away, so a cancelled edit leaves nothing to clean up except an
  // unreferenced (but owned) attachment in the gallery. Each file shows an
  // "uploading…" chip until its reference lands at the chip's position.
  const insertInlineImages = (files: File[], position: number) => {
    if (files.length === 0) return;
    setIsUploadingInline(true);
    void uploadAndInsertImages({
      editorRef: editEditorRef,
      files,
      position,
      upload: (file) => uploadAttachment({ file, memo: memo.name }),
      onError: () => toast.error(t("composer.imageUploadFailed")),
    }).finally(() => setIsUploadingInline(false));
  };
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [draftContent, setDraftContent] = useState(memo.content);
  const editEditorRef = useRef<Editor | null>(null);
  const [isShareImageOpen, setIsShareImageOpen] = useState(false);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);

  const startEditing = () => {
    setDraftContent(memo.content);
    setIsEditing(true);
  };

  // Visibility is a property of the record, changed in place from the ⋯ menu.
  // Going public provisions the read-only link; stepping back down revokes it,
  // so a demoted memo never keeps a live public URL.
  const changeVisibility = async (visibility: MemoVisibility) => {
    if (visibility === memo.visibility) return;
    try {
      await onUpdate(id, {
        content: memo.content,
        visibility,
      });
      if (visibility === "public" && !share) await onShare(id);
      if (visibility !== "public") {
        if (share) {
          onRevokeShare?.(share);
        } else {
          // The card may not know the share (e.g. the memo was made public in
          // an earlier session): ask the server for the still-live links and
          // revoke every one, so demotion always kills the public URL.
          const { shares } = await listShares(memo.name);
          for (const liveShare of shares) onRevokeShare?.(liveShare);
        }
      }
    } catch {
      // The mutation displays the error; the card keeps its current state.
    }
  };

  const saveEditing = async () => {
    setIsSaving(true);
    try {
      await onUpdate(id, {
        content: draftContent,
        visibility: memo.visibility,
      });
      setIsEditing(false);
    } catch {
      // The mutation displays the error and the editor stays open.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article
      data-memo-id={memo.id}
      className={cn(
        "group relative flex w-full flex-col gap-2 rounded-xl border border-border/50 bg-card/60 px-3.5 py-4 text-card-foreground [content-visibility:auto] [contain-intrinsic-size:auto_120px] motion-safe:animate-rise motion-safe:transition-[background-color,border-color,transform,box-shadow] motion-safe:duration-150 hover:border-border hover:bg-card hover:shadow-xs motion-safe:hover:-translate-y-px",
        memo.pinned &&
          "border-l-brand-500 border-l-[3px] dark:border-l-brand-400 bg-card",
        isFocused && "ring-2 ring-brand-400/60 shadow-xs bg-card",
        isEditing && "bg-card shadow-xs ring-1 ring-brand-400/40",
      )}
      style={{ animationDelay: `${Math.min(index, 7) * 35}ms` }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Link
          className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onFocus={prefetchDetail}
          onMouseEnter={prefetchDetail}
          params={{ memoId: memo.id }}
          to="/memo/$memoId"
        >
          {/* flomo's header rule: identity only, no placeholders. The
              timestamp is the sole anchor; hovering swaps relative for the
              absolute instant, so both facts live in one pixel row. */}
          <span className="inline-grid [grid-template-areas:'stack'] items-center truncate">
            <span className="[grid-area:stack] transition-opacity duration-150 group-hover:opacity-0 pointer-events-none">
              {formatMemoRelativeTime(memo.display_time, locale)}
            </span>
            <span className="[grid-area:stack] opacity-0 transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap">
              {formatMemoTime(memo.display_time, locale)}
            </span>
          </span>
          {/* Author belongs to the shared spaces: a personal note has no
              audience besides its author, so the name is noise there. */}
          {memo.visibility !== "private" && memo.creator_name && (
            <span>· {memo.creator_name}</span>
          )}
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {memo.source === "voice" && <VoiceBadge memo={memo} />}
          {memo.visibility !== "private" && (
            <VisibilityBadge
              visibility={memo.visibility}
              onClick={() =>
                onRequestVisibility
                  ? onRequestVisibility(memo)
                  : setIsVisibilityOpen(true)
              }
            />
          )}
          {(canManage || canGovern) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("common.actions")}
                    className="opacity-100 motion-safe:transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {isTrashed ? (
                  <DropdownMenuGroup>
                    {canGovern && (
                      <DropdownMenuItem onClick={() => onRestore(id)}>
                        <RotateCcwIcon />
                        {t("memo.restore")}
                      </DropdownMenuItem>
                    )}
                    {canManage && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          onRequestDelete
                            ? onRequestDelete(memo)
                            : setIsDeleteDialogOpen(true)
                        }
                      >
                        <Trash2Icon />
                        {t("memo.deleteForever")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                ) : (
                  <>
                    {canManage && (
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={startEditing}>
                          <Edit3Icon />
                          {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onPin(id, !memo.pinned)}
                        >
                          <PinIcon />
                          {memo.pinned ? t("memo.unpin") : t("memo.pin")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            onRequestVisibility
                              ? onRequestVisibility(memo)
                              : setIsVisibilityOpen(true)
                          }
                        >
                          <Globe2Icon />
                          {t("memo.visibilityAndShare")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            onRequestShareImage
                              ? onRequestShareImage(memo)
                              : setIsShareImageOpen(true)
                          }
                        >
                          <ImageIcon />
                          {t("share.imageCard")}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    )}
                    {canGovern && (
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => onArchive(id)}>
                          <ArchiveIcon />
                          {memo.state === "archived"
                            ? t("memo.moveToTimeline")
                            : t("view.archive")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onTrash(id)}
                        >
                          <Trash2Icon />
                          {t("memo.moveToTrash")}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="flex flex-col gap-3 motion-safe:animate-fade">
          <Suspense
            fallback={
              <div className="min-h-32 bg-muted/30" aria-hidden="true" />
            }
          >
            <RichComposerEditor
              ariaLabel={t("common.edit")}
              autoFocus
              content={draftContent}
              disabled={isSaving}
              editorRef={editEditorRef}
              onContentChange={setDraftContent}
              onEscape={() => setIsEditing(false)}
              onImageFiles={insertInlineImages}
              inputId="flaremo-card-editor-input"
              onSubmitRequest={() => {
                if (!isUploadingInline) void saveEditing();
              }}
              placeholder={t("composer.placeholder")}
              submitOnEnter={false}
            />
          </Suspense>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="hidden sm:inline text-xs text-muted-foreground">
              ⌘Enter / Esc
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                disabled={isSaving}
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={isSaving || isUploadingInline || !draftContent.trim()}
                size="sm"
                onClick={() => void saveEditing()}
              >
                {isSaving && (
                  <Loader2Icon
                    className="motion-safe:animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="relative">
            <div
              className={cn(
                "overflow-hidden motion-safe:transition-[max-height] motion-safe:duration-250 motion-safe:ease-signal",
                collapsed ? "max-h-52" : "max-h-[1600px]",
              )}
            >
              <LazyMemoContent
                content={memo.content}
                interactiveTaskLists={canManage && taskCount > 0}
                resolveImageDimensions={resolveImageDimensions}
                onToggleTask={taskInteraction?.onToggleTask}
                onConvertTask={taskInteraction?.onConvertTask}
              />
            </div>
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent motion-safe:transition-opacity motion-safe:duration-200",
                collapsed ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
          {isCollapsible && (
            <Button
              className="mt-1.5"
              onClick={() => setExpanded((value) => !value)}
              size="sm"
              variant="ghost"
            >
              {collapsed ? t("reading.expand") : t("reading.collapse")}
            </Button>
          )}
          {searchQuery && (
            <MemoSearchExcerpt content={memo.content} query={searchQuery} />
          )}
          {galleryAttachments.length > 0 && (
            <div className="mt-3">
              <AttachmentGallery attachments={galleryAttachments} />
            </div>
          )}
        </div>
      )}
      {(tags.length > 0 || memo.state !== "normal") && !isEditing && (
        <footer className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) =>
              onTagClick ? (
                <button
                  aria-label={`#${tag}`}
                  className="cursor-pointer rounded-full motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-px"
                  key={tag}
                  type="button"
                  onClick={() => onTagClick(tag)}
                >
                  <Badge
                    className="transition-colors hover:bg-brand-200 dark:hover:bg-brand-400/20"
                    variant="brand"
                  >
                    #{tag}
                  </Badge>
                </button>
              ) : (
                <Badge key={tag} variant="brand">
                  #{tag}
                </Badge>
              ),
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {memo.state !== "normal" && (
              <Badge variant="outline">{stateLabel(memo.state, t)}</Badge>
            )}
          </div>
        </footer>
      )}
      {!onRequestDelete && (
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("memo.deleteConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("memo.deleteConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void onHardDelete(id)}
              >
                {t("memo.deleteForever")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {!onRequestShareImage && (
        <ShareImageDialog
          memo={memo}
          open={isShareImageOpen}
          onOpenChange={setIsShareImageOpen}
        />
      )}
      {!onRequestVisibility && (
        <MemoVisibilityDialog
          memo={memo}
          open={isVisibilityOpen}
          onOpenChange={setIsVisibilityOpen}
          onRevokeShare={onRevokeShare}
          onShare={onShare}
          onUpdateVisibility={changeVisibility}
          share={share}
        />
      )}
    </article>
  );
});

/**
 * The timeline's voice-capture face (rollout §4.3, D5): a mic badge with the
 * recording length. Playback stays on the detail page — the card only
 * identifies the note as spoken.
 */
function VoiceBadge({ memo }: { memo: Memo }) {
  const { t } = useI18n();
  const duration = memo.payload.durationSeconds;
  return (
    <Badge className="rounded-md" variant="outline" title={t("capture.title")}>
      <MicIcon />
      {typeof duration === "number" &&
        Number.isFinite(duration) &&
        duration > 0 && (
          <span className="tabular-nums">{formatClock(duration)}</span>
        )}
    </Badge>
  );
}

/**
 * A shared space shows one quiet, clickable badge instead of a text label:
 * clicking it directly opens the visibility and sharing management dialog.
 * Private notes (the common case) render nothing at all.
 */
function VisibilityBadge({
  visibility,
  onClick,
}: {
  visibility: MemoVisibility;
  onClick?: () => void;
}) {
  const { t } = useI18n();
  const icon =
    visibility === "public" ? (
      <Globe2Icon className="size-3.5" />
    ) : visibility === "protected" ? (
      <UsersIcon className="size-3.5" />
    ) : (
      <LockIcon className="size-3.5" />
    );
  const label =
    visibility === "public"
      ? t("visibility.public")
      : visibility === "protected"
        ? t("visibility.protected")
        : t("visibility.private");

  if (visibility === "private") return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 cursor-pointer motion-safe:hover:-translate-y-px motion-safe:active:scale-95",
        visibility === "public"
          ? "hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15 dark:hover:text-brand-400"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

function stateLabel(state: MemoState, t: ReturnType<typeof useI18n>["t"]) {
  switch (state) {
    case "archived":
      return t("memo.stateArchived");
    case "trashed":
      return t("memo.stateTrashed");
    case "deleted":
      return t("memo.stateDeleted");
    default:
      return state;
  }
}

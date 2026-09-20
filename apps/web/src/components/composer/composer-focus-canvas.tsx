import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { Editor } from "@tiptap/react";
import {
  ArrowRightIcon,
  BoldIcon,
  CalendarPlusIcon,
  CheckSquareIcon,
  CodeIcon,
  HashIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  MicIcon,
  Minimize2Icon,
  MinusIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
} from "lucide-react";
import { Suspense, useRef, useState } from "react";
import type { MemoVisibility } from "@/api";
import { buildArticleExtensions } from "@/components/article-editor";
import { ComposerFileChips } from "@/components/composer/composer-file-chips";
import {
  ComposerTagSuggestions,
  ComposerWikiSuggestions,
} from "@/components/composer/composer-suggestion-lists";
import {
  type ComposerPublishType,
  ComposerTypeMenu,
} from "@/components/composer/composer-type-menu";
import { ComposerVisibilityMenu } from "@/components/composer/composer-visibility-menu";
import { VoiceCaptureBar } from "@/components/composer/voice-capture-bar";
import { RichComposerEditor } from "@/components/rich-composer-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useComposerSuggestions } from "@/hooks/use-composer-suggestions";
import { useComposerVoice } from "@/hooks/use-composer-voice";
import { useInlineImageUploads } from "@/hooks/use-inline-image-uploads";
import { useI18n } from "@/i18n";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";
import { extractTags } from "@/lib/memo";
import type { TagSuggestion } from "@/lib/tag-autocomplete";

export type ComposerFocusCanvasProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: MemoCaptureInput;
  isPending: boolean;
  showVisibility?: boolean;
  tags?: TagSuggestion[];
  captureAvailable?: boolean;
  onDraftChange: (draft: MemoCaptureInput) => void;
  onSubmitMemo: (input: MemoCaptureInput) => Promise<void>;
  onSubmitArticle: (input: MemoCaptureInput) => Promise<void>;
  onVisibilityChange?: (visibility: MemoVisibility) => void;
};

/**
 * Fullscreen Focus Canvas (专注画布 - 自适应信纸模式):
 * Smooth, 60fps hardware-accelerated full-viewport writing environment.
 * Features a dedicated title header and an extensive professional writing
 * toolbar (headings, code blocks, tables, lists, text formatting).
 * Automatically adapts publish target based on title presence or user choice.
 */
export function ComposerFocusCanvas({
  open,
  onOpenChange,
  draft,
  isPending,
  showVisibility = false,
  tags,
  captureAvailable = false,
  onDraftChange,
  onSubmitMemo,
  onSubmitArticle,
  onVisibilityChange,
}: ComposerFocusCanvasProps) {
  const { t } = useI18n();
  const canvasEditorRef = useRef<Editor | null>(null);
  const [manualType, setManualType] = useState<ComposerPublishType | null>(
    null,
  );

  // Option A (自适应信纸法):
  // If title is entered, automatically treated as article unless user manually set type.
  const hasTitle = Boolean(draft.title?.trim());
  const publishType: ComposerPublishType =
    manualType ?? (hasTitle ? "article" : "memo");

  const canSubmit = Boolean(draft.content.trim() || draft.files.length > 0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const commitDraft = (patch: Partial<MemoCaptureInput>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    onDraftChange(next);
  };

  const { isUploadingImages, enqueueInlineUploads, preuploadMarkdownRef } =
    useInlineImageUploads({
      editorRef: canvasEditorRef,
      draftRef,
      commitDraft,
    });

  const updateContent = (content: string) => {
    const kept = draftRef.current.preuploadedAttachmentNames?.filter((name) => {
      const markdown = preuploadMarkdownRef.current.get(name);
      return !markdown || content.includes(markdown);
    });
    commitDraft({
      content,
      tags: extractTags(content),
      preuploadedAttachmentNames: kept,
    });
  };

  const updateContentRef = useRef(updateContent);
  updateContentRef.current = updateContent;

  const {
    setActiveTagToken,
    setActiveWikiToken,
    tagSuggestions,
    showTagSuggestions,
    acceptTagSuggestion,
    wikiSuggestions,
    showWikiSuggestions,
    acceptWikiSuggestion,
  } = useComposerSuggestions({ editorRef: canvasEditorRef, isPending, tags });

  const { capture, captureController, voiceActive, now } = useComposerVoice({
    draftRef,
    updateContentRef,
  });

  const submit = async () => {
    if (isPending || isUploadingImages || voiceActive) return;

    if (publishType === "article") {
      await onSubmitArticle(draftRef.current);
    } else {
      if (!canSubmit) return;
      try {
        await onSubmitMemo(draftRef.current);
        onOpenChange(false);
      } catch {
        // Mutation handles error feedback
      }
    }
  };

  const withEditor = (action: (editor: Editor) => void) => {
    if (isPending) return;
    const editor = canvasEditorRef.current;
    if (!editor) return;
    action(editor);
  };

  const charCount = draft.content.trim().length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Backdrop
          data-slot="composer-canvas-backdrop"
          className="fixed inset-0 isolate z-50 bg-background/80 duration-200 ease-signal supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:fill-mode-forwards"
        />
        <DialogPrimitive.Popup
          data-slot="composer-canvas-popup"
          className="fixed inset-0 isolate z-50 flex flex-col bg-background text-foreground outline-none will-change-transform will-change-opacity duration-200 ease-signal data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:fill-mode-forwards"
        >
          <form
            className="flex h-full flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {/* Header: Title accessibility, Word count & minimize */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-4 sm:px-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <DialogTitle className="sr-only">
                  {publishType === "article"
                    ? t("composer.type.article")
                    : t("composer.type.memo")}
                </DialogTitle>
                {charCount > 0 && (
                  <span className="tabular-nums">
                    {t("composer.fullscreen.wordCount", { count: charCount })}
                  </span>
                )}
              </div>
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    title={t("composer.fullscreen.close")}
                    aria-label={t("composer.fullscreen.close")}
                  />
                }
              >
                <Minimize2Icon className="size-4" />
              </DialogClose>
            </div>

            {/* Main Canvas Area */}
            <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col min-h-0 overflow-y-auto px-4 sm:px-6 py-5">
              {/* Adaptive Title Header */}
              <div className="mb-3 shrink-0">
                <input
                  type="text"
                  value={draft.title ?? ""}
                  onChange={(event) => {
                    commitDraft({ title: event.target.value });
                  }}
                  placeholder={t("composer.fullscreen.articleTitlePlaceholder")}
                  disabled={isPending}
                  className="w-full border-b border-border/40 bg-transparent px-0 pb-3 text-xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground/30 focus-visible:outline-none sm:text-2xl"
                />
              </div>

              {/* TipTap Fullscreen Editor */}
              <div className="flex flex-1 flex-col min-h-0">
                <Suspense
                  fallback={<div className="flex-1 rounded-lg bg-muted/20" />}
                >
                  <RichComposerEditor
                    ariaLabel={
                      publishType === "article"
                        ? t("composer.type.article")
                        : t("composer.ariaLabel")
                    }
                    content={draft.content}
                    disabled={isPending}
                    editorRef={canvasEditorRef}
                    extensions={buildArticleExtensions(
                      t("composer.placeholder"),
                    )}
                    inputId="flaremo-fullscreen-composer-input"
                    onContentChange={updateContent}
                    onImageFiles={enqueueInlineUploads}
                    onTagTokenChange={tags ? setActiveTagToken : undefined}
                    onWikiLinkTokenChange={setActiveWikiToken}
                    onSubmitRequest={() => {
                      if (!isUploadingImages && !voiceActive) void submit();
                    }}
                    placeholder={t("composer.placeholder")}
                    submitOnEnter={false}
                    autoFocus={true}
                    contentClassName="article-editor-content flex-1 outline-none text-base leading-relaxed py-2"
                  />
                </Suspense>
                {voiceActive && (
                  <VoiceCaptureBar
                    capture={capture}
                    now={now}
                    onCancel={() => captureController.reset()}
                    onStop={() => void captureController.stop()}
                  />
                )}
                <ComposerTagSuggestions
                  visible={showTagSuggestions}
                  suggestions={tagSuggestions}
                  onAccept={acceptTagSuggestion}
                />
                <ComposerWikiSuggestions
                  visible={showWikiSuggestions}
                  suggestions={wikiSuggestions}
                  onAccept={acceptWikiSuggestion}
                />
                <ComposerFileChips
                  files={draft.files}
                  isPending={isPending}
                  onRemoveFile={(file) =>
                    commitDraft({
                      files: draftRef.current.files.filter(
                        (item) => item !== file,
                      ),
                    })
                  }
                />
              </div>
            </div>

            {/* Bottom Action Bar: Professional Tools + Destination Controller */}
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-border/40 bg-card/60 px-4 sm:px-6 py-2">
              {/* Professional Writing Toolbar */}
              <div className="flex min-w-0 items-center gap-0.5 sm:gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
                {/* Headings */}
                <Button
                  aria-label={t("article.toolH2")}
                  title={t("article.toolH2")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleHeading({ level: 2 }).run();
                    })
                  }
                >
                  <Heading2Icon />
                </Button>
                <Button
                  aria-label={t("article.toolH3")}
                  title={t("article.toolH3")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleHeading({ level: 3 }).run();
                    })
                  }
                >
                  <Heading3Icon />
                </Button>

                <div className="h-4 w-px bg-border/60 mx-0.5" />

                {/* Inline formatting */}
                <Button
                  aria-label={t("article.toolBold")}
                  title={t("article.toolBold")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleBold().run();
                    })
                  }
                >
                  <BoldIcon />
                </Button>
                <Button
                  aria-label={t("article.toolItalic")}
                  title={t("article.toolItalic")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleItalic().run();
                    })
                  }
                >
                  <ItalicIcon />
                </Button>
                <Button
                  aria-label={t("article.toolStrike")}
                  title={t("article.toolStrike")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleStrike().run();
                    })
                  }
                >
                  <StrikethroughIcon />
                </Button>
                <Button
                  aria-label={t("article.toolCode")}
                  title={t("article.toolCode")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleCode().run();
                    })
                  }
                >
                  <CodeIcon />
                </Button>

                <div className="h-4 w-px bg-border/60 mx-0.5" />

                {/* Blocks: Quote, Rule, Table */}
                <Button
                  aria-label={t("article.toolQuote")}
                  title={t("article.toolQuote")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleBlockquote().run();
                    })
                  }
                >
                  <QuoteIcon />
                </Button>
                <Button
                  aria-label={t("article.toolRule")}
                  title={t("article.toolRule")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().setHorizontalRule().run();
                    })
                  }
                >
                  <MinusIcon />
                </Button>
                <Button
                  aria-label={t("article.toolTable")}
                  title={t("article.toolTable")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor
                        .chain()
                        .focus()
                        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                        .run();
                    })
                  }
                >
                  <TableIcon />
                </Button>

                <div className="h-4 w-px bg-border/60 mx-0.5" />

                {/* Lists */}
                <Button
                  aria-label={t("article.toolBulletList")}
                  title={t("article.toolBulletList")}
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
                  aria-label={t("article.toolOrderedList")}
                  title={t("article.toolOrderedList")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor.chain().focus().toggleOrderedList().run();
                    })
                  }
                >
                  <ListOrderedIcon />
                </Button>
                <Button
                  aria-label={t("article.toolTaskList")}
                  title={t("article.toolTaskList")}
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

                <div className="h-4 w-px bg-border/60 mx-0.5" />

                {/* Tag, Attachments, Date & Voice */}
                <Button
                  aria-label={t("composer.addTag")}
                  title={t("composer.addTag")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      editor
                        .chain()
                        .focus()
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
                      title={t("composer.addAttachment")}
                      htmlFor="flaremo-canvas-attachment-input"
                    />
                  }
                  disabled={isPending}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ImageIcon />
                  <Input
                    className="hidden"
                    id="flaremo-canvas-attachment-input"
                    multiple
                    type="file"
                    disabled={isPending}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      if (files.length === 0) return;
                      commitDraft({
                        files: [...draftRef.current.files, ...files],
                      });
                    }}
                  />
                </Button>
                <Button
                  aria-label={t("composer.insertDate")}
                  title={t("composer.insertDate")}
                  disabled={isPending}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    withEditor((editor) => {
                      const today = new Date().toISOString().slice(0, 10);
                      editor.chain().focus().insertContent(`${today} `).run();
                    })
                  }
                >
                  <CalendarPlusIcon />
                </Button>
                {captureAvailable && (
                  <Button
                    aria-label={t("composer.voice")}
                    title={t("composer.voice")}
                    className={voiceActive ? "text-brand-600" : undefined}
                    disabled={isPending}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (voiceActive) return;
                      void captureController.start();
                    }}
                  >
                    <MicIcon />
                  </Button>
                )}
              </div>

              {/* Right Side: Type Chooser & CTA Button */}
              <div className="flex shrink-0 items-center gap-2">
                <ComposerTypeMenu
                  type={publishType}
                  disabled={isPending}
                  onTypeChange={(nextType) => setManualType(nextType)}
                />
                {publishType === "memo" && (
                  <>
                    <ComposerVisibilityMenu
                      showVisibility={Boolean(showVisibility)}
                      visibility={draft.visibility}
                      isPending={isPending}
                      isUploadingImages={isUploadingImages}
                      canSubmit={canSubmit}
                      voiceActive={voiceActive}
                      onVisibilityChange={(visibility) => {
                        commitDraft({ visibility });
                        onVisibilityChange?.(visibility);
                      }}
                    />
                  </>
                )}
                {publishType === "article" && (
                  <Button
                    type="submit"
                    variant="brand"
                    className="h-7 gap-1 rounded-full px-3 text-xs font-medium"
                    disabled={isPending || isUploadingImages || voiceActive}
                  >
                    {isPending ? (
                      <Loader2Icon className="size-3.5 motion-safe:animate-spin" />
                    ) : (
                      <>
                        <span>{t("composer.action.toArticleEditor")}</span>
                        <ArrowRightIcon className="size-3.5" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

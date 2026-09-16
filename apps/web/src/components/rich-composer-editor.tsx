import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import type { EditorView } from "@tiptap/pm/view";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { TagHighlight } from "@/components/tag-highlight-extension";
import { extractImageFiles } from "@/lib/image-insert";

export type RichComposerEditorProps = {
  /** Markdown source of truth; only reapplied when it changed upstream. */
  content: string;
  placeholder: string;
  ariaLabel: string;
  disabled: boolean;
  /** Markdown out. Every editor transaction funnels through here. */
  onContentChange: (markdown: string) => void;
  /** Image files pasted/dropped; the caller owns upload orchestration. */
  onImageFiles: (files: File[], position: number) => void;
  /** Enter without IME composition. */
  onSubmitRequest: () => void;
  /** Shared ref so the toolbar and the upload chain can drive the editor. */
  editorRef: React.RefObject<Editor | null>;
};

/**
 * True when the caret sits inside a bullet/ordered/task list item: pressing
 * Enter there grows the list instead of submitting the memo.
 */
function caretInListItem(view: EditorView): boolean {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "listItem" || name === "taskItem") return true;
  }
  return false;
}

/**
 * Bear-style WYSIWYG body of the memo composer. Storage stays plain markdown:
 * the official Markdown extension parses it on the way in and serializes on
 * the way out, so cards, the API, and MCP all keep seeing ordinary GFM text.
 */
export function RichComposerEditor({
  content,
  placeholder,
  ariaLabel,
  disabled,
  onContentChange,
  onImageFiles,
  onSubmitRequest,
  editorRef,
}: RichComposerEditorProps) {
  // Callbacks are read through refs: TipTap captures the options object once,
  // so prop closures would go stale across renders.
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onImageFilesRef = useRef(onImageFiles);
  onImageFilesRef.current = onImageFiles;
  const onSubmitRequestRef = useRef(onSubmitRequest);
  onSubmitRequestRef.current = onSubmitRequest;
  // The markdown last pushed downstream. Guards the restore effect against
  // re-parsing the editor's own output (which would fight the update loop).
  const lastEmittedRef = useRef(content);

  const editor = useEditor({
    contentType: "markdown",
    content,
    editable: !disabled,
    extensions: [
      // The element whitelist mirrors what the card renderer supports. Only
      // underline is dropped: it has no markdown representation, so anything
      // written with it would be silently unstyled on send.
      StarterKit.configure({
        underline: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder }),
      Markdown,
      TagHighlight,
    ],
    editorProps: {
      attributes: {
        id: "flaremo-composer-input",
        "aria-label": ariaLabel,
        class: "composer-editor-content",
      },
      handleKeyDown: (view, event) => {
        // Enter sends; IME composition and Shift+Enter never submit. Same
        // contract the textarea era had — except inside a list item, where
        // Enter must continue the checklist instead of cutting the note off
        // after its first item.
        if (
          event.key !== "Enter" ||
          event.isComposing ||
          event.keyCode === 229
        ) {
          return false;
        }
        if (event.metaKey || event.ctrlKey) {
          onSubmitRequestRef.current();
          return true;
        }
        if (!event.shiftKey && !caretInListItem(view)) {
          onSubmitRequestRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const files = extractImageFiles(event.clipboardData?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        onImageFilesRef.current(files, view.state.selection.to);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = extractImageFiles(event.dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        onImageFilesRef.current(files, view.state.selection.to);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      lastEmittedRef.current = markdown;
      onContentChangeRef.current(markdown);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Upstream draft restores (queued capture replay, persisted draft) push
  // markdown in; the editor re-parses only when the change did not originate
  // from its own keystrokes.
  useEffect(() => {
    if (!editor || content === lastEmittedRef.current) return;
    lastEmittedRef.current = content;
    editor.commands.setContent(content, { contentType: "markdown" });
  }, [content, editor]);

  // The placeholder is captured at editor creation; a locale switch mid-session
  // is rare enough that the fresh wording lands on the next composer mount.
  return <EditorContent editor={editor} />;
}

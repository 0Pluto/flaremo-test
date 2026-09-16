import type { Editor } from "@tiptap/react";

/**
 * Inserts a markdown snippet at a recorded document position and returns the
 * position to use for the next snippet: insertions chain without drifting
 * because the cursor advances by the actual size delta of the document.
 */
export function insertMarkdownAt(
  editor: Editor,
  cursor: number,
  markdown: string,
): number {
  const sizeBefore = editor.state.doc.content.size;
  editor
    .chain()
    .insertContentAt(cursor, markdown, { contentType: "markdown" })
    .run();
  return cursor + (editor.state.doc.content.size - sizeBefore);
}

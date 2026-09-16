const TASK_ITEM_RE = /^(\s*(?:[-*+]|\d+\.) \[)([ xX])(\])/gm;

/**
 * Toggles the nth task-list item (`- [ ]` / `- [x]`) in a Markdown body.
 * Index counts task items in document order — the same order react-markdown
 * renders their checkboxes, so the nth checkbox maps to the nth marker.
 * Returns the content unchanged when the item does not exist.
 */
export function toggleTaskItem(content: string, index: number): string {
  if (index < 0) return content;
  let seen = -1;
  return content.replace(TASK_ITEM_RE, (match, head, mark, tail) => {
    seen += 1;
    if (seen !== index) return match;
    const next = mark === " " ? "x" : " ";
    return `${head}${next}${tail}`;
  });
}

export function countTaskItems(content: string): number {
  let count = 0;
  for (const _match of content.matchAll(TASK_ITEM_RE)) count += 1;
  return count;
}

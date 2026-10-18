import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface ActiveComment {
  id: string;
  anchorText: string;
  resolved: boolean;
  occurrence: number;
}

export const commentHighlightKey = new PluginKey<DecorationSet>("commentHighlight");

/** Maps an offset in `doc.textContent` to a ProseMirror document position. */
function posAtTextOffset(doc: PMNode, targetOffset: number): number | null {
  let acc = 0;
  let found: number | null = null;

  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText || !node.text) return true;
    if (acc + node.text.length >= targetOffset) {
      found = pos + (targetOffset - acc);
      return false;
    }
    acc += node.text.length;
    return true;
  });

  return found;
}

/**
 * Highlights the Nth occurrence of each comment's anchor text.
 * Anchors are text-based so they survive collaborative edits reasonably well.
 * Threads that share the same anchor are merged into one highlight that
 * carries every thread id, so clicking it can reveal all of them.
 */
export function buildCommentDecorations(doc: PMNode, comments: ActiveComment[]): DecorationSet {
  if (comments.length === 0) return DecorationSet.empty;

  const plain = doc.textContent;
  const grouped = new Map<string, { anchorText: string; occurrence: number; ids: string[]; anyOpen: boolean }>();

  for (const comment of comments) {
    const anchorText = comment.anchorText.trim();
    if (!anchorText) continue;
    const key = `${comment.occurrence}\u0000${anchorText}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.ids.push(comment.id);
      entry.anyOpen = entry.anyOpen || !comment.resolved;
    } else {
      grouped.set(key, {
        anchorText,
        occurrence: comment.occurrence,
        ids: [comment.id],
        anyOpen: !comment.resolved,
      });
    }
  }

  const decorations: Decoration[] = [];

  for (const { anchorText, occurrence, ids, anyOpen } of grouped.values()) {
    let seen = 0;
    let searchFrom = 0;
    let matchAt = -1;
    while (true) {
      const found = plain.indexOf(anchorText, searchFrom);
      if (found === -1) break;
      if (seen === occurrence) {
        matchAt = found;
        break;
      }
      seen += 1;
      searchFrom = found + anchorText.length;
    }
    if (matchAt === -1) continue;

    const from = posAtTextOffset(doc, matchAt);
    const to = posAtTextOffset(doc, matchAt + anchorText.length);
    if (from === null || to === null || to <= from) continue;

    decorations.push(
      Decoration.inline(from, to, {
        class: anyOpen ? "comment-mark" : "comment-mark resolved",
        "data-comment-ids": ids.join(" "),
      })
    );
  }

  return DecorationSet.create(doc, decorations);
}

export const CommentHighlight = Extension.create({
  name: "commentHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: commentHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old) => {
            const meta = tr.getMeta(commentHighlightKey) as
              | { decorations: DecorationSet }
              | undefined;
            if (meta) return meta.decorations;
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          },
        },
        props: {
          decorations: (state) => commentHighlightKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import CommentSidebar from "./CommentSidebar";
import {
  buildCommentDecorations,
  commentHighlightKey,
  CommentHighlight,
  type ActiveComment,
} from "./CommentHighlight";
import type { DecorationSet } from "@tiptap/pm/view";
import type { CommentThread } from "./types";

interface Props {
  docId: string;
  user: { name: string; color: string };
}

/** Number of times `needle` appears in `text` before the selection start. */
export function occurrenceOf(before: string, anchorText: string): number {
  const needle = anchorText.trim();
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const found = before.indexOf(needle, pos);
    if (found === -1) break;
    count += 1;
    pos = found + needle.length;
  }
  return count;
}

/** Cheap structural comparison so we don't dispatch redundant decorate transactions. */
function sameRanges(a: DecorationSet | undefined, b: DecorationSet): boolean {
  if (!a) return false;
  const aList = a.find();
  const bList = b.find();
  if (aList.length !== bList.length) return false;
  return aList.every(
    (deco, i) => deco.from === bList[i].from && deco.to === bList[i].to
  );
}

export default function Editor({ docId, user }: Props) {
  const provider = useMemo(() => {
    const ydoc = new Y.Doc();
    return new HocuspocusProvider({
      url: `ws://localhost:1234`,
      name: docId,
      document: ydoc,
    });
  }, [docId]);

  useEffect(() => () => provider.destroy(), [provider]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Placeholder.configure({
        placeholder: "Start writing, or press '/' in your heart…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CommentHighlight,
      Collaboration.configure({ document: provider.document }),
      CollaborationCursor.configure({ provider, user }),
    ],
    editorProps: {
      attributes: { class: "ProseMirror", "data-doc-id": docId },
      handleClick: (_view, _pos, event) => {
        const el = (event.target as HTMLElement).closest(".comment-mark");
        const ids = el?.getAttribute("data-comment-ids");
        if (ids) {
          setActiveThread(ids.split(" ")[0]);
          return false;
        }
        return false;
      },
    },
  });

  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [showComments, setShowComments] = useState(true);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const selectionTick = useRef(0);

  const loadThreads = async () => {
    const res = await fetch(`/api/comments?docId=${encodeURIComponent(docId)}`);
    if (res.ok) setThreads(await res.json());
  };

  useEffect(() => {
    void loadThreads();
    const id = setInterval(loadThreads, 5000);
    return () => clearInterval(id);
  }, [docId]);

  // Rebuild text highlights whenever comments or document content change.
  useEffect(() => {
    if (!editor) return;

    const active: ActiveComment[] = threads.map((thread) => ({
      id: thread.id,
      anchorText: thread.anchorText,
      resolved: thread.resolved,
      occurrence: Number(thread.anchor.split(":")[1] ?? 0) || 0,
    }));

    const apply = () => {
      const next = buildCommentDecorations(editor.state.doc, active);
      const current = commentHighlightKey.getState(editor.state);
      if (sameRanges(current, next)) return;
      const tr = editor.state.tr.setMeta(commentHighlightKey, { decorations: next });
      editor.view.dispatch(tr);
    };

    apply();
    editor.on("update", apply);
    return () => {
      editor.off("update", apply);
    };
  }, [editor, threads]);

  const addThread = async (anchorText: string, anchor: string) => {
    const res = await fetch("/api/comments/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docId,
        anchor,
        anchorText: anchorText.slice(0, 240),
        author: user.name,
        authorColor: user.color,
      }),
    });
    if (res.ok) {
      const thread = (await res.json()) as CommentThread;
      setActiveThread(thread.id);
    }
    await loadThreads();
  };

  const addReply = async (threadId: string, body: string) => {
    await fetch(`/api/comments/threads/${threadId}/messages?docId=${encodeURIComponent(docId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: user.name, authorColor: user.color, body }),
    });
    await loadThreads();
  };

  const toggleResolved = async (threadId: string, resolved: boolean) => {
    await fetch(`/api/comments/threads/${threadId}?docId=${encodeURIComponent(docId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    await loadThreads();
  };

  const deleteThread = async (threadId: string) => {
    await fetch(`/api/comments/threads/${threadId}?docId=${encodeURIComponent(docId)}`, {
      method: "DELETE",
    });
    await loadThreads();
  };

  const commentSelection = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const anchorText = editor.state.doc.textBetween(from, to, " ").trim();
    if (!anchorText) return;

    const before = editor.state.doc.textBetween(0, from, " ");
    const occurrence = occurrenceOf(before, anchorText);
    void addThread(anchorText, `occ:${occurrence}`);
    editor.commands.focus();
  };

  const scrollToAnchor = (threadId: string) => {
    setActiveThread(threadId);
    const mark = document.querySelector<HTMLElement>(
      `.comment-mark[data-comment-ids~="${threadId}"]`
    );
    if (!mark) return;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    mark.classList.add("flash");
    setTimeout(() => mark.classList.remove("flash"), 1200);
  };

  if (!editor) return null;

  const hasSelection = editor.state.selection.from !== editor.state.selection.to;

  return (
    <div className="editor-shell">
      <div className="editor-wrap">
        <div className="toolbar">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive("bold") ? "active" : ""}
            title="Bold"
          >
            <b>B</b>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive("italic") ? "active" : ""}
            title="Italic"
          >
            <i>I</i>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive("strike") ? "active" : ""}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
          <span className="divider" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={editor.isActive("heading", { level: 1 }) ? "active" : ""}
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={editor.isActive("heading", { level: 3 }) ? "active" : ""}
          >
            H3
          </button>
          <span className="divider" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive("bulletList") ? "active" : ""}
            title="Bullet list"
          >
            •
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive("orderedList") ? "active" : ""}
            title="Numbered list"
          >
            1.
          </button>
          <button
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={editor.isActive("taskList") ? "active" : ""}
            title="Task list"
          >
            ☑
          </button>
          <span className="divider" />
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={editor.isActive("blockquote") ? "active" : ""}
            title="Quote"
          >
            ❝
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={editor.isActive("codeBlock") ? "active" : ""}
            title="Code block"
          >
            {"</>"}
          </button>
          <span className="divider" />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              commentSelection();
            }}
            disabled={!hasSelection}
            title="Comment on selected text"
          >
            💬
          </button>
          <button onClick={() => setShowComments((v) => !v)} title="Toggle comments pane">
            {showComments ? "Hide comments" : `Comments (${threads.length})`}
          </button>
        </div>
        <EditorContent editor={editor} className="editor-content" />
      </div>
      {showComments && (
        <CommentSidebar
          threads={threads}
          activeThreadId={activeThread}
          onAddReply={addReply}
          onResolve={toggleResolved}
          onDelete={deleteThread}
          onSelectAnchor={scrollToAnchor}
        />
      )}
    </div>
  );
}

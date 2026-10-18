import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

interface Props {
  docId: string;
  user: { name: string; color: string };
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

  useEffect(() => {
    return () => provider.destroy();
  }, [provider]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing, or press '/' in your heart…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Collaboration.configure({
        document: provider.document,
      }),
      CollaborationCursor.configure({
        provider,
        user,
      }),
    ],
  });

  if (!editor) return null;

  return (
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
      </div>
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}

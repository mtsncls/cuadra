import { useEffect, useRef, useState } from "react";

export interface FolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

export interface DocMeta {
  id: string;
  title: string;
  kind?: "doc" | "sheet";
  share?: { linkAccess: "edit" | "view" };
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  size?: number;
}

export interface Tree {
  folders: FolderMeta[];
  docs: DocMeta[];
}

export interface DragPayload {
  kind: "doc" | "folder";
  id: string;
}

interface PendingNew {
  kind: "doc" | "folder";
  parentId: string | null;
}

interface Props {
  tree: Tree;
  activeDocId: string | null;
  collapsed: Set<string>;
  onToggle: (folderId: string) => void;
  onSelectDoc: (id: string) => void;
  onCreateDoc: (parentId: string | null, title: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => void;
  onRenameDoc: (doc: DocMeta, title: string) => void;
  onRenameFolder: (folder: FolderMeta, name: string) => void;
  onDeleteDoc: (doc: DocMeta) => void;
  onDeleteFolder: (folder: FolderMeta) => void;
  onMove: (payload: DragPayload, parentId: string | null) => void;
  pendingNew: PendingNew | null;
  onRequestNewDoc: (parentId: string | null) => void;
  onRequestNewFolder: (parentId: string | null) => void;
  onCancelNew: () => void;
}

function sortByName<T extends { name?: string; title?: string }>(a: T, b: T): number {
  const an = (a.name ?? a.title ?? "").toLocaleLowerCase();
  const bn = (b.name ?? b.title ?? "").toLocaleLowerCase();
  return an.localeCompare(bn);
}

function InlineInput({
  placeholder,
  initialValue,
  indent,
  icon,
  onCommit,
  onCancel,
}: {
  placeholder: string;
  initialValue?: string;
  indent: number;
  icon: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const trimmed = value.trim();
    if (trimmed) onCommit(trimmed);
    else onCancel();
  };

  return (
    <div className="row editing" style={{ paddingLeft: 8 + indent * 14 }}>
      <span className="row-icon">{icon}</span>
      <input
        ref={inputRef}
        className="inline-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            committed.current = true;
            onCancel();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

export default function Sidebar({
  tree,
  activeDocId,
  collapsed,
  onToggle,
  onSelectDoc,
  onCreateDoc,
  onCreateFolder,
  onRenameDoc,
  onRenameFolder,
  onDeleteDoc,
  onDeleteFolder,
  onMove,
  pendingNew,
  onRequestNewDoc,
  onRequestNewFolder,
  onCancelNew,
}: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const childrenOf = (parentId: string | null) => ({
    folders: tree.folders.filter((f) => f.parentId === parentId).sort(sortByName),
    docs: tree.docs.filter((d) => d.parentId === parentId).sort(sortByName),
  });

  const countDescendants = (folderId: string): number => {
    const { folders, docs } = childrenOf(folderId);
    return (
      folders.length +
      docs.length +
      folders.reduce((sum, f) => sum + countDescendants(f.id), 0)
    );
  };

  function handleDrop(targetParentId: string | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(null);
      const raw = e.dataTransfer.getData("application/x-cuadra");
      if (!raw) return;
      try {
        onMove(JSON.parse(raw) as DragPayload, targetParentId);
      } catch {
        /* ignore malformed drag data */
      }
    };
  }

  function dragProps(payload: DragPayload) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData("application/x-cuadra", JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      },
    };
  }

  function renderNewRow(parentId: string | null, depth: number) {
    if (!pendingNew || pendingNew.parentId !== parentId) return null;
    const isFolder = pendingNew.kind === "folder";
    return (
      <InlineInput
        icon={isFolder ? "📁" : "📄"}
        indent={depth}
        placeholder={isFolder ? "Folder name" : "Document title"}
        onCommit={(value) =>
          isFolder ? onCreateFolder(parentId, value) : onCreateDoc(parentId, value)
        }
        onCancel={onCancelNew}
      />
    );
  }

  function renderDoc(doc: DocMeta, depth: number) {
    if (renamingId === doc.id) {
      return (
        <InlineInput
          key={doc.id}
          icon={doc.kind === "sheet" ? "📊" : "📄"}
          indent={depth}
          initialValue={doc.title}
          placeholder="Document title"
          onCommit={(value) => {
            setRenamingId(null);
            onRenameDoc(doc, value);
          }}
          onCancel={() => setRenamingId(null)}
        />
      );
    }
    return (
      <div
        key={doc.id}
        className={`row doc ${doc.id === activeDocId ? "active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelectDoc(doc.id)}
        data-doc-kind={doc.kind ?? "doc"}
        {...dragProps({ kind: "doc", id: doc.id })}
      >
        <span className="row-icon">{doc.kind === "sheet" ? "📊" : "📄"}</span>
        <span className="row-label">{doc.title}</span>
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          <button title="Rename" onClick={() => setRenamingId(doc.id)}>
            ✎
          </button>
          <button title="Delete" onClick={() => onDeleteDoc(doc)}>
            🗑
          </button>
        </span>
      </div>
    );
  }

  function renderFolder(folder: FolderMeta, depth: number) {
    const isCollapsed = collapsed.has(folder.id);
    const { folders, docs } = childrenOf(folder.id);
    const isEmpty = folders.length + docs.length === 0;
    const total = countDescendants(folder.id);
    const showNewRow = pendingNew?.parentId === folder.id;

    const header =
      renamingId === folder.id ? (
        <InlineInput
          key={folder.id}
          icon="📁"
          indent={depth}
          initialValue={folder.name}
          placeholder="Folder name"
          onCommit={(value) => {
            setRenamingId(null);
            onRenameFolder(folder, value);
          }}
          onCancel={() => setRenamingId(null)}
        />
      ) : (
        <div
          className={`row folder ${dragOver === folder.id ? "drop-target" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => onToggle(folder.id)}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(folder.id);
          }}
          onDragLeave={() => setDragOver((cur) => (cur === folder.id ? null : cur))}
          onDrop={handleDrop(folder.id)}
          {...dragProps({ kind: "folder", id: folder.id })}
        >
          <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>
          <span className="row-icon">📁</span>
          <span className="row-label">{folder.name}</span>
          {isCollapsed && total > 0 && <span className="badge">{total}</span>}
          <span className="row-actions" onClick={(e) => e.stopPropagation()}>
            <button
              title="New document"
              onClick={() => {
                if (isCollapsed) onToggle(folder.id);
                onRequestNewDoc(folder.id);
              }}
            >
              ＋
            </button>
            <button
              title="New subfolder"
              onClick={() => {
                if (isCollapsed) onToggle(folder.id);
                onRequestNewFolder(folder.id);
              }}
            >
              🗂
            </button>
            <button title="Rename" onClick={() => setRenamingId(folder.id)}>
              ✎
            </button>
            <button title="Delete" onClick={() => onDeleteFolder(folder)}>
              🗑
            </button>
          </span>
        </div>
      );

    return (
      <div key={folder.id}>
        {header}
        {(!isCollapsed || showNewRow) && (
          <div>
            {folders.map((child) => renderFolder(child, depth + 1))}
            {renderNewRow(folder.id, depth + 1)}
            {docs.map((doc) => renderDoc(doc, depth + 1))}
            {isEmpty && !showNewRow && (
              <div className="row empty-hint" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
                empty — drag docs here
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const root = childrenOf(null);

  return (
    <nav
      className={`doc-list ${dragOver === "root" ? "root-drop" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver("root");
      }}
      onDragLeave={() => setDragOver((cur) => (cur === "root" ? null : cur))}
      onDrop={handleDrop(null)}
    >
      {root.folders.map((folder) => renderFolder(folder, 0))}
      {renderNewRow(null, 0)}
      {root.docs.map((doc) => renderDoc(doc, 0))}
      {root.folders.length + root.docs.length === 0 && !pendingNew && (
        <div className="row empty-hint">No documents yet</div>
      )}
    </nav>
  );
}

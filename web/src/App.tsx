import { useCallback, useEffect, useState } from "react";
import Editor from "./Editor";
import SheetEditor from "./SheetEditor";
import Sidebar, {
  type DocMeta,
  type DragPayload,
  type FolderMeta,
  type Tree,
} from "./Sidebar";

const COLORS = [
  "#e11d48", "#ea580c", "#ca8a04", "#16a34a",
  "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function loadCollapsed(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem("openquip:collapsed") ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

function docIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("doc");
}

export default function App() {
  const [tree, setTree] = useState<Tree>({ folders: [], docs: [] });
  const [activeId, setActiveId] = useState<string | null>(docIdFromUrl);
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [name, setName] = useState(() => localStorage.getItem("openquip:name") ?? "");
  const [color, setColor] = useState(
    () => localStorage.getItem("openquip:color") ?? randomColor()
  );
  const [naming, setNaming] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [pendingNew, setPendingNew] = useState<{
    kind: "doc" | "folder";
    parentId: string | null;
  } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tree");
    if (res.ok) setTree(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!name) return;
    localStorage.setItem("openquip:name", name);
    localStorage.setItem("openquip:color", color);
  }, [name, color]);

  useEffect(() => {
    localStorage.setItem("openquip:collapsed", JSON.stringify([...collapsed]));
  }, [collapsed]);

  // Keep the URL in sync so docs are deep-linkable / shareable.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set("doc", activeId);
    else url.searchParams.delete("doc");
    window.history.replaceState(null, "", url.toString());
  }, [activeId]);

  // Open the doc from the URL once the tree has loaded.
  useEffect(() => {
    const fromUrl = docIdFromUrl();
    if (fromUrl && tree.docs.some((d) => d.id === fromUrl)) setActiveId(fromUrl);
  }, [tree]);

  const toggleCollapsed = (folderId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });

  const api = {
    createDoc: async (parentId: string | null, title: string, kind: "doc" | "sheet" = "doc") => {
      setPendingNew(null);
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, parentId, kind }),
      });
      if (!res.ok) return;
      const doc = (await res.json()) as DocMeta;
      setActiveId(doc.id);
      await refresh();
    },
    createFolder: async (parentId: string | null, folderName: string) => {
      setPendingNew(null);
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName, parentId }),
      });
      await refresh();
    },
    patch: async (kind: "doc" | "folder", id: string, body: Record<string, unknown>) => {
      const endpoint = kind === "doc" ? "/api/docs/" : "/api/folders/";
      const res = await fetch(endpoint + encodeURIComponent(id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(payload.error ?? "Could not complete the operation");
      }
      await refresh();
    },
    move: (payload: DragPayload, parentId: string | null) =>
      api.patch(payload.kind, payload.id, { parentId }),
  };

  async function renameDoc(doc: DocMeta, title: string) {
    if (title === doc.title) return;
    await api.patch("doc", doc.id, { title });
  }

  async function deleteDoc(doc: DocMeta) {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    await fetch(`/api/docs/${encodeURIComponent(doc.id)}`, { method: "DELETE" });
    if (activeId === doc.id) setActiveId(null);
    await refresh();
  }

  async function renameFolder(folder: FolderMeta, newName: string) {
    if (newName === folder.name) return;
    await api.patch("folder", folder.id, { name: newName });
  }

  async function deleteFolder(folder: FolderMeta) {
    if (
      !window.confirm(
        `Delete folder "${folder.name}"?\nDocuments inside move to the parent folder.`
      )
    )
      return;
    await fetch(`/api/folders/${encodeURIComponent(folder.id)}`, { method: "DELETE" });
    await refresh();
  }

  if (naming || !name) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <h1>OpenQuip</h1>
          <p>Free collaborative docs &amp; checklists.</p>
          <p>What should we call you?</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = (new FormData(e.currentTarget).get("name") as string)?.trim();
              if (!value) return;
              setColor(randomColor());
              setName(value);
              setNaming(false);
            }}
          >
            <input name="name" placeholder="Your name" autoFocus maxLength={40} />
            <button type="submit">Start writing</button>
          </form>
        </div>
      </div>
    );
  }

  const activeDoc = tree.docs.find((d) => d.id === activeId) ?? null;
  const requestedAccess =
    new URLSearchParams(window.location.search).get("as") === "view" ? "view" : "edit";
  const readOnly = Boolean(
    activeDoc && (activeDoc.share?.linkAccess === "view" || requestedAccess === "view")
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">OpenQuip</span>
          <span className="header-actions">
            <button
              className="btn ghost icon"
              title="New folder (root)"
              onClick={() => setPendingNew({ kind: "folder", parentId: null })}
            >
              🗂
            </button>
            <button
              className="btn ghost icon"
              title="New spreadsheet (root)"
              onClick={() => void api.createDoc(null, "", "sheet")}
            >
              📊
            </button>
            <button
              className="btn primary"
              onClick={() => setPendingNew({ kind: "doc", parentId: null })}
            >
              + New
            </button>
          </span>
        </div>
        <Sidebar
          tree={tree}
          activeDocId={activeId}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onSelectDoc={setActiveId}
          onCreateDoc={(parentId, title) => api.createDoc(parentId, title)}
          onCreateFolder={(parentId, folderName) => api.createFolder(parentId, folderName)}
          onRenameDoc={renameDoc}
          onDeleteDoc={deleteDoc}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onMove={api.move}
          pendingNew={pendingNew}
          onRequestNewDoc={(parentId) => setPendingNew({ kind: "doc", parentId })}
          onRequestNewFolder={(parentId) => setPendingNew({ kind: "folder", parentId })}
          onCancelNew={() => setPendingNew(null)}
        />
        <div className="sidebar-footer">
          <span className="avatar" style={{ background: color }}>
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="user-name">{name}</span>
          <button className="btn ghost" onClick={() => setNaming(true)}>
            Change
          </button>
        </div>
      </aside>
      <main className="main">
        {activeDoc ? (
          <>
            <div className="doc-header">
              <span className="doc-header-title">{activeDoc.title}</span>
              {readOnly && <span className="view-only-badge">View only</span>}
              <button
                className="btn ghost"
                onClick={() => {
                  const suffix = activeDoc.share?.linkAccess === "view" ? "&as=view" : "";
                  const link = `${window.location.origin}/?doc=${encodeURIComponent(
                    activeDoc.id
                  )}${suffix}`;
                  void navigator.clipboard?.writeText(link).catch(() => undefined);
                  setShareNotice("Link copied");
                  window.setTimeout(() => setShareNotice(""), 2000);
                }}
                title="Copy a shareable link to this document"
              >
                🔗 Share
              </button>
              <label className="share-access">
                Link access
                <select
                  value={activeDoc.share?.linkAccess ?? "edit"}
                  onChange={(e) =>
                    void api.patch("doc", activeDoc.id, {
                      share: { linkAccess: e.target.value },
                    })
                  }
                >
                  <option value="edit">Anyone with the link can edit</option>
                  <option value="view">Anyone with the link can view</option>
                </select>
              </label>
              {shareNotice && <span className="share-notice">{shareNotice}</span>}
            </div>
            {readOnly && (
              <div className="read-only-banner">
                You are viewing this document with a view-only link.
              </div>
            )}
            {activeDoc.kind === "sheet" ? (
              <SheetEditor
                key={activeDoc.id}
                docId={activeDoc.id}
                user={{ name, color }}
                readOnly={readOnly}
              />
            ) : (
              <Editor
                key={activeDoc.id}
                docId={activeDoc.id}
                user={{ name, color }}
                readOnly={readOnly}
              />
            )}
          </>
        ) : (
          <div className="empty">
            <h2>Select or create a document</h2>
            <p>Docs sync in real time. Drag them between folders in the sidebar.</p>
            <button
              className="btn primary"
              onClick={() => setPendingNew({ kind: "doc", parentId: null })}
            >
              + New document
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import { Server } from "@hocuspocus/server";

const DATA_DIR = join(process.cwd(), "data");
const DOCS_DIR = join(DATA_DIR, "docs");
const TREE_FILE = join(DATA_DIR, "tree.json");
const LEGACY_META_FILE = join(DATA_DIR, "docs.json");

const WS_PORT = 1234;
const API_PORT = 3001;

mkdirSync(DOCS_DIR, { recursive: true });

interface FolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

interface DocMeta {
  id: string;
  title: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Tree {
  folders: FolderMeta[];
  docs: DocMeta[];
}

function emptyTree(): Tree {
  return { folders: [], docs: [] };
}

function migrateLegacy(): Tree | null {
  if (!existsSync(LEGACY_META_FILE)) return null;
  try {
    const legacy = JSON.parse(readFileSync(LEGACY_META_FILE, "utf8")) as DocMeta[];
    return {
      folders: [],
      docs: legacy.map((d) => ({ ...d, parentId: null })),
    };
  } catch {
    return null;
  }
}

function loadTree(): Tree {
  if (existsSync(TREE_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(TREE_FILE, "utf8")) as Partial<Tree>;
      return {
        folders: parsed.folders ?? [],
        docs: (parsed.docs ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          parentId: d.parentId ?? null,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      };
    } catch {
      return emptyTree();
    }
  }
  const migrated = migrateLegacy();
  if (migrated) {
    saveTree(migrated);
    return migrated;
  }
  return emptyTree();
}

function saveTree(tree: Tree): void {
  const tmp = `${TREE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(tree, null, 2));
  renameSync(tmp, TREE_FILE);
}

function docPath(id: string): string {
  return join(DOCS_DIR, `${id}.ydoc`);
}

function slugify(value: string, fallback = "doc"): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || fallback
  );
}

function uniqueId(value: string, fallback: string, taken: (id: string) => boolean): string {
  const base = slugify(value, fallback);
  let id = base;
  let n = 1;
  while (taken(id)) id = `${base}-${++n}`;
  return id;
}

function uniqueDocId(title: string, tree: Tree): string {
  return uniqueId(
    title,
    "doc",
    (id) => tree.docs.some((d) => d.id === id) || existsSync(docPath(id))
  );
}

function uniqueFolderId(name: string, tree: Tree): string {
  return uniqueId(name, "folder", (id) => tree.folders.some((f) => f.id === id));
}

function isFolder(tree: Tree, id: string | null): boolean {
  if (id === null) return true;
  return tree.folders.some((f) => f.id === id);
}

/** Returns true if `ancestorId` is `nodeId` itself or one of its ancestors. */
function isAncestorOrSelf(tree: Tree, ancestorId: string, nodeId: string): boolean {
  let current: string | null = nodeId;
  while (current) {
    if (current === ancestorId) return true;
    current = tree.folders.find((f) => f.id === current)?.parentId ?? null;
  }
  return false;
}

function touchDoc(id: string, title?: string): void {
  const tree = loadTree();
  const doc = tree.docs.find((d) => d.id === id);
  const now = new Date().toISOString();
  if (doc) {
    doc.updatedAt = now;
    if (title !== undefined) doc.title = title;
  } else {
    tree.docs.push({ id, title: title ?? id, parentId: null, createdAt: now, updatedAt: now });
  }
  saveTree(tree);
}

function seedIfEmpty(): void {
  if (loadTree().docs.length > 0 || loadTree().folders.length > 0) return;
  const now = new Date().toISOString();
  const tree = loadTree();
  tree.folders.push({ id: "getting-started", name: "Getting started", parentId: null, createdAt: now });
  tree.docs.push({
    id: "welcome",
    title: "Welcome to OpenQuip",
    parentId: "getting-started",
    createdAt: now,
    updatedAt: now,
  });
  saveTree(tree);

  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  const lines = [
    "Welcome to OpenQuip — a free, open collaborative doc.",
    "",
    "Try this:",
    "- Open this same doc in another browser tab",
    "- Edit at the same time: changes sync live",
    "- Use the checklist button in the toolbar",
    "- Drag documents into folders in the sidebar",
    "",
    "Features in this prototype:",
    "1. Folders and documents (nested sidebar)",
    "2. Rich text: headings, bold, lists, quotes, code",
    "3. Task lists with checkboxes",
    "4. Real-time collaboration with named cursors",
    "",
  ];
  const nodes = lines.map((line) => {
    const para = new Y.XmlElement("paragraph");
    if (line) para.insert(0, [new Y.XmlText(line)]);
    return para as unknown as Y.XmlElement | Y.XmlText;
  });
  fragment.insert(0, nodes);
  writeFileSync(docPath("welcome"), Y.encodeStateAsUpdate(ydoc));
}

seedIfEmpty();

const hocuspocus = new Server({
  port: WS_PORT,
  async onLoadDocument({ document, documentName }) {
    const path = docPath(documentName);
    if (existsSync(path)) {
      const update = readFileSync(path);
      if (update.byteLength > 0) {
        Y.applyUpdate(document, new Uint8Array(update), "load");
      }
    }
    touchDoc(documentName);
    return document;
  },
  async onStoreDocument({ document, documentName }) {
    const path = docPath(documentName);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, Y.encodeStateAsUpdate(document));
    renameSync(tmp, path);
    touchDoc(documentName);
  },
});

await hocuspocus.listen();

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

function json(res: import("node:http").ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

const api = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${API_PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  try {
    // Full tree used by the sidebar.
    if (method === "GET" && (path === "/api/tree" || path === "/api/docs")) {
      const tree = loadTree();
      const docs = tree.docs.map((d) => {
        const p = docPath(d.id);
        return { ...d, size: existsSync(p) ? statSync(p).size : 0 };
      });
      if (path === "/api/docs") {
        json(res, 200, docs);
      } else {
        json(res, 200, { folders: tree.folders, docs });
      }
      return;
    }

    // --- Folders ---
    if (method === "POST" && path === "/api/folders") {
      const { name, parentId = null } = JSON.parse((await readBody(req)) || "{}");
      const tree = loadTree();
      if (!isFolder(tree, parentId)) {
        json(res, 400, { error: "Parent folder not found" });
        return;
      }
      const finalName = String(name ?? "").trim() || "New folder";
      const folder: FolderMeta = {
        id: uniqueFolderId(finalName, tree),
        name: finalName,
        parentId,
        createdAt: new Date().toISOString(),
      };
      tree.folders.push(folder);
      saveTree(tree);
      json(res, 201, folder);
      return;
    }

    if (path.startsWith("/api/folders/")) {
      const id = decodeURIComponent(path.slice("/api/folders/".length));
      const tree = loadTree();
      const folder = tree.folders.find((f) => f.id === id);
      if (!folder) {
        json(res, 404, { error: "Folder not found" });
        return;
      }

      if (method === "PATCH") {
        const { name, parentId } = JSON.parse((await readBody(req)) || "{}");
        if (typeof name === "string" && name.trim()) folder.name = name.trim();
        if (parentId !== undefined) {
          if (!isFolder(tree, parentId)) {
            json(res, 400, { error: "Parent folder not found" });
            return;
          }
          if (parentId !== null && isAncestorOrSelf(tree, id, parentId)) {
            json(res, 400, { error: "Cannot move a folder into itself" });
            return;
          }
          folder.parentId = parentId;
        }
        saveTree(tree);
        json(res, 200, folder);
        return;
      }

      if (method === "DELETE") {
        // Non-destructive: children bubble up to the deleted folder's parent.
        for (const child of tree.folders) {
          if (child.parentId === id) child.parentId = folder.parentId;
        }
        for (const doc of tree.docs) {
          if (doc.parentId === id) doc.parentId = folder.parentId;
        }
        tree.folders = tree.folders.filter((f) => f.id !== id);
        saveTree(tree);
        res.writeHead(204).end();
        return;
      }
    }

    // --- Documents ---
    if (method === "POST" && path === "/api/docs") {
      const { title, parentId = null } = JSON.parse((await readBody(req)) || "{}");
      const tree = loadTree();
      if (!isFolder(tree, parentId)) {
        json(res, 400, { error: "Parent folder not found" });
        return;
      }
      const finalTitle = String(title ?? "").trim() || "Untitled";
      const id = uniqueDocId(finalTitle, tree);
      const now = new Date().toISOString();
      tree.docs.push({ id, title: finalTitle, parentId, createdAt: now, updatedAt: now });
      saveTree(tree);
      writeFileSync(docPath(id), Y.encodeStateAsUpdate(new Y.Doc()));
      json(res, 201, { id, title: finalTitle, parentId });
      return;
    }

    if (path.startsWith("/api/docs/")) {
      const id = decodeURIComponent(path.slice("/api/docs/".length));
      const tree = loadTree();
      const doc = tree.docs.find((d) => d.id === id);
      if (!doc) {
        json(res, 404, { error: "Document not found" });
        return;
      }

      if (method === "PATCH") {
        const { title, parentId } = JSON.parse((await readBody(req)) || "{}");
        if (typeof title === "string" && title.trim()) doc.title = title.trim();
        if (parentId !== undefined) {
          if (!isFolder(tree, parentId)) {
            json(res, 400, { error: "Parent folder not found" });
            return;
          }
          doc.parentId = parentId;
        }
        doc.updatedAt = new Date().toISOString();
        saveTree(tree);
        json(res, 200, doc);
        return;
      }

      if (method === "DELETE") {
        tree.docs = tree.docs.filter((d) => d.id !== id);
        saveTree(tree);
        const p = docPath(id);
        if (existsSync(p)) {
          const trash = join(DATA_DIR, "trash");
          mkdirSync(trash, { recursive: true });
          renameSync(p, join(trash, `${id}-${Date.now()}.ydoc`));
        }
        res.writeHead(204).end();
        return;
      }
    }

    json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
});

api.listen(API_PORT, () => {
  const tree = loadTree();
  console.log(`OpenQuip server`);
  console.log(`  WebSocket (collab):  ws://localhost:${WS_PORT}`);
  console.log(`  REST API (tree):     http://localhost:${API_PORT}/api/tree`);
  console.log(`  Data directory:      ${DOCS_DIR}`);
  console.log(`  Folders:             ${tree.folders.length}`);
  console.log(`  Documents:           ${tree.docs.length} (${readdirSync(DOCS_DIR).length} files)`);
});

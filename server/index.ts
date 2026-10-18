import { docToMarkdown, sheetToCsv } from "./markdown.js";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import {
  clearCookie,
  createSession,
  destroySession,
  findUserById,
  findUserByHandle,
  listUsers,
  readCookie,
  registerUser,
  SESSION_COOKIE,
  sessionCookie,
  toPublicUser,
  userForCookie,
  verifyPassword,
  type PublicUser,
  type User,
} from "./auth.js";
import { Server } from "@hocuspocus/server";
import {
  loadAllComments,
  loadComments,
  newMessageId,
  newThreadId,
  saveComments,
  type CommentMessage,
  type CommentThread,
} from "./comments.js";
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

type DocKind = "doc" | "sheet";
type LinkAccess = "restricted" | "edit" | "view";

interface DocShare {
  /** Who can reach the doc through a link, and what they may do. */
  linkAccess: LinkAccess;
}

type MemberRole = "editor" | "viewer";
type Access = "edit" | "view";

interface DocMeta {
  id: string;
  title: string;
  kind: DocKind;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  share: DocShare;
  /** null for documents created before accounts existed — those stay open. */
  ownerId: string | null;
  /** Per-user grants, keyed by user id. */
  members: Record<string, MemberRole>;
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
      docs: legacy.map((d) => ({
        ...d,
        kind: "doc" as const,
        parentId: null,
        share: { linkAccess: "edit" as const },
        ownerId: null,
        members: {},
      })),
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
          kind: d.kind === "sheet" ? "sheet" : "doc",
          parentId: d.parentId ?? null,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          share: { linkAccess: normalizeLinkAccess(d.share?.linkAccess) },
          ownerId: typeof d.ownerId === "string" ? d.ownerId : null,
          members: d.members ?? {},
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

function normalizeLinkAccess(value: unknown): LinkAccess {
  if (value === "view") return "view";
  if (value === "restricted") return "restricted";
  return "edit";
}

/** Whether `user` (possibly anonymous) may see the document at all. */
function canSee(doc: DocMeta, user: User | null): boolean {
  if (user && doc.ownerId === user.id) return true;
  if (user && doc.members[user.id]) return true;
  if (!doc.ownerId) return true; // documents created before accounts existed
  return doc.share.linkAccess !== "restricted";
}

/** What `user` (possibly anonymous) is allowed to do with `doc`. */
function accessFor(doc: DocMeta, user: User | null): Access {
  if (user && doc.ownerId === user.id) return "edit";
  const role = user ? doc.members[user.id] : undefined;
  if (role === "editor") return "edit";
  if (role === "viewer") return "view";
  if (!doc.ownerId) return "edit";
  if (doc.share.linkAccess === "edit") return "edit";
  return "view"; // view links and restricted docs are read-only without a grant
}

/** Read a document's stored Yjs state into a fresh Y.Doc (no live session). */
function loadYDoc(id: string): Y.Doc {
  const doc = new Y.Doc();
  const path = docPath(id);
  if (existsSync(path)) {
    const update = readFileSync(path);
    if (update.byteLength > 0) Y.applyUpdate(doc, new Uint8Array(update), "load");
  }
  return doc;
}

function touchDoc(id: string, title?: string): void {
  const tree = loadTree();
  const doc = tree.docs.find((d) => d.id === id);
  const now = new Date().toISOString();
  if (doc) {
    doc.updatedAt = now;
    if (title !== undefined) doc.title = title;
  } else {
    tree.docs.push({
      id,
      title: title ?? id,
      kind: "doc",
      parentId: null,
      createdAt: now,
      updatedAt: now,
      share: { linkAccess: "edit" },
      ownerId: null,
      members: {},
    });
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
    title: "Welcome to Cuadra",
    kind: "doc",
    parentId: "getting-started",
    createdAt: now,
    updatedAt: now,
    share: { linkAccess: "edit" },
    ownerId: null,
    members: {},
  });
  saveTree(tree);

  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  const lines = [
    "Welcome to Cuadra — a free, open collaborative doc.",
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
  async onAuthenticate({ token, documentName, connectionConfig, requestHeaders }) {
    // Priority: per-user permissions first, then the link access the client
    // asked for. A doc shared view-only can never be escalated to edit.
    const user = userForCookie(requestHeaders.cookie as string | undefined);
    const doc = loadTree().docs.find((d) => d.id === documentName);
    if (doc && !canSee(doc, user)) {
      throw new Error("You do not have access to this document");
    }
    const access: Access = doc ? accessFor(doc, user) : token === "view" ? "view" : "edit";
    connectionConfig.readOnly = access === "view";
    return { access, user: user ? toPublicUser(user) : null };
  },
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
  const currentUser = userForCookie(req.headers.cookie);

  try {
    // --- Auth ---
    if (method === "GET" && path === "/api/auth/me") {
      json(res, 200, { user: currentUser ? toPublicUser(currentUser) : null });
      return;
    }

    if (method === "POST" && path === "/api/auth/register") {
      const { name = "", password = "" } = JSON.parse((await readBody(req)) || "{}");
      try {
        const user = registerUser(String(name), String(password));
        res.setHeader("Set-Cookie", sessionCookie(createSession(user.id).token));
        json(res, 201, { user: toPublicUser(user) });
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : "Could not register" });
      }
      return;
    }

    if (method === "POST" && path === "/api/auth/login") {
      const { name = "", password = "" } = JSON.parse((await readBody(req)) || "{}");
      const user = findUserByHandle(String(name));
      if (!user || !verifyPassword(user, String(password))) {
        json(res, 401, { error: "Wrong name or password" });
        return;
      }
      res.setHeader("Set-Cookie", sessionCookie(createSession(user.id).token));
      json(res, 200, { user: toPublicUser(user) });
      return;
    }

    if (method === "POST" && path === "/api/auth/logout") {
      const token = readCookie(req.headers.cookie, SESSION_COOKIE);
      if (token) destroySession(token);
      res.setHeader("Set-Cookie", clearCookie());
      json(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/api/users") {
      json(res, 200, listUsers());
      return;
    }
    // Full tree used by the sidebar.
    if (method === "GET" && (path === "/api/tree" || path === "/api/docs")) {
      const tree = loadTree();
      const docs = tree.docs
        .filter((d) => canSee(d, currentUser))
        .map((d) => {
          const p = docPath(d.id);
          return {
            ...d,
            access: accessFor(d, currentUser),
            size: existsSync(p) ? statSync(p).size : 0,
          };
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
      const { title, parentId = null, kind = "doc" } = JSON.parse((await readBody(req)) || "{}");
      const tree = loadTree();
      if (!isFolder(tree, parentId)) {
        json(res, 400, { error: "Parent folder not found" });
        return;
      }
      const docKind: DocKind = kind === "sheet" ? "sheet" : "doc";
      const fallbackTitle = docKind === "sheet" ? "Untitled sheet" : "Untitled";
      const finalTitle = String(title ?? "").trim() || fallbackTitle;
      const id = uniqueDocId(finalTitle, tree);
      const now = new Date().toISOString();
      tree.docs.push({
        id,
        title: finalTitle,
        kind: docKind,
        parentId,
        createdAt: now,
        updatedAt: now,
        share: { linkAccess: currentUser ? "restricted" : "edit" },
        ownerId: currentUser ? currentUser.id : null,
        members: {},
      });
      saveTree(tree);
      writeFileSync(docPath(id), Y.encodeStateAsUpdate(new Y.Doc()));
      json(res, 201, { id, title: finalTitle, kind: docKind, parentId });
      return;
    }

    // --- Export ---
    if (path.startsWith("/api/docs/") && path.endsWith("/export")) {
      const id = decodeURIComponent(path.slice("/api/docs/".length, -"/export".length));
      const doc = loadTree().docs.find((d) => d.id === id);
      if (!doc || !canSee(doc, currentUser)) {
        json(res, 404, { error: "Document not found" });
        return;
      }
      const ydoc = loadYDoc(id);
      const format = (url.searchParams.get("format") ?? (doc.kind === "sheet" ? "csv" : "md")).toLowerCase();
      const body =
        format === "csv" ? sheetToCsv(ydoc) : docToMarkdown(ydoc, doc.title);
      const extension = format === "csv" ? "csv" : "md";
      const contentType =
        format === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${slugify(doc.title)}.${extension}"`,
      });
      res.end(body);
      return;
    }

    // --- Sharing (per-user members) ---
    if (path.startsWith("/api/docs/") && path.includes("/members")) {
      const rest = path.slice("/api/docs/".length);
      const [rawId, , memberId] = rest.split("/");
      const id = decodeURIComponent(rawId);
      const tree = loadTree();
      const doc = tree.docs.find((d) => d.id === id);
      if (!doc || !canSee(doc, currentUser)) {
        json(res, 404, { error: "Document not found" });
        return;
      }
      const isOwner = !doc.ownerId || doc.ownerId === currentUser?.id;

      if (method === "GET") {
        const ownerUser = doc.ownerId ? findUserById(doc.ownerId) : null;
        json(res, 200, {
          owner: ownerUser ? toPublicUser(ownerUser) : null,
          members: Object.entries(doc.members)
            .map(([userId, role]) => {
              const u = findUserById(userId);
              return u ? { user: toPublicUser(u), role } : null;
            })
            .filter(Boolean),
          linkAccess: doc.share.linkAccess,
          canManage: isOwner,
        });
        return;
      }

      if (!isOwner) {
        json(res, 403, { error: "Only the owner can manage sharing" });
        return;
      }

      if (method === "POST" && !memberId) {
        const { name = "", role = "editor" } = JSON.parse((await readBody(req)) || "{}");
        const invitee = findUserByHandle(String(name));
        if (!invitee) {
          json(res, 404, { error: "No user with that name" });
          return;
        }
        if (invitee.id === doc.ownerId) {
          json(res, 400, { error: "That user already owns this document" });
          return;
        }
        doc.members[invitee.id] = role === "viewer" ? "viewer" : "editor";
        saveTree(tree);
        json(res, 201, { user: toPublicUser(invitee), role: doc.members[invitee.id] });
        return;
      }

      if (memberId) {
        const userId = decodeURIComponent(memberId);
        if (!doc.members[userId]) {
          json(res, 404, { error: "That user is not a member" });
          return;
        }
        if (method === "PATCH") {
          const { role = "editor" } = JSON.parse((await readBody(req)) || "{}");
          doc.members[userId] = role === "viewer" ? "viewer" : "editor";
          saveTree(tree);
          json(res, 200, { userId, role: doc.members[userId] });
          return;
        }
        if (method === "DELETE") {
          delete doc.members[userId];
          saveTree(tree);
          res.writeHead(204).end();
          return;
        }
      }
    }

    if (path.startsWith("/api/docs/")) {
      const id = decodeURIComponent(path.slice("/api/docs/".length));
      const tree = loadTree();
      const doc = tree.docs.find((d) => d.id === id);
      if (!doc || !canSee(doc, currentUser)) {
        json(res, 404, { error: "Document not found" });
        return;
      }

      if (method === "PATCH") {
        const { title, parentId, share } = JSON.parse((await readBody(req)) || "{}");
        const body = { title, parentId, share };
        if (accessFor(doc, currentUser) !== "edit") {
          json(res, 403, { error: "You do not have edit access to this document" });
          return;
        }
        if (body.share && typeof body.share === "object") {
          // Only the owner (or an ownerless doc) may change sharing settings.
          if (doc.ownerId && doc.ownerId !== currentUser?.id) {
            json(res, 403, { error: "Only the owner can change sharing" });
            return;
          }
          doc.share = { linkAccess: normalizeLinkAccess(body.share.linkAccess) };
        }
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
        json(res, 200, { ...doc, access: accessFor(doc, currentUser) });
        return;
      }

      if (method === "DELETE") {
        if (accessFor(doc, currentUser) !== "edit") {
          json(res, 403, { error: "You do not have edit access to this document" });
          return;
        }
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


    // --- Comments ---
    if (method === "GET" && path === "/api/comments") {
      const docId = url.searchParams.get("docId");
      if (!docId) {
        // Inbox view: every thread, tagged with its document.
        const tree = loadTree();
        const titles = new Map(tree.docs.map((d) => [d.id, d.title]));
        json(
          res,
          200,
          loadAllComments()
            .filter((thread) => {
              const d = tree.docs.find((x) => x.id === thread.docId);
              return !!d && canSee(d, currentUser);
            })
            .map((thread) => ({
              ...thread,
              docTitle: titles.get(thread.docId) ?? thread.docId,
            }))
        );
        return;
      }
      const seen = loadTree().docs.find((d) => d.id === docId);
      json(res, 200, seen && canSee(seen, currentUser) ? loadComments(docId) : []);
      return;
    }

    if (method === "POST" && path === "/api/comments/threads") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const { docId, anchor, anchorText = "", author = "Anonymous", authorColor = "#2563eb" } = body;
      if (!docId || !anchor) {
        json(res, 400, { error: "docId and anchor required" });
        return;
      }
      const doc = loadTree().docs.find((d) => d.id === docId);
      if (doc && (!canSee(doc, currentUser) || accessFor(doc, currentUser) !== "edit")) {
        json(res, 403, { error: "You do not have edit access to this document" });
        return;
      }
      const now = new Date().toISOString();
      const thread = {
        id: newThreadId(),
        docId: String(docId),
        anchor: String(anchor),
        anchorText: String(anchorText),
        author: String(author),
        authorColor: String(authorColor),
        resolved: false,
        createdAt: now,
        updatedAt: now,
        messages: [] as CommentMessage[],
      };
      const threads = loadComments(docId);
      threads.push(thread);
      saveComments(docId, threads);
      json(res, 201, thread);
      return;
    }

    if (path.startsWith("/api/comments/threads/")) {
      const suffix = path.slice("/api/comments/threads/".length);
      const parts = suffix.split("/");
      const threadId = decodeURIComponent(parts[0]);
      const docIdParam = url.searchParams.get("docId");
      if (!docIdParam) {
        json(res, 400, { error: "docId required" });
        return;
      }
      const commentDoc = loadTree().docs.find((d) => d.id === docIdParam);
      const canWrite = !!commentDoc && canSee(commentDoc, currentUser) && accessFor(commentDoc, currentUser) === "edit";
      if (!canWrite && (method === "POST" || method === "PATCH" || method === "DELETE")) {
        json(res, 403, { error: "You do not have edit access to this document" });
        return;
      }
      const all = loadComments(docIdParam);
      const idx = all.findIndex((t) => t.id === threadId);
      if (idx === -1) {
        json(res, 404, { error: "Thread not found" });
        return;
      }
      const thread = all[idx];

      if (method === "POST" && parts[1] === "messages") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const {
          author = currentUser?.name ?? "Anonymous",
          authorColor = currentUser?.color ?? "#2563eb",
          body: text,
        } = body;
        if (!text || !String(text).trim()) {
          json(res, 400, { error: "body required" });
          return;
        }
        const now = new Date().toISOString();
        const msg: CommentMessage = {
          id: newMessageId(),
          author: String(author),
          authorColor: String(authorColor),
          body: String(text).trim(),
          createdAt: now,
        };
        thread.messages.push(msg);
        thread.updatedAt = now;
        all[idx] = thread;
        saveComments(docIdParam, all);
        json(res, 201, msg);
        return;
      }

      if (method === "PATCH") {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (typeof body.resolved === "boolean") thread.resolved = body.resolved;
        if (typeof body.anchorText === "string") thread.anchorText = String(body.anchorText);
        thread.updatedAt = new Date().toISOString();
        all[idx] = thread;
        saveComments(docIdParam, all);
        json(res, 200, thread);
        return;
      }

      if (method === "DELETE") {
        all.splice(idx, 1);
        saveComments(docIdParam, all);
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
  console.log(`Cuadra server`);
  console.log(`  WebSocket (collab):  ws://localhost:${WS_PORT}`);
  console.log(`  REST API (tree):     http://localhost:${API_PORT}/api/tree`);
  console.log(`  Data directory:      ${DOCS_DIR}`);
  console.log(`  Folders:             ${tree.folders.length}`);
  console.log(`  Documents:           ${tree.docs.length} (${readdirSync(DOCS_DIR).length} files)`);
});

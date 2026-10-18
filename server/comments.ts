import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const COMMENTS_DIR = join(DATA_DIR, "comments");

mkdirSync(COMMENTS_DIR, { recursive: true });

export interface CommentThread {
  id: string;
  docId: string;
  anchor: string; // e.g. 'paragraph-<pos>' or custom key derived from selection range
  anchorText: string;
  author: string;
  authorColor: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  messages: CommentMessage[];
}

export interface CommentMessage {
  id: string;
  author: string;
  authorColor: string;
  body: string;
  createdAt: string;
}

export function commentsPath(docId: string): string {
  return join(COMMENTS_DIR, `${docId}.json`);
}

export function loadComments(docId: string): CommentThread[] {
  const p = commentsPath(docId);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as CommentThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveComments(docId: string, threads: CommentThread[]): void {
  const p = commentsPath(docId);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(threads, null, 2));
  renameSync(tmp, p);
}

let threadCounter = 0;
let msgCounter = 0;

export function newThreadId(): string {
  threadCounter += 1;
  return `t${Date.now().toString(36)}-${threadCounter}`;
}

export function newMessageId(): string {
  msgCounter += 1;
  return `m${Date.now().toString(36)}-${msgCounter}`;
}

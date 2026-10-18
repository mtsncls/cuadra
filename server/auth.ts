import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const USERS_FILE = join(DATA_DIR, "users.json");
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");
const SESSION_COOKIE = "cuadra_session";

mkdirSync(DATA_DIR, { recursive: true });

export interface User {
  id: string;
  name: string;
  /** Lowercased name, used for unique lookups. */
  handle: string;
  color: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

/** A user as sent to clients (never includes hashes). */
export interface PublicUser {
  id: string;
  name: string;
  color: string;
}

interface Session {
  token: string;
  userId: string;
  createdAt: string;
}

const COLORS = [
  "#e11d48", "#ea580c", "#ca8a04", "#16a34a",
  "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

function loadUsers(): User[] {
  return readJson<User[]>(USERS_FILE, []);
}

function saveUsers(users: User[]): void {
  writeJson(USERS_FILE, users);
}

function loadSessions(): Session[] {
  return readJson<Session[]>(SESSIONS_FILE, []);
}

function saveSessions(sessions: Session[]): void {
  writeJson(SESSIONS_FILE, sessions);
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, color: user.color };
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function findUserByHandle(handle: string): User | undefined {
  const normalized = handle.trim().toLowerCase();
  return loadUsers().find((u) => u.handle === normalized);
}

export function findUserById(id: string): User | undefined {
  return loadUsers().find((u) => u.id === id);
}

export function listUsers(): PublicUser[] {
  return loadUsers().map(toPublicUser);
}

export function registerUser(name: string, password: string): User {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Name must be at least 2 characters");
  if (password.length < 6) throw new Error("Password must be at least 6 characters");
  if (findUserByHandle(trimmed)) throw new Error("That name is already taken");

  const users = loadUsers();
  const salt = randomBytes(16).toString("hex");
  const user: User = {
    id: randomUUID(),
    name: trimmed,
    handle: trimmed.toLowerCase(),
    color: COLORS[users.length % COLORS.length],
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

export function verifyPassword(user: User, password: string): boolean {
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.salt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSession(userId: string): Session {
  const sessions = loadSessions().filter((s) => Date.now() - Date.parse(s.createdAt) < 30 * 86_400_000);
  const session: Session = {
    token: randomBytes(32).toString("hex"),
    userId,
    createdAt: new Date().toISOString(),
  };
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

export function destroySession(token: string): void {
  saveSessions(loadSessions().filter((s) => s.token !== token));
}

export function userForToken(token: string | null | undefined): User | null {
  if (!token) return null;
  const session = loadSessions().find((s) => s.token === token);
  if (!session) return null;
  return findUserById(session.userId) ?? null;
}

export function userForCookie(cookieHeader: string | undefined): User | null {
  return userForToken(readCookie(cookieHeader, SESSION_COOKIE));
}

export function sessionCookie(token: string, maxAgeSeconds = 30 * 86_400): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export { SESSION_COOKIE };

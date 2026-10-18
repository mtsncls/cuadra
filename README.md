# Cuadra

Free, open-source collaborative documents, checklists and spreadsheets.

Cuadra started as a Quip-inspired prototype: docs, todos, comments and sheets that
sync live between everyone who has the link.

## Stack

- **Frontend:** React 19 + TipTap (rich text, task lists) + Vite
- **Backend:** Hocuspocus (Yjs WebSocket collaboration) + Node HTTP API
- **Sync model:** CRDTs via Yjs — real-time, offline-tolerant, no operational-transform server logic
- **Persistence:** binary Yjs updates on disk (`data/docs/*.ydoc`)

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173 — open the same doc in two browser tabs to see live collaboration.

## Features

- Folders: nested, unlimited depth, expand/collapse (persisted per browser)
- Sidebar tree: folders + documents, alphabetical, drag & drop to move/nest
- Inline create/rename (no native dialogs); delete moves docs to `data/trash`
- Documents with rich text: headings, bold/italic/strike, lists, quotes, code blocks
- Task lists with checkboxes (Quip-style todos)
- Real-time multiplayer editing with named, colored cursors
- Comments anchored to text: highlight in the document, threads, replies, resolve/delete
- @-mentions in comments with a notifications inbox (🔔) listing mentions of you
- Presence bar listing everyone in the document, with "follow" mode that tracks a collaborator's caret
- Spreadsheets as a second document kind: live-synced grid with formulas (`=SUM(A1:A5)`, `=A1*B2`)
- Accounts (name + password, scrypt-hashed) — optional: anonymous visitors keep working with link access
- Per-user permissions: owners and invited members (`Can edit` / `Can view`) see documents in their own sidebar
- Sharing dialog: link access (`restricted` / anyone with the link can edit / can view) plus a member list
- Restricted by default: documents you create are private to you until you share them
- Document templates: meeting notes, project plan, weekly review, reading notes, decision log
- Export: download documents as Markdown and spreadsheets as CSV (⬇ in the header)
- Deep-linkable documents (`/?doc=<id>`, `&as=view` for a read-only view)
- Durable storage on disk (`data/tree.json` metadata + `data/docs/*.ydoc`)

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/tree` | Full tree: `{ folders, docs }` |
| POST | `/api/folders` | Create folder `{ name, parentId }` |
| PATCH | `/api/folders/:id` | Rename or move `{ name?, parentId? }` |
| DELETE | `/api/folders/:id` | Delete folder; children move to its parent |
| POST | `/api/docs` | Create doc `{ title, parentId, kind, template }` (`kind: "doc" \| "sheet"`) |
| PATCH | `/api/docs/:id` | Rename or move `{ title?, parentId? }` |
| DELETE | `/api/docs/:id` | Delete doc (moved to `data/trash`) |
| GET  | `/api/docs/:id/export?format=md\|csv` | Export a doc as Markdown or a sheet as CSV |
| GET  | `/api/templates` | List built-in document templates |
| POST | `/api/auth/register` | Create an account `{ name, password }`; sets the session cookie |
| POST | `/api/auth/login` | Sign in `{ name, password }`; sets the session cookie |
| POST | `/api/auth/logout` | Clear the session |
| GET  | `/api/auth/me` | Current account (`{ user }` or `{ user: null }`) |
| GET  | `/api/users` | List accounts (for the share autocomplete) |
| GET  | `/api/docs/:id/members` | Sharing info: `{ owner, members, linkAccess, canManage }` |
| POST | `/api/docs/:id/members` | Add a member `{ name, role }` (owner only) |
| PATCH | `/api/docs/:id/members/:userId` | Change a member's role (owner only) |
| DELETE | `/api/docs/:id/members/:userId` | Remove a member (owner only) |
| GET  | `/api/comments?docId=:id` | List comment threads for a document |
| GET  | `/api/comments` | List every thread (notifications inbox), tagged with `docId` + `docTitle` |
| POST | `/api/comments/threads` | Create a thread `{ docId, anchor, anchorText, author, authorColor }` |
| POST | `/api/comments/threads/:id/messages?docId=` | Add a reply |
| PATCH | `/api/comments/threads/:id?docId=` | Update a thread `{ resolved?, anchorText? }` |
| DELETE | `/api/comments/threads/:id?docId=` | Delete a thread |

Folder moves are cycle-checked server-side: a folder can never become its own descendant.

### Access rules

Documents you create while signed in are **restricted** by default: only you (and people
you invite) can see them. Link access can widen that to "anyone with the link can view"
or "...can edit". Documents created before accounts existed (or by anonymous visitors)
have no owner and stay open to everyone.

Access is enforced on the server, not just in the UI: the tree only lists documents you
may see, doc/comment writes check `edit` access, and the collaboration WebSocket refuses
connections (or forces read-only) based on the same rules. Accounts and sessions live in
`data/users.json` and `data/sessions.json` (gitignored).

## Ports

| Service   | Port |
|-----------|------|
| Web (Vite)| 5173 |
| Collab WS | 1234 |
| REST API  | 3001 |

## Data model notes

- Accounts are optional. Anonymous visitors get a local display name and edit
  ownerless/open documents exactly like before.
- Folders are currently shared by everyone with server access (folder-level
  permissions are not implemented yet).

## Roadmap ideas

- Sheet charts, more functions and column/row resizing
- Folder-level permissions and an activity feed
- Custom/user-defined templates

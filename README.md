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
- Deep-linkable documents (`/?doc=<id>`) and a Share button that copies the link
- Durable storage on disk (`data/tree.json` metadata + `data/docs/*.ydoc`)

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/tree` | Full tree: `{ folders, docs }` |
| POST | `/api/folders` | Create folder `{ name, parentId }` |
| PATCH | `/api/folders/:id` | Rename or move `{ name?, parentId? }` |
| DELETE | `/api/folders/:id` | Delete folder; children move to its parent |
| POST | `/api/docs` | Create doc `{ title, parentId, kind }` (`kind: "doc" \| "sheet"`) |
| PATCH | `/api/docs/:id` | Rename or move `{ title?, parentId? }` |
| DELETE | `/api/docs/:id` | Delete doc (moved to `data/trash`) |
| GET  | `/api/comments?docId=:id` | List comment threads for a document |
| GET  | `/api/comments` | List every thread (notifications inbox), tagged with `docId` + `docTitle` |
| POST | `/api/comments/threads` | Create a thread `{ docId, anchor, anchorText, author, authorColor }` |
| POST | `/api/comments/threads/:id/messages?docId=` | Add a reply |
| PATCH | `/api/comments/threads/:id?docId=` | Update a thread `{ resolved?, anchorText? }` |
| DELETE | `/api/comments/threads/:id?docId=` | Delete a thread |

Folder moves are cycle-checked server-side: a folder can never become its own descendant.

## Ports

| Service   | Port |
|-----------|------|
| Web (Vite)| 5173 |
| Collab WS | 1234 |
| REST API  | 3001 |

## Roadmap ideas

- Auth with real multi-user accounts (today identity is a local display name)
- Per-user share permissions (today access is per-link: edit or view-only)
- Markdown export and doc templates
- Sheet charts, more functions and column/row resizing

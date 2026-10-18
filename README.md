# OpenQuip

Free, open-source collaborative documents + checklists (Quip-inspired prototype).

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

## Features (MVP)

- Folders: nested, unlimited depth, expand/collapse (persisted per browser)
- Sidebar tree: folders + documents, alphabetical, drag & drop to move/nest
- Inline create/rename (no native dialogs); delete moves docs to `data/trash`
- Multiple documents with rich text: headings, bold/italic/strike, lists, quotes, code blocks
- Task lists with checkboxes (Quip-style todos)
- Real-time multiplayer editing with named, colored cursors
- Durable storage on disk (`data/tree.json` metadata + `data/docs/*.ydoc`)

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/tree` | Full tree: `{ folders, docs }` |
| POST | `/api/folders` | Create folder `{ name, parentId }` |
| PATCH | `/api/folders/:id` | Rename or move `{ name?, parentId? }` |
| DELETE | `/api/folders/:id` | Delete folder; children move to its parent |
| POST | `/api/docs` | Create doc `{ title, parentId }` |
| PATCH | `/api/docs/:id` | Rename or move `{ title?, parentId? }` |
| DELETE | `/api/docs/:id` | Delete doc (moved to `data/trash`) |

Folder moves are cycle-checked server-side: a folder can never become its own descendant.

## Ports

| Service   | Port |
|-----------|------|
| Web (Vite)| 5173 |
| Collab WS | 1234 |
| REST API  | 3001 |

## Roadmap ideas

- Comments/threads anchored to text
- Folder organization + share permissions
- Spreadsheet module
- Presence list + follow mode
- Auth (multi-user accounts)

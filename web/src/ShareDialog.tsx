import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "./Auth";

interface Member {
  user: PublicUser;
  role: "editor" | "viewer";
}

interface ShareInfo {
  owner: PublicUser | null;
  members: Member[];
  linkAccess: "restricted" | "edit" | "view";
  canManage: boolean;
}

interface Props {
  docId: string;
  docTitle: string;
  me: PublicUser | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Sharing dialog: link access plus per-account permissions. */
export default function ShareDialog({ docId, docTitle, me, onClose, onChanged }: Props) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [allUsers, setAllUsers] = useState<PublicUser[]>([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/docs/${encodeURIComponent(docId)}/members`);
    if (res.ok) setInfo((await res.json()) as ShareInfo);
  }, [docId]);

  useEffect(() => {
    void load();
    void fetch("/api/users")
      .then((res) => (res.ok ? res.json() : []))
      .then((users: PublicUser[]) => setAllUsers(users))
      .catch(() => undefined);
  }, [load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2000);
  }

  async function setLinkAccess(value: string) {
    await fetch(`/api/docs/${encodeURIComponent(docId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share: { linkAccess: value } }),
    });
    await load();
    onChanged();
  }

  async function invite(form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const role = String(data.get("role") ?? "editor");
    if (!name) return;
    const res = await fetch(`/api/docs/${encodeURIComponent(docId)}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      flash(payload.error ?? "Could not add that person");
      return;
    }
    form.reset();
    await load();
    onChanged();
  }

  async function changeRole(userId: string, role: string) {
    await fetch(
      `/api/docs/${encodeURIComponent(docId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }
    );
    await load();
    onChanged();
  }

  async function remove(userId: string) {
    await fetch(
      `/api/docs/${encodeURIComponent(docId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
    await load();
    onChanged();
  }

  const link = `${window.location.origin}/?doc=${encodeURIComponent(docId)}`;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal share-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Share “{docTitle}”</h2>
        <p className="modal-sub">
          People you add see this document in their sidebar. Everyone else only gets
          what the link allows.
        </p>

        {info?.canManage && (
          <label className="share-row">
            Link access
            <select
              value={info.linkAccess}
              onChange={(e) => void setLinkAccess(e.target.value)}
            >
              <option value="restricted">Only people with access</option>
              <option value="edit">Anyone with the link can edit</option>
              <option value="view">Anyone with the link can view</option>
            </select>
          </label>
        )}

        <div className="share-copy">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button
            className="btn ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(link).catch(() => undefined);
              flash("Link copied");
            }}
          >
            Copy
          </button>
        </div>

        {info?.canManage && (
          <form
            className="share-invite"
            onSubmit={(e) => {
              e.preventDefault();
              void invite(e.currentTarget);
            }}
          >
            <input
              name="name"
              list="cuadra-users"
              placeholder="Add people by name"
              autoComplete="off"
            />
            <datalist id="cuadra-users">
              {allUsers.map((u) => (
                <option key={u.id} value={u.name} />
              ))}
            </datalist>
            <select name="role" defaultValue="editor">
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button type="submit" className="btn primary">
              Invite
            </button>
          </form>
        )}

        {notice && <p className="share-notice">{notice}</p>}

        <div className="member-list">
          {info?.owner && (
            <div className="member-row">
              <span className="avatar small" style={{ background: info.owner.color }}>
                {info.owner.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="member-name">
                {info.owner.name}
                {me?.id === info.owner.id && <span className="member-you"> (you)</span>}
              </span>
              <span className="member-role">Owner</span>
            </div>
          )}
          {info?.members.map((m) => (
            <div className="member-row" key={m.user.id}>
              <span className="avatar small" style={{ background: m.user.color }}>
                {m.user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="member-name">
                {m.user.name}
                {me?.id === m.user.id && <span className="member-you"> (you)</span>}
              </span>
              {info.canManage ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => void changeRole(m.user.id, e.target.value)}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button className="btn ghost" onClick={() => void remove(m.user.id)}>
                    Remove
                  </button>
                </>
              ) : (
                <span className="member-role">
                  {m.role === "editor" ? "Can edit" : "Can view"}
                </span>
              )}
            </div>
          ))}
          {!info?.owner && !info?.members.length && (
            <p className="modal-sub">This document is not owned by an account yet.</p>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

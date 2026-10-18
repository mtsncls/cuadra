import { useState } from "react";
import { renderBody } from "./Notifications";
import { type CommentThread } from "./types";

interface Props {
  threads: CommentThread[];
  activeThreadId: string | null;
  readOnly?: boolean;
  onAddReply: (threadId: string, body: string) => void;
  onResolve: (threadId: string, resolved: boolean) => void;
  onDelete: (threadId: string) => void;
  onSelectAnchor: (threadId: string) => void;
}

export default function CommentSidebar({
  threads,
  activeThreadId,
  readOnly = false,
  onAddReply,
  onResolve,
  onDelete,
  onSelectAnchor,
}: Props) {
  const sorted = [...threads].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const open = sorted.filter((t) => !t.resolved);
  const resolved = sorted.filter((t) => t.resolved);

  return (
    <aside className="comment-sidebar">
      <div className="comment-sidebar-header">
        <span className="comment-title">
          Comments {open.length > 0 && <span className="count">{open.length}</span>}
        </span>
        {sorted.length === 0 && (
          <span className="comment-empty">Select text and press 💬 to start a thread</span>
        )}
      </div>
      <div className="comment-list">
        {[...open, ...resolved].map((thread) => (
          <div
            key={thread.id}
            data-thread-id={thread.id}
            className={`comment-thread ${thread.resolved ? "resolved" : ""} ${
              thread.id === activeThreadId ? "active" : ""
            }`}
          >
            <div className="comment-quote" onClick={() => onSelectAnchor(thread.id)}>
              “{thread.anchorText || "Selected text"}”
            </div>
            {thread.messages.length === 0 ? (
              <div className="comment-item">
                <div className="comment-meta">
                  <span className="comment-author" style={{ color: thread.authorColor }}>
                    {thread.author}
                  </span>
                  <span className="comment-date">{new Date(thread.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="comment-body">(started a thread)</div>
              </div>
            ) : (
              thread.messages.map((msg) => (
                <div key={msg.id} className="comment-item">
                  <div className="comment-meta">
                    <span className="comment-author" style={{ color: msg.authorColor }}>
                      {msg.author}
                    </span>
                    <span className="comment-date">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="comment-body">{renderBody(msg.body)}</div>
                </div>
              ))
            )}
            {readOnly ? (
              <div className="reply-readonly">Read-only link — commenting is disabled</div>
            ) : (
              <ReplyBox
                onSubmit={(text) => onAddReply(thread.id, text)}
                onResolve={() => onResolve(thread.id, !thread.resolved)}
                onDelete={() => onDelete(thread.id)}
                resolved={thread.resolved}
              />
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function ReplyBox({
  onSubmit,
  onResolve,
  onDelete,
  resolved,
}: {
  onSubmit: (text: string) => void;
  onResolve: () => void;
  onDelete: () => void;
  resolved: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue("");
  };

  return (
    <div className="reply-box">
      <textarea
        className="reply-textarea"
        rows={2}
        placeholder="Reply..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="reply-actions">
        <button className="btn ghost small" onClick={submit}>
          Reply
        </button>
        <button className="btn ghost small" onClick={onResolve}>
          {resolved ? "Unresolve" : "Resolve"}
        </button>
        <button className="btn ghost small danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

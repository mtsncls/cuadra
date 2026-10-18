import { Fragment, useEffect, useState } from "react";

interface Thread extends Record<string, unknown> {
  id: string;
  docId: string;
  docTitle?: string;
  anchorText?: string;
  messages?: Array<{ id: string; author: string; body: string; createdAt: string }>;
}

interface Props {
  me: string;
  onOpenDoc: (docId: string) => void;
}

const MENTION = /@[A-Za-z0-9_.\-áéíóúÁÉÍÓÚñÑ]+/g;

/** Renders a comment body, highlighting @mentions. */
export function renderBody(text: string, me?: string) {
  const parts = text.split(MENTION);
  const matches = text.match(MENTION) ?? [];
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    nodes.push(<Fragment key={`t${i}`}>{part}</Fragment>);
    const mention = matches[i];
    if (mention) {
      const isMe = me ? mention.slice(1).toLowerCase() === me.toLowerCase() : false;
      nodes.push(
        <mark key={`m${i}`} className={`mention ${isMe ? "mention-me" : ""}`}>
          {mention}
        </mark>
      );
    }
  });
  return nodes;
}

function mentionsMe(text: string, me: string): boolean {
  return (text.match(MENTION) ?? []).some(
    (m) => m.slice(1).toLowerCase() === me.toLowerCase()
  );
}

export default function Notifications({ me, onOpenDoc }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() =>
    Number(localStorage.getItem("openquip:notificationsSeen") ?? 0)
  );

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/comments");
      if (res.ok) setThreads((await res.json()) as Thread[]);
    };
    void load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const mentions = threads
    .flatMap((thread) =>
      (thread.messages ?? [])
        .filter((msg) => mentionsMe(msg.body, me))
        .map((msg) => ({ thread, msg }))
    )
    .sort((a, b) => b.msg.createdAt.localeCompare(a.msg.createdAt));

  const unread = mentions.filter((m) => Date.parse(m.msg.createdAt) > seenAt).length;

  const toggle = () => {
    setOpen((v) => !v);
    if (!open) {
      const now = Date.now();
      localStorage.setItem("openquip:notificationsSeen", String(now));
      setSeenAt(now);
    }
  };

  return (
    <div className="notifications">
      <button className="btn ghost icon" onClick={toggle} title="Mentions of you">
        🔔
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="notifications-panel">
          <div className="notifications-title">Mentions of you</div>
          {mentions.length === 0 && <div className="notifications-empty">Nothing yet</div>}
          {mentions.map(({ thread, msg }) => (
            <button
              key={msg.id}
              className="notification-item"
              onClick={() => {
                onOpenDoc(thread.docId);
                setOpen(false);
              }}
            >
              <span className="notification-doc">{thread.docTitle ?? thread.docId}</span>
              <span className="notification-body">{renderBody(msg.body, me)}</span>
              <span className="notification-meta">
                {msg.author} · {new Date(msg.createdAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Editor } from "@tiptap/react";

interface Peer {
  clientId: number;
  name: string;
  color: string;
}

interface Props {
  provider: HocuspocusProvider;
  editor: Editor | null;
  selfClientId: number | null;
}

function readPeers(provider: HocuspocusProvider, selfClientId: number | null): Peer[] {
  const states = provider.awareness?.getStates() ?? new Map();
  const peers: Peer[] = [];
  states.forEach((state, clientId) => {
    if (clientId === selfClientId) return;
    const user = state.user as { name?: string; color?: string } | undefined;
    if (!user?.name) return;
    peers.push({ clientId, name: user.name, color: user.color ?? "#888" });
  });
  return peers.sort((a, b) => a.name.localeCompare(b.name));
}

export default function PresenceBar({ provider, editor, selfClientId }: Props) {
  const [peers, setPeers] = useState<Peer[]>(() => readPeers(provider, selfClientId));
  const [following, setFollowing] = useState<number | null>(null);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const update = () => setPeers(readPeers(provider, selfClientId));
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider, selfClientId]);

  // Follow mode: keep the followed peer's caret in view.
  // Remote carets are rendered by CollaborationCursor as
  // `.collaboration-cursor__caret` elements labelled with the peer's name.
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness || following === null || !editor) return;

    const peer = peers.find((p) => p.clientId === following);
    if (!peer) return;

    let lastTop: number | null = null;

    const sync = () => {
      const carets = Array.from(
        document.querySelectorAll<HTMLElement>(".collaboration-cursor__caret")
      );
      const target =
        carets.find(
          (el) => el.querySelector(".collaboration-cursor__label")?.textContent === peer.name
        ) ?? carets.find((el) => el.style.borderColor === peer.color);
      if (!target) return;

      const top = target.getBoundingClientRect().top;
      const moved = lastTop === null || Math.abs(top - lastTop) > 2;
      if (!moved) return;
      lastTop = top;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("follow-pulse");
      window.setTimeout(() => target.classList.remove("follow-pulse"), 600);
    };

    sync();
    awareness.on("change", sync);
    const interval = window.setInterval(sync, 400);
    return () => {
      awareness.off("change", sync);
      window.clearInterval(interval);
    };
  }, [provider, following, editor, peers]);

  useEffect(() => {
    if (following !== null && !peers.some((p) => p.clientId === following)) {
      setFollowing(null);
    }
  }, [peers, following]);

  return (
    <div className="presence-bar">
      <span className="presence-label">Live</span>
      {peers.length === 0 && <span className="presence-empty">only you</span>}
      {peers.map((peer) => (
        <button
          key={peer.clientId}
          className={`presence-chip ${following === peer.clientId ? "following" : ""}`}
          onClick={() => setFollowing((cur) => (cur === peer.clientId ? null : peer.clientId))}
          title={
            following === peer.clientId
              ? `Stop following ${peer.name}`
              : `Follow ${peer.name}`
          }
        >
          <span className="avatar" style={{ background: peer.color }}>
            {peer.name.slice(0, 1).toUpperCase()}
          </span>
          {peer.name}
          {following === peer.clientId && <span className="following-tag">following</span>}
        </button>
      ))}
    </div>
  );
}

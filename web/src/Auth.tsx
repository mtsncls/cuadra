import { useState } from "react";

export interface PublicUser {
  id: string;
  name: string;
  color: string;
}

interface Props {
  onClose: () => void;
  /** Called with the signed-in account once the cookie is set. */
  onSignedIn: (user: PublicUser) => void;
}

type Mode = "login" | "register";

/**
 * Sign-in / sign-up dialog. Accounts are optional in Cuadra: anonymous
 * visitors keep working with link-based access, while accounts unlock
 * per-user document permissions.
 */
export default function AuthDialog({ onClose, onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!name || !password) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const payload = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok || !payload.user) {
        setError(payload.error ?? "Something went wrong");
        return;
      }
      onSignedIn(payload.user);
      onClose();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal auth-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{mode === "login" ? "Sign in" : "Create an account"}</h2>
        <p className="modal-sub">
          {mode === "login"
            ? "Welcome back. Your documents and permissions follow your account."
            : "Pick a name and password — documents you create become yours."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          <label>
            Name
            <input name="name" autoFocus maxLength={40} autoComplete="username" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </div>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "No account yet? Create one"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

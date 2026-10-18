import { useEffect, useState } from "react";

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
}

interface Props {
  parentId: string | null;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    kind: "doc" | "sheet";
    template: string;
  }) => void;
}

/** "New document" dialog: name it, pick a kind and (for docs) a template. */
export default function NewDocDialog({ parentId, onClose, onCreate }: Props) {
  void parentId;
  const [kind, setKind] = useState<"doc" | "sheet">("doc");
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);

  useEffect(() => {
    void fetch("/api/templates")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: TemplateSummary[]) => setTemplates(list))
      .catch(() => undefined);
  }, []);

  function submit(form: HTMLFormElement) {
    const title = String(new FormData(form).get("title") ?? "").trim();
    onCreate({ title, kind, template: kind === "doc" ? template : "" });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal new-doc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>New</h2>
        <p className="modal-sub">Name it, then start from a template if you like.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          <label>
            Title
            <input name="title" autoFocus maxLength={80} placeholder="Untitled" />
          </label>

          <div className="kind-toggle">
            <button
              type="button"
              className={kind === "doc" ? "active" : ""}
              onClick={() => setKind("doc")}
            >
              📄 Document
            </button>
            <button
              type="button"
              className={kind === "sheet" ? "active" : ""}
              onClick={() => setKind("sheet")}
            >
              📊 Spreadsheet
            </button>
          </div>

          {kind === "doc" && (
            <label>
              Template
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="">Blank</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.description}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

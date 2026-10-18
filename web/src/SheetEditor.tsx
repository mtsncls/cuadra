import { useEffect, useMemo, useState } from "react";
import SheetChart, { suggestRange } from "./SheetChart";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

interface Props {
  docId: string;
  user: { name: string; color: string };
  readOnly?: boolean;
}

import {
  cellKey,
  colLabel,
  numericValue,
  parseRef,
  resolveCell,
  type Lookup,
} from "./formula";

const COLS = 10;
const ROWS = 20;

export default function SheetEditor({ docId, user, readOnly = false }: Props) {
  const provider = useMemo(() => {
    const ydoc = new Y.Doc();
    return new HocuspocusProvider({
      url: "ws://localhost:1234",
      name: docId,
      document: ydoc,
      token: readOnly ? "view" : "edit",
    });
  }, [docId, readOnly]);

  useEffect(() => () => provider.destroy(), [provider]);

  const cells = useMemo(() => provider.document.getMap<string>("cells"), [provider]);
  const chartMap = useMemo(() => provider.document.getMap<string>("chart"), [provider]);
  const [, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [extraRows, setExtraRows] = useState(0);

  useEffect(() => {
    const observer = () => setVersion((v) => v + 1);
    cells.observe(observer);
    chartMap.observe(observer);
    return () => {
      cells.unobserve(observer);
      chartMap.unobserve(observer);
    };
  }, [cells, chartMap]);

  useEffect(() => {
    // Publish our identity so collaborators show up in the presence bar.
    provider.awareness?.setLocalStateField("user", user);
  }, [provider, user]);

  const lookup: Lookup = (row, col) => cells.get(cellKey(row, col)) ?? "";

  const rows = ROWS + extraRows;

  // Charts are stored in the document so everyone sees the same view.
  const chart = {
    range: chartMap.get("range") ?? "",
    type: (chartMap.get("type") === "line" ? "line" : "bar") as "bar" | "line",
  };

  function setChart(next: { range: string; type: "bar" | "line" }) {
    if (readOnly) return;
    chartMap.set("range", next.range);
    chartMap.set("type", next.type);
  }

  const setCell = (row: number, col: number, value: string) => {
    if (readOnly) return;
    const key = cellKey(row, col);
    if (value === "") cells.delete(key);
    else cells.set(key, value);
  };

  return (
    <div className="sheet-shell">
      <div className="sheet-toolbar">
        <span className="sheet-hint">
          Type a value or a formula like <code>=SUM(A1:A5)</code>
        </span>
        <button className="btn ghost" disabled={readOnly} onClick={() => setExtraRows((r) => r + 5)}>
          + Rows
        </button>
      </div>
      <div className="sheet-scroll">
        <table className="sheet" data-doc-id={docId}>
          <thead>
            <tr>
              <th className="corner" />
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c}>{colLabel(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th className="row-head">{r + 1}</th>
                {Array.from({ length: COLS }, (_, c) => {
                  const key = cellKey(r, c);
                  const raw = lookup(r, c);
                  const isEditing = editing === key;
                  const display = isEditing ? raw : raw.startsWith("=") ? resolveCell(r, c, lookup, new Set()) : raw;
                  return (
                    <td key={c} className={raw.startsWith("=") ? "formula" : ""}>
                      <input
                        value={display}
                        data-cell={key}
                        readOnly={readOnly}
                        onFocus={() => setEditing(key)}
                        onBlur={() => setEditing(null)}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const next = document.querySelector<HTMLInputElement>(
                              `[data-cell="${cellKey(Math.min(r + 1, rows - 1), c)}"]`
                            );
                            next?.focus();
                          }
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SheetChart
        lookup={lookup}
        config={{
          range: chart.range || suggestRange(lookup, COLS, rows),
          type: chart.type,
        }}
        onChange={setChart}
        readOnly={readOnly}
      />
    </div>
  );
}

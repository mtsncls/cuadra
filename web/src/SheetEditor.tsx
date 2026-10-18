import { useEffect, useMemo, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

interface Props {
  docId: string;
  user: { name: string; color: string };
}

const COLS = 10;
const ROWS = 20;

function colLabel(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function parseRef(ref: string): { row: number; col: number } | null {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref.trim());
  if (!match) return null;
  const col = match[1]
    .toUpperCase()
    .split("")
    .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { row: Number(match[2]) - 1, col };
}

type Lookup = (row: number, col: number) => string;

/** Evaluates simple spreadsheets formulas: SUM(A1:B3), cell refs and + - * / ( ). */
function evaluate(raw: string, lookup: Lookup, visiting: Set<string>): string {
  const text = raw.trim();
  if (!text.startsWith("=")) return text;
  const expr = text.slice(1);

  let pos = 0;
  const skip = () => {
    while (expr[pos] === " ") pos += 1;
  };

  const parseExpression = (): number => {
    let value = parseTerm();
    for (;;) {
      skip();
      const ch = expr[pos];
      if (ch === "+" || ch === "-") {
        pos += 1;
        const rhs = parseTerm();
        value = ch === "+" ? value + rhs : value - rhs;
      } else break;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    for (;;) {
      skip();
      const ch = expr[pos];
      if (ch === "*" || ch === "/") {
        pos += 1;
        const rhs = parseFactor();
        value = ch === "*" ? value * rhs : value / rhs;
      } else break;
    }
    return value;
  };

  const parseFactor = (): number => {
    skip();
    if (expr[pos] === "-") {
      pos += 1;
      return -parseFactor();
    }
    if (expr[pos] === "+") {
      pos += 1;
      return parseFactor();
    }
    if (expr[pos] === "(") {
      pos += 1;
      const value = parseExpression();
      skip();
      if (expr[pos] === ")") pos += 1;
      return value;
    }

    const rest = expr.slice(pos);
    const sumMatch = /^SUM\s*\(\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)\s*\)/i.exec(rest);
    if (sumMatch) {
      pos += sumMatch[0].length;
      const start = parseRef(sumMatch[1]);
      const end = parseRef(sumMatch[2]);
      if (!start || !end) return 0;
      let total = 0;
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r += 1) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c += 1) {
          total += numericValue(cellKey(r, c), lookup, visiting);
        }
      }
      return total;
    }

    const numberMatch = /^\d+(\.\d+)?/.exec(rest);
    if (numberMatch) {
      pos += numberMatch[0].length;
      return Number(numberMatch[0]);
    }

    const refMatch = /^\$?[A-Za-z]+\$?\d+/.exec(rest);
    if (refMatch) {
      pos += refMatch[0].length;
      const ref = parseRef(refMatch[0]);
      return ref ? numericValue(cellKey(ref.row, ref.col), lookup, visiting) : 0;
    }

    pos = expr.length;
    return 0;
  };

  const result = parseExpression();
  if (!Number.isFinite(result)) return "#ERR";
  return String(Number(result.toFixed(6)));
}

function numericValue(key: string, lookup: Lookup, visiting: Set<string>): number {
  if (visiting.has(key)) return 0;
  const [row, col] = key.split(":").map(Number);
  const resolved = resolveCell(row, col, lookup, visiting);
  const n = Number(resolved);
  return Number.isFinite(n) ? n : 0;
}

function resolveCell(row: number, col: number, lookup: Lookup, visiting: Set<string>): string {
  const key = cellKey(row, col);
  if (visiting.has(key)) return "#CYCLE";
  const rawValue = lookup(row, col);
  if (!rawValue.startsWith("=")) return rawValue;
  const next = new Set(visiting);
  next.add(key);
  return evaluate(rawValue, lookup, next);
}

export default function SheetEditor({ docId, user }: Props) {
  const provider = useMemo(() => {
    const ydoc = new Y.Doc();
    return new HocuspocusProvider({
      url: "ws://localhost:1234",
      name: docId,
      document: ydoc,
    });
  }, [docId]);

  useEffect(() => () => provider.destroy(), [provider]);

  const cells = useMemo(() => provider.document.getMap<string>("cells"), [provider]);
  const [, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [extraRows, setExtraRows] = useState(0);

  useEffect(() => {
    const observer = () => setVersion((v) => v + 1);
    cells.observe(observer);
    return () => cells.unobserve(observer);
  }, [cells]);

  useEffect(() => {
    // Publish our identity so collaborators show up in the presence bar.
    provider.awareness?.setLocalStateField("user", user);
  }, [provider, user]);

  const lookup: Lookup = (row, col) => cells.get(cellKey(row, col)) ?? "";

  const rows = ROWS + extraRows;

  const setCell = (row: number, col: number, value: string) => {
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
        <button className="btn ghost" onClick={() => setExtraRows((r) => r + 5)}>
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
    </div>
  );
}

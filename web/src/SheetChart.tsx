import { useMemo } from "react";
import { cellKey, colLabel, parseRef, resolveCell, type Lookup } from "./formula";

export interface ChartConfig {
  range: string;
  type: "bar" | "line";
}

/** A sensible default range: the first column holding numbers, its used rows. */
export function suggestRange(lookup: Lookup, cols: number, rows: number): string {
  for (let col = 0; col < cols; col += 1) {
    let lastRow = -1;
    let sawNumber = false;
    for (let row = 0; row < rows; row += 1) {
      const raw = lookup(row, col);
      if (raw === "") continue;
      const value = Number(resolveCell(row, col, lookup, new Set()));
      if (Number.isFinite(value)) sawNumber = true;
      lastRow = row;
    }
    if (sawNumber && lastRow >= 0) {
      return `${colLabel(col)}1:${colLabel(col)}${lastRow + 1}`;
    }
  }
  return "A1:A10";
}

interface Point {
  label: string;
  value: number;
}

/** Turn a range like "A1:B5" into labelled numeric points. */
function readRange(range: string, lookup: Lookup): Point[] {
  const [startText, endText = ""] = range.split(":");
  const start = parseRef(startText ?? "");
  const end = parseRef(endText || startText || "");
  if (!start || !end) return [];

  const top = Math.min(start.row, end.row);
  const bottom = Math.max(start.row, end.row);
  const left = Math.min(start.col, end.col);
  const right = Math.max(start.col, end.col);
  const twoColumns = right > left;

  const points: Point[] = [];
  for (let row = top; row <= bottom; row += 1) {
    const labelCell = twoColumns ? lookup(row, left) : "";
    const valueCell = lookup(row, twoColumns ? right : left);
    const value = Number(resolveCell(row, twoColumns ? right : left, lookup, new Set()));
    if (!Number.isFinite(value)) continue;
    const label = labelCell.trim() || String(row + 1);
    points.push({ label, value });
  }
  return points;
}

interface Props {
  lookup: Lookup;
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  readOnly: boolean;
}

const WIDTH = 560;
const HEIGHT = 220;
const PAD = 32;

export default function SheetChart({ lookup, config, onChange, readOnly }: Props) {
  const points = useMemo(
    () => readRange(config.range, lookup),
    [config.range, lookup]
  );

  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const plotW = WIDTH - PAD * 2;
  const plotH = HEIGHT - PAD * 2;
  const step = points.length ? plotW / points.length : plotW;

  const y = (value: number) => PAD + plotH - (Math.abs(value) / max) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${PAD + step * i + step / 2},${y(p.value)}`)
    .join(" ");

  return (
    <div className="sheet-chart">
      <div className="chart-toolbar">
        <span className="chart-title">Chart</span>
        <input
          className="chart-range"
          value={config.range}
          readOnly={readOnly}
          placeholder="A1:B10"
          onChange={(e) => onChange({ ...config, range: e.target.value })}
          title="Range like A1:B10 (single column, or labels + values)"
        />
        <select
          value={config.type}
          disabled={readOnly}
          onChange={(e) =>
            onChange({ ...config, type: e.target.value === "line" ? "line" : "bar" })
          }
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
        </select>
      </div>

      {points.length === 0 ? (
        <p className="chart-empty">
          Type numbers in a range and enter it above to see a chart.
        </p>
      ) : (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${config.type} chart of ${config.range}`}
          data-chart={config.range}
        >
          <line
            x1={PAD}
            y1={PAD + plotH}
            x2={WIDTH - PAD}
            y2={PAD + plotH}
            className="chart-axis"
          />
          <text x={4} y={PAD + 6} className="chart-tick">
            {max}
          </text>
          <text x={4} y={PAD + plotH} className="chart-tick">
            0
          </text>

          {config.type === "bar" &&
            points.map((point, i) => {
              const barW = Math.max(4, step * 0.6);
              const top = y(point.value);
              const x = PAD + step * i + (step - barW) / 2;
              return (
                <g key={`${point.label}-${i}`}>
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={PAD + plotH - top}
                    className="chart-bar"
                    data-value={point.value}
                  />
                  <text
                    x={x + barW / 2}
                    y={top - 4}
                    textAnchor="middle"
                    className="chart-value"
                  >
                    {point.value}
                  </text>
                </g>
              );
            })}

          {config.type === "line" && (
            <>
              <path d={linePath} className="chart-line" />
              {points.map((point, i) => (
                <circle
                  key={`${point.label}-${i}`}
                  cx={PAD + step * i + step / 2}
                  cy={y(point.value)}
                  r={3}
                  className="chart-dot"
                />
              ))}
            </>
          )}

          {points.map((point, i) => (
            <text
              key={`label-${point.label}-${i}`}
              x={PAD + step * i + step / 2}
              y={HEIGHT - PAD + 16}
              textAnchor="middle"
              className="chart-label"
            >
              {point.label.length > 8 ? `${point.label.slice(0, 7)}…` : point.label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

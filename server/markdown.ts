import * as Y from "yjs";

type Attrs = Record<string, unknown>;

function attrsOf(element: Y.XmlElement): Attrs {
  const attrs: Attrs = {};
  for (const [key, value] of Object.entries(element.getAttributes())) attrs[key] = value;
  return attrs;
}

function truthy(value: unknown): boolean {
  return value === true || value === "true";
}

/** Render a Y.XmlText run, applying bold/italic/strike/code/link marks. */
function textToMarkdown(node: Y.XmlText): string {
  let out = "";
  for (const op of node.toDelta() as Array<{
    insert?: string;
    attributes?: Record<string, unknown>;
  }>) {
    if (typeof op.insert !== "string") continue;
    let text = op.insert;
    const marks = op.attributes ?? {};
    if (marks.code) {
      text = `\`${text}\``;
    } else {
      if (marks.bold) text = `**${text}**`;
      if (marks.italic) text = `*${text}*`;
      if (marks.strike) text = `~~${text}~~`;
    }
    const link = marks.link as { href?: string } | undefined;
    if (link?.href) text = `[${text}](${link.href})`;
    out += text;
  }
  return out;
}

/** Inline content of a block: text children plus nested inline elements. */
function inlineToMarkdown(element: Y.XmlElement): string {
  let out = "";
  for (const child of element.toArray()) {
    if (child instanceof Y.XmlText) out += textToMarkdown(child);
    else if (child instanceof Y.XmlElement) {
      if (child.nodeName === "hardBreak") out += "  \n";
      else out += inlineToMarkdown(child);
    }
  }
  return out;
}

/** Convert a block node to Markdown. Lists are handled by their parent. */
function blockToMarkdown(element: Y.XmlElement, depth: number): string {
  const attrs = attrsOf(element);
  switch (element.nodeName) {
    case "paragraph": {
      const text = inlineToMarkdown(element);
      return text.trim() ? text : "";
    }
    case "heading": {
      const level = Math.min(Math.max(Number(attrs.level) || 1, 1), 6);
      return `${"#".repeat(level)} ${inlineToMarkdown(element)}`;
    }
    case "blockquote": {
      const inner = childrenToMarkdown(element, depth);
      return inner
        ? inner
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n")
        : "";
    }
    case "codeBlock": {
      const language = typeof attrs.language === "string" ? attrs.language : "";
      return `\`\`\`${language}\n${inlineToMarkdown(element)}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "taskList":
    case "bulletList":
    case "orderedList":
      return listToMarkdown(element, depth, element.nodeName === "orderedList");
    default: {
      const inner = childrenToMarkdown(element, depth);
      const text = inlineToMarkdown(element);
      return text || inner;
    }
  }
}

function listToMarkdown(element: Y.XmlElement, depth: number, ordered: boolean): string {
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  let index = 1;
  for (const child of element.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === "listItem" || child.nodeName === "taskItem") {
      const checked = truthy(attrsOf(child).checked);
      const marker = ordered ? `${index}. ` : "- ";
      const bullet =
        child.nodeName === "taskItem" ? `- [${checked ? "x" : " "}] ` : marker;
      const body = childrenToMarkdown(child, depth + 1).trim();
      const [first = "", ...rest] = body.split("\n");
      lines.push(`${pad}${bullet}${first}`);
      for (const line of rest) lines.push(line);
      index += 1;
    } else {
      lines.push(blockToMarkdown(child, depth));
    }
  }
  return lines.join("\n");
}

function childrenToMarkdown(element: Y.XmlElement, depth: number): string {
  const parts: string[] = [];
  for (const child of element.toArray()) {
    if (child instanceof Y.XmlElement) {
      const rendered = blockToMarkdown(child, depth);
      if (rendered.trim()) parts.push(rendered);
    } else if (child instanceof Y.XmlText) {
      const text = textToMarkdown(child);
      if (text.trim()) parts.push(text);
    }
  }
  return parts.join("\n\n");
}

/**
 * Convert a collaborative document (the "default" XML fragment written by
 * TipTap) into Markdown. Unknown nodes fall back to their text content.
 */
export function docToMarkdown(doc: Y.Doc, title?: string): string {
  const fragment = doc.getXmlFragment("default");
  const parts: string[] = [];
  for (const child of fragment.toArray()) {
    if (child instanceof Y.XmlElement) {
      const rendered = blockToMarkdown(child, 0);
      if (rendered.trim()) parts.push(rendered);
    } else if (child instanceof Y.XmlText) {
      const text = textToMarkdown(child);
      if (text.trim()) parts.push(text);
    }
  }
  const body = parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  const heading = title?.trim() ? `# ${title.trim()}\n\n` : "";
  return `${heading}${body}\n`;
}

/** Serialize a sheet's cells map into CSV, expanding simple quoted values. */
export function sheetToCsv(doc: Y.Doc): string {
  const cells = doc.getMap<string>("cells");
  let maxRow = 0;
  let maxCol = 0;
  const grid = new Map<string, string>();
  for (const [key, value] of cells.entries()) {
    const [rowText, colText] = key.split(":");
    const row = Number(rowText);
    const col = Number(colText);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    grid.set(key, value);
  }

  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines: string[] = [];
  for (let row = 0; row <= maxRow; row += 1) {
    const cellsOut: string[] = [];
    for (let col = 0; col <= maxCol; col += 1) {
      cellsOut.push(escape(grid.get(`${row}:${col}`) ?? ""));
    }
    lines.push(cellsOut.join(","));
  }
  return lines.join("\n") + "\n";
}

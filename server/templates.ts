import * as Y from "yjs";

/** A block in a template: element name, attributes, and inline text runs. */
type Marks = Record<string, unknown>;
interface Block {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Marks;
  /** For list blocks: one entry per item. */
  items?: string[];
  /** For task lists: which items start checked. */
  checked?: boolean[];
}

type Document = Block[];

function el(
  name: string,
  attrs: Record<string, unknown>,
  children: Array<Y.XmlElement | Y.XmlText>
): Y.XmlElement {
  const element = new Y.XmlElement(name);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  if (children.length) element.insert(0, children);
  return element;
}

function run(text: string, marks?: Marks): Y.XmlText {
  const node = new Y.XmlText();
  if (marks && Object.keys(marks).length) node.insert(0, text, marks);
  else if (text) node.insert(0, text);
  return node;
}

function blockToNode(block: Block): Y.XmlElement {
  if (block.type === "bulletList" || block.type === "orderedList") {
    const items = (block.items ?? []).map((item) =>
      el("listItem", {}, [el("paragraph", {}, [run(item)])])
    );
    return el(block.type, {}, items);
  }
  if (block.type === "taskList") {
    const items = (block.items ?? []).map((item, index) =>
      el("taskItem", { checked: block.checked?.[index] ? "true" : "false" }, [
        el("paragraph", {}, [run(item)]),
      ])
    );
    return el("taskList", {}, items);
  }
  if (block.type === "blockquote") {
    return el("blockquote", {}, [el("paragraph", {}, [run(block.text ?? "")])]);
  }
  const children: Array<Y.XmlElement | Y.XmlText> = [];
  if (block.text) children.push(run(block.text, block.marks));
  return el(block.type, block.attrs ?? {}, children);
}

/** Encode a template into a Yjs update for a fresh document. */
export function buildTemplateUpdate(templateId: string): Uint8Array {
  const blocks = TEMPLATES.find((t) => t.id === templateId)?.blocks ?? [];
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  fragment.insert(
    0,
    blocks.map(blockToNode) as unknown as Array<Y.XmlElement | Y.XmlText>
  );
  return Y.encodeStateAsUpdate(doc);
}

interface Template {
  id: string;
  name: string;
  description: string;
  blocks: Document;
}

export const TEMPLATES: Template[] = [
  {
    id: "meeting-notes",
    name: "Meeting notes",
    description: "Attendees, agenda and action items",
    blocks: [
      { type: "paragraph", text: "Attendees:", marks: { bold: true } },
      { type: "bulletList", items: ["", "", ""] },
      { type: "heading", attrs: { level: 2 }, text: "Agenda" },
      { type: "orderedList", items: ["", "", ""] },
      { type: "heading", attrs: { level: 2 }, text: "Discussion" },
      { type: "paragraph" },
      { type: "heading", attrs: { level: 2 }, text: "Action items" },
      { type: "taskList", items: [""] },
    ],
  },
  {
    id: "project-plan",
    name: "Project plan",
    description: "Goals, milestones and a task checklist",
    blocks: [
      { type: "heading", attrs: { level: 2 }, text: "Goal" },
      { type: "paragraph" },
      { type: "heading", attrs: { level: 2 }, text: "Scope" },
      { type: "bulletList", items: ["In scope: ", "Out of scope: "] },
      { type: "heading", attrs: { level: 2 }, text: "Milestones" },
      { type: "taskList", items: ["Kickoff", "First draft", "Review", "Ship"] },
      { type: "heading", attrs: { level: 2 }, text: "Risks" },
      { type: "bulletList", items: [""] },
    ],
  },
  {
    id: "weekly-review",
    name: "Weekly review",
    description: "What went well, what to improve, next week",
    blocks: [
      { type: "heading", attrs: { level: 2 }, text: "What went well" },
      { type: "bulletList", items: ["", ""] },
      { type: "heading", attrs: { level: 2 }, text: "What to improve" },
      { type: "bulletList", items: ["", ""] },
      { type: "heading", attrs: { level: 2 }, text: "Focus for next week" },
      { type: "taskList", items: ["", "", ""] },
    ],
  },
  {
    id: "reading-notes",
    name: "Reading notes",
    description: "Source, key ideas and quotes",
    blocks: [
      { type: "paragraph", text: "Source: " },
      { type: "heading", attrs: { level: 2 }, text: "Key ideas" },
      { type: "bulletList", items: ["", ""] },
      { type: "heading", attrs: { level: 2 }, text: "Quotes" },
      { type: "blockquote", text: "" },
      { type: "heading", attrs: { level: 2 }, text: "My take" },
      { type: "paragraph" },
    ],
  },
  {
    id: "decision-log",
    name: "Decision log",
    description: "Context, options and the decision",
    blocks: [
      { type: "paragraph", text: "Date: " },
      { type: "heading", attrs: { level: 2 }, text: "Context" },
      { type: "paragraph" },
      { type: "heading", attrs: { level: 2 }, text: "Options considered" },
      { type: "orderedList", items: ["", ""] },
      { type: "heading", attrs: { level: 2 }, text: "Decision" },
      { type: "paragraph" },
      { type: "heading", attrs: { level: 2 }, text: "Consequences" },
      { type: "bulletList", items: [""] },
    ],
  },
];

export const TEMPLATE_SUMMARIES = TEMPLATES.map(({ id, name, description }) => ({
  id,
  name,
  description,
}));

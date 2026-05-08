/**
 * Remove a single relationship from raw DBML text. Matches both standalone
 * `Ref:` / `Ref { … }` declarations and inline `[ref: > tgt.col]` segments
 * inside column attribute brackets. Direction-agnostic — the same edge
 * written as `A.x > B.y` or `B.y < A.x` is matched either way.
 */
import { TABLE_RE, unquote } from "./dbmlTokens";

interface RefEnd {
  tableId: string;
  column: string;
}

/** Parse `users.id`, `public.users.id`, or `"weird".id` to {tableId, column}. */
function parseEndpoint(raw: string): RefEnd | null {
  const s = raw.trim();
  if (s.includes("(")) return null; // composite columns — not produced by appendRef
  const parts = s.split(".").map((p) => unquote(p.trim())).filter(Boolean);
  if (parts.length === 2) return { tableId: `public.${parts[0]}`, column: parts[1] };
  if (parts.length >= 3) return { tableId: `${parts[0]}.${parts[1]}`, column: parts[2] };
  return null;
}

const REF_OP_RE = /(.+?)\s*(<>|[><\-])\s*(.+)/;

function refBodyMatches(body: string, src: RefEnd, tgt: RefEnd): boolean {
  const m = body.match(REF_OP_RE);
  if (!m) return false;
  const left = parseEndpoint(m[1]);
  const right = parseEndpoint(m[3]);
  if (!left || !right) return false;
  const direct =
    left.tableId === src.tableId && left.column === src.column &&
    right.tableId === tgt.tableId && right.column === tgt.column;
  const reversed =
    left.tableId === tgt.tableId && left.column === tgt.column &&
    right.tableId === src.tableId && right.column === src.column;
  return direct || reversed;
}

function braceBalance(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === "{") n++;
    else if (ch === "}") n--;
  }
  return n;
}

function parseTableLine(trimmed: string): string | null {
  const m = trimmed.match(TABLE_RE);
  if (!m) return null;
  let schema: string;
  let name: string;
  if (m[2] !== undefined) {
    schema = unquote(m[1]);
    name = unquote(m[2]);
  } else {
    schema = "public";
    name = unquote(m[1]);
  }
  return `${schema || "public"}.${name}`;
}

/** Split a column-defs region on top-level commas (ignoring those inside
 *  `[ ... ]` or `( ... )`). */
function splitTopLevelCommas(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(last, i));
      last = i + 1;
    }
  }
  out.push(text.slice(last));
  return out;
}

/** Strip matching `ref:` segments from any bracket in a single column-def chunk. */
function stripRefInChunk(
  chunk: string,
  currentTableId: string,
  src: RefEnd,
  tgt: RefEnd,
): string {
  const m = chunk.trim().match(/^("(?:[^"]*)"|\w+)/);
  if (!m) return chunk;
  const colName = unquote(m[1]);
  return chunk.replace(/\[([^\]]*)\]/g, (_full, body: string) => {
    const parts = body.split(",").map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((part) => {
      const rm = part.match(/^ref\s*:\s*(<>|[><\-])\s*(.+)$/i);
      if (!rm) return true;
      const op = rm[1];
      const ep = parseEndpoint(rm[2]);
      if (!ep) return true;
      const me: RefEnd = { tableId: currentTableId, column: colName };
      // `>` : me → ep ; `<` : ep → me ; `-`/`<>`: try both orientations.
      const implSrc = op === "<" ? ep : me;
      const implTgt = op === "<" ? me : ep;
      const direct =
        implSrc.tableId === src.tableId && implSrc.column === src.column &&
        implTgt.tableId === tgt.tableId && implTgt.column === tgt.column;
      const reversed =
        implSrc.tableId === tgt.tableId && implSrc.column === tgt.column &&
        implTgt.tableId === src.tableId && implTgt.column === src.column;
      return !(direct || reversed);
    });
    if (kept.length === 0) return "";
    return `[${kept.join(", ")}]`;
  });
}

/** Apply `stripRefInChunk` to every column-def in the table-body region of
 *  a line. Handles single-line tables (`Table foo { id int, user_id int [...] }`)
 *  and multi-line bodies uniformly. */
function stripInlineRefsInLine(
  line: string,
  currentTableId: string,
  src: RefEnd,
  tgt: RefEnd,
): string {
  // The "body" portion of the line is whatever's between `{` and `}` if
  // they're on this line — otherwise the whole line (we're mid-block).
  const openIdx = line.indexOf("{");
  const closeIdx = line.lastIndexOf("}");
  let prefix = "";
  let body = line;
  let suffix = "";
  if (openIdx >= 0) {
    prefix = line.slice(0, openIdx + 1);
    body = line.slice(openIdx + 1);
  }
  if (closeIdx >= 0 && closeIdx > openIdx) {
    suffix = body.slice(closeIdx - openIdx - 1);
    body = body.slice(0, closeIdx - openIdx - 1);
  }
  const rebuilt = splitTopLevelCommas(body)
    .map((chunk) => stripRefInChunk(chunk, currentTableId, src, tgt))
    .join(",");
  return prefix + rebuilt + suffix;
}

/** Trim runs of more than two blank lines, plus any trailing double-blank. */
function cleanBlanks(lines: string[]): string[] {
  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blanks++;
      if (blanks <= 2) out.push(line);
    } else {
      blanks = 0;
      out.push(line);
    }
  }
  while (
    out.length > 1 &&
    out[out.length - 1].trim() === "" &&
    out[out.length - 2].trim() === ""
  ) {
    out.pop();
  }
  return out;
}

/**
 * Remove the relationship `<src.column> ↔ <tgt.column>` from `dbml`.
 * Matches standalone `Ref:` lines, `Ref { … }` blocks, and inline
 * `[ref: …]` segments. Returns the cleaned text.
 */
export function removeRef(dbml: string, src: RefEnd, tgt: RefEnd): string {
  const lines = dbml.split("\n");
  const keep = new Array(lines.length).fill(true);
  // Pass 1: figure out which table (if any) each line belongs to.
  // Track `seenOpen` separately from depth so multi-line bodies are
  // correctly bounded — the `}` line returns depth to 0 even though the
  // `{` lived on a different line.
  const lineTable: (string | null)[] = new Array(lines.length).fill(null);
  let curTable: string | null = null;
  let depth = 0;
  let seenOpen = false;
  for (let i = 0; i < lines.length; i++) {
    if (curTable === null) {
      const tblId = parseTableLine(lines[i].trim());
      if (tblId) {
        curTable = tblId;
        depth = 0;
        seenOpen = false;
      }
    }
    if (curTable !== null) {
      lineTable[i] = curTable;
      if (lines[i].includes("{")) seenOpen = true;
      depth += braceBalance(lines[i]);
      if (seenOpen && depth <= 0) {
        curTable = null;
        depth = 0;
        seenOpen = false;
      }
    }
  }

  // Pass 2: walk lines, removing standalone refs and stripping inline ones.
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (lineTable[i] !== null) {
      lines[i] = stripInlineRefsInLine(lines[i], lineTable[i] as string, src, tgt);
      i++;
      continue;
    }

    // Standalone single-line Ref
    if (/^Ref\b/i.test(trimmed) && !trimmed.includes("{")) {
      const colon = trimmed.indexOf(":");
      if (colon >= 0) {
        const body = trimmed.slice(colon + 1).trim();
        if (refBodyMatches(body, src, tgt)) keep[i] = false;
      }
      i++;
      continue;
    }

    // Ref block
    if (/^Ref\b/i.test(trimmed) && trimmed.includes("{")) {
      const blockStart = i;
      let d = braceBalance(lines[i]);
      const bodyIndices: number[] = [];
      i++;
      while (i < lines.length && d > 0) {
        const t = lines[i].trim();
        if (t && t !== "}" && !t.startsWith("//")) bodyIndices.push(i);
        d += braceBalance(lines[i]);
        i++;
      }
      const blockEnd = i;
      for (const li of bodyIndices) {
        if (refBodyMatches(lines[li].trim(), src, tgt)) {
          for (let k = blockStart; k < blockEnd; k++) keep[k] = false;
          break;
        }
      }
      continue;
    }

    i++;
  }

  return cleanBlanks(lines.filter((_, idx) => keep[idx])).join("\n");
}

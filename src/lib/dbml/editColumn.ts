import { TABLE_RE, unquote } from "./dbmlTokens";

function quoteIfNeeded(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

function braceBalance(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === "{") n++;
    else if (ch === "}") n--;
  }
  return n;
}

/**
 * Match a column declaration line. Captures (in order):
 *   1. leading whitespace
 *   2. column name (bare or quoted)
 *   3. whitespace between name and type
 *   4. type token, including any `(args)` it carries
 *
 * The line must start at col 0 with either an identifier or a quoted name —
 * skipping comments, blank lines, the table's `{` / `}`, `Note:` lines, and
 * `indexes { … }` openers.
 */
const COLUMN_LINE_RE =
  /^(\s*)("(?:[^"]*)"|[A-Za-z_][A-Za-z0-9_]*)(\s+)([A-Za-z_][A-Za-z0-9_]*(?:\s*\([^)]*\))?)/;

function isSkippableTableBodyLine(trimmed: string): boolean {
  if (trimmed === "" || trimmed === "{" || trimmed === "}") return true;
  if (trimmed.startsWith("//")) return true;
  if (/^note\s*[:{]/i.test(trimmed)) return true;
  if (/^indexes\s*\{/i.test(trimmed)) return true;
  return false;
}

/**
 * Inside a single Table block, rewrite the column declaration line whose
 * column name matches `oldColName`. Lines belonging to a nested `indexes
 * { … }` block are skipped so an index-line column reference isn't
 * mistaken for the column declaration.
 */
function editColumnInTableBlock(
  lines: string[],
  bodyStart: number,
  bodyEndExclusive: number,
  oldColName: string,
  edit: { name?: string; type?: string },
): boolean {
  let inIndexes = false;
  let depth = 0;

  for (let i = bodyStart; i < bodyEndExclusive; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (inIndexes) {
      depth += braceBalance(line);
      if (depth <= 0) inIndexes = false;
      continue;
    }
    if (/^indexes\s*\{/i.test(trimmed)) {
      inIndexes = true;
      depth = braceBalance(line);
      if (depth <= 0) inIndexes = false;
      continue;
    }
    if (isSkippableTableBodyLine(trimmed)) continue;

    const m = line.match(COLUMN_LINE_RE);
    if (!m) continue;
    const leading = m[1];
    const rawName = m[2];
    const sp = m[3];
    const typeText = m[4];
    if (unquote(rawName) !== oldColName) continue;

    const newName = edit.name !== undefined ? quoteIfNeeded(edit.name) : rawName;
    const newType = edit.type !== undefined ? edit.type : typeText;
    const head = `${leading}${newName}${sp}${newType}`;
    const tailStart = leading.length + rawName.length + sp.length + typeText.length;
    lines[i] = head + line.slice(tailStart);
    return true;
  }
  return false;
}

/**
 * Rewrite column references inside a single ref-context line. Handles:
 *   - `users.id`              → `users.<new>` when col matches
 *   - `users.(id, email)`     → spreads inside the parens
 *   - `public.users.id`       → schema-qualified form
 */
function rewriteRefLineForColumn(
  line: string,
  schema: string,
  table: string,
  oldCol: string,
  newCol: string,
): string {
  const ID = `(?:"(?:[^"]*)"|\\w+)`;
  const newToken = quoteIfNeeded(newCol);

  // Form A: `[<schema>.]<table>.(<cols>)` — rewrite individual cols inside.
  const PAREN_RE = new RegExp(
    `(${ID})(?:\\.(${ID}))?\\.\\(([^)]*)\\)`,
    "g",
  );
  let out = line.replace(PAREN_RE, (full, p1: string, p2: string | undefined, body: string) => {
    let s: string;
    let t: string;
    if (p2 !== undefined) {
      s = unquote(p1);
      t = unquote(p2);
    } else {
      s = "public";
      t = unquote(p1);
    }
    if (s !== schema || t !== table) return full;
    const newBody = body
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        const stripped = unquote(trimmed);
        return stripped === oldCol ? newToken : trimmed;
      })
      .join(", ");
    return `${p2 !== undefined ? `${p1}.${p2}` : p1}.(${newBody})`;
  });

  // Form B: `[<schema>.]<table>.<col>` — rewrite the column at the end.
  const SINGLE_RE = new RegExp(
    `(${ID})(?:\\.(${ID}))?\\.(${ID})(?!\\s*\\()`,
    "g",
  );
  out = out.replace(SINGLE_RE, (full, p1: string, p2: string | undefined, colTok: string) => {
    let s: string;
    let t: string;
    if (p2 !== undefined) {
      s = unquote(p1);
      t = unquote(p2);
    } else {
      s = "public";
      t = unquote(p1);
    }
    if (s !== schema || t !== table) return full;
    if (unquote(colTok) !== oldCol) return full;
    const head = p2 !== undefined ? `${p1}.${p2}` : p1;
    return `${head}.${newToken}`;
  });

  return out;
}

function rewriteInlineRefsForColumn(
  line: string,
  schema: string,
  table: string,
  oldCol: string,
  newCol: string,
): string {
  return line.replace(
    /(ref\s*:\s*)(<>|[<>\-])(\s*)([^,\]]+?)(\s*)(?=,|\])/gi,
    (_full, head: string, op: string, ws1: string, endpoint: string, ws2: string) => {
      const rewritten = rewriteRefLineForColumn(endpoint, schema, table, oldCol, newCol);
      return `${head}${op}${ws1}${rewritten}${ws2}`;
    },
  );
}

/**
 * Edit a column inside `tableId` (formatted as `schema.name`). When `name`
 * changes, every endpoint reference to the old column is rewritten too.
 * Returns the new DBML, or the original string if the column wasn't found.
 */
export function editColumn(
  dbml: string,
  tableId: string,
  oldColName: string,
  edit: { name?: string; type?: string },
): string {
  const dot = tableId.indexOf(".");
  const schema = dot >= 0 ? tableId.slice(0, dot) : "public";
  const tname = dot >= 0 ? tableId.slice(dot + 1) : tableId;
  const renamed = edit.name !== undefined && edit.name !== oldColName;
  if (!edit.name && edit.type === undefined) return dbml;

  const lines = dbml.split("\n");

  // Locate the target table block.
  let blockBodyStart = -1;
  let blockBodyEnd = -1;
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(TABLE_RE);
    if (m) {
      let s: string;
      let n: string;
      if (m[2] !== undefined) {
        s = unquote(m[1]);
        n = unquote(m[2]);
      } else {
        s = "public";
        n = unquote(m[1]);
      }
      if (s === schema && n === tname) {
        let openIdx = trimmed.includes("{") ? i : -1;
        if (openIdx === -1) {
          let j = i + 1;
          while (j < lines.length && !lines[j].includes("{")) j++;
          if (j >= lines.length) return dbml;
          openIdx = j;
        }
        let depth = braceBalance(lines[openIdx]);
        let k = openIdx + 1;
        while (k < lines.length && depth > 0) {
          depth += braceBalance(lines[k]);
          k++;
        }
        blockBodyStart = openIdx + 1;
        blockBodyEnd = k - 1;
        break;
      }
    }
    i++;
  }
  if (blockBodyStart === -1) return dbml;

  const found = editColumnInTableBlock(
    lines,
    blockBodyStart,
    blockBodyEnd,
    oldColName,
    edit,
  );
  if (!found) return dbml;

  if (renamed) {
    const newCol = edit.name as string;
    let inRef = false;
    let depth = 0;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const trimmed = line.trim();
      if (inRef) {
        depth += braceBalance(line);
        lines[li] = rewriteRefLineForColumn(line, schema, tname, oldColName, newCol);
        if (depth <= 0) {
          inRef = false;
          depth = 0;
        }
        continue;
      }
      // Inline `[..., ref: > tableId.col, ...]` bracket attrs can live on
      // any column line in any table body. Cheap: regex requires `ref:`.
      lines[li] = rewriteInlineRefsForColumn(lines[li], schema, tname, oldColName, newCol);
      if (/^Ref\b/i.test(trimmed) && !trimmed.includes("{")) {
        lines[li] = rewriteRefLineForColumn(lines[li], schema, tname, oldColName, newCol);
        continue;
      }
      if (/^Ref\b/i.test(trimmed) && trimmed.includes("{")) {
        inRef = true;
        depth = braceBalance(line);
        lines[li] = rewriteRefLineForColumn(lines[li], schema, tname, oldColName, newCol);
        if (depth <= 0) {
          inRef = false;
          depth = 0;
        }
      }
    }
  }

  return lines.join("\n");
}

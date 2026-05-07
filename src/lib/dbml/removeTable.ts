/**
 * Remove tables (and their associated standalone Ref declarations) from raw
 * DBML text.  This is pure text surgery — no AST round-trip — so the result
 * preserves comments, formatting, and anything the parser doesn't model.
 *
 * Inline `[ref: > ...]` annotations inside surviving tables are left alone —
 * dangling refs are harmless and the parser ignores them.
 */

/** Build a table ID the same way parse.ts does. */
function makeTableId(schema: string, name: string): string {
  return `${schema || "public"}.${name}`;
}

/** Strip surrounding double-quotes if present. */
function unquote(s: string): string {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"')
    return s.slice(1, -1);
  return s;
}

/**
 * Regex for a Table declaration line.
 * Captures the first identifier (schema or name) in group 1 and an optional
 * dot-separated second identifier (name if schema was given) in group 2.
 * Handles both quoted (`"my_schema"."my_table"`) and unquoted names.
 */
const TABLE_RE =
  /^Table\s+("(?:[^"]*)"|\w+)(?:\.("(?:[^"]*)"|\w+))?/i;

/**
 * Parse a "Table …" line and return the table ID (`schema.name`) and whether
 * the opening brace is on this line.  Returns null if the line isn't a Table
 * declaration.
 */
function parseTableLine(
  trimmed: string,
): { id: string; hasOpenBrace: boolean } | null {
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
  return { id: makeTableId(schema, name), hasOpenBrace: trimmed.includes("{") };
}

/**
 * Given a ref endpoint like `public.users.id` or `users.(id, name)`, return
 * the table ID (`schema.name`).
 */
function endpointTableId(endpoint: string): string | null {
  const s = endpoint.trim();
  const paren = s.indexOf("(");
  const before = paren >= 0 ? s.slice(0, paren) : s;
  const parts = before
    .split(".")
    .map((p) => unquote(p.trim()))
    .filter(Boolean);

  if (paren >= 0) {
    // Composite key: schema.table.( or table.(
    if (parts.length >= 2) return makeTableId(parts[0], parts[1]);
    if (parts.length === 1) return makeTableId("public", parts[0]);
  } else {
    // Simple: schema.table.column or table.column
    if (parts.length >= 3) return makeTableId(parts[0], parts[1]);
    if (parts.length === 2) return makeTableId("public", parts[0]);
  }
  return null;
}

/** Matches `endpoint <op> endpoint` where op is `>`, `<`, `-`, or `<>`. */
const REF_OP_RE = /(.+?)\s*(<>|[><\-])\s*(.+)/;

/** Does a ref body (`endpoint op endpoint`) touch any of the deleted tables? */
function refBodyTouchesDeleted(body: string, ids: Set<string>): boolean {
  const m = body.match(REF_OP_RE);
  if (!m) return false;
  const left = endpointTableId(m[1]);
  const right = endpointTableId(m[3]);
  return (left !== null && ids.has(left)) || (right !== null && ids.has(right));
}

/** Net brace balance of a line (positive = more opens than closes). */
function braceBalance(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === "{") n++;
    else if (ch === "}") n--;
  }
  return n;
}

/**
 * Remove every table whose ID is in `tableIds` from raw DBML text, along with
 * any standalone `Ref:` lines or `Ref { }` blocks that reference them.
 *
 * Returns the cleaned text (same string if nothing matched).
 */
export function removeTables(dbml: string, tableIds: Set<string>): string {
  if (tableIds.size === 0) return dbml;

  const lines = dbml.split("\n");
  const keep: boolean[] = new Array(lines.length).fill(true);
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // ── Table block ───────────────────────────────────────────────
    const tbl = parseTableLine(trimmed);
    if (tbl && tableIds.has(tbl.id)) {
      keep[i] = false;
      if (tbl.hasOpenBrace) {
        let depth = braceBalance(trimmed);
        i++;
        while (i < lines.length && depth > 0) {
          keep[i] = false;
          depth += braceBalance(lines[i]);
          i++;
        }
      } else {
        // Opening brace is on a later line — skip until we find & close it.
        i++;
        while (i < lines.length) {
          keep[i] = false;
          if (lines[i].includes("{")) {
            let depth = braceBalance(lines[i]);
            i++;
            while (i < lines.length && depth > 0) {
              keep[i] = false;
              depth += braceBalance(lines[i]);
              i++;
            }
            break;
          }
          i++;
        }
      }
      continue;
    }

    // ── Standalone single-line Ref ────────────────────────────────
    if (/^Ref\b/i.test(trimmed) && !trimmed.includes("{")) {
      const colon = trimmed.indexOf(":");
      if (colon >= 0) {
        const body = trimmed.slice(colon + 1).trim();
        if (refBodyTouchesDeleted(body, tableIds)) {
          keep[i] = false;
        }
      }
      i++;
      continue;
    }

    // ── Ref block ─────────────────────────────────────────────────
    if (/^Ref\b/i.test(trimmed) && trimmed.includes("{")) {
      const blockStart = i;
      let depth = braceBalance(trimmed);
      const bodyIndices: number[] = [];
      i++;
      while (i < lines.length && depth > 0) {
        const t = lines[i].trim();
        if (t && t !== "}" && !t.startsWith("//")) {
          bodyIndices.push(i);
        }
        depth += braceBalance(lines[i]);
        i++;
      }
      const blockEnd = i; // exclusive

      // If any body line references a deleted table, remove the whole block.
      let touchesDeleted = false;
      for (const li of bodyIndices) {
        if (refBodyTouchesDeleted(lines[li].trim(), tableIds)) {
          touchesDeleted = true;
          break;
        }
      }
      if (touchesDeleted) {
        for (let k = blockStart; k < blockEnd; k++) keep[k] = false;
      }
      continue;
    }

    i++;
  }

  // ── Rebuild & clean up consecutive blank lines ────────────────
  const result = lines.filter((_, idx) => keep[idx]);

  const cleaned: string[] = [];
  let blanks = 0;
  for (const line of result) {
    if (line.trim() === "") {
      blanks++;
      if (blanks <= 2) cleaned.push(line);
    } else {
      blanks = 0;
      cleaned.push(line);
    }
  }

  // Trim trailing blank lines to at most one.
  while (
    cleaned.length > 1 &&
    cleaned[cleaned.length - 1].trim() === "" &&
    cleaned[cleaned.length - 2].trim() === ""
  ) {
    cleaned.pop();
  }

  return cleaned.join("\n");
}

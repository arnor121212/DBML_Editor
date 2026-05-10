/**
 * Remove tables (and their associated Ref declarations) from raw DBML text.
 * This is pure text surgery — no AST round-trip — so the result preserves
 * comments, formatting, and anything the parser doesn't model.
 *
 * Inline `[ref: > ...]` annotations inside *surviving* tables that point at
 * a *deleted* table are stripped from their bracket attribute lists; the
 * column itself stays. Bare `[]` after the strip is removed as well.
 */

import {
  TABLE_GROUP_RE,
  TABLE_RE,
  endpointTableId,
  findTableRefsOnLine,
  stripInlineRefsToAny,
  unquote,
} from "./dbmlTokens";

/** Build a table ID the same way parse.ts does. */
function makeTableId(schema: string, name: string): string {
  return `${schema || "public"}.${name}`;
}

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

    // ── TableGroup block ─────────────────────────────────────────
    // Per the @dbml/core grammar, the body is just whitespace-separated
    // (optionally schema-qualified) table refs. No Notes, no settings.
    if (TABLE_GROUP_RE.test(trimmed)) {
      // One-liner: `TableGroup foo { a b c }` on a single line.
      const oneLineOpen = lines[i].indexOf("{");
      const oneLineClose = lines[i].indexOf("}", oneLineOpen + 1);
      if (oneLineOpen >= 0 && oneLineClose > oneLineOpen) {
        const inner = lines[i].slice(oneLineOpen + 1, oneLineClose);
        const refs = findTableRefsOnLine(inner);
        const kept = refs.filter((r) => !tableIds.has(r.id));
        if (refs.length > 0 && kept.length === 0) {
          keep[i] = false;
        } else {
          const deleted = refs.filter((r) => tableIds.has(r.id));
          if (deleted.length > 0) {
            let newInner = inner;
            for (const d of [...deleted].sort((a, b) => b.start - a.start)) {
              newInner = newInner.slice(0, d.start) + newInner.slice(d.end);
            }
            lines[i] =
              lines[i].slice(0, oneLineOpen + 1) +
              newInner +
              lines[i].slice(oneLineClose);
          }
        }
        i++;
        continue;
      }

      // Multi-line: locate `{`, walk body until matching `}`.
      const blockStart = i;
      let openIdx = trimmed.includes("{") ? i : -1;
      if (openIdx === -1) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes("{")) j++;
        if (j >= lines.length) {
          i++;
          continue;
        }
        openIdx = j;
      }
      let depth = braceBalance(lines[openIdx]);
      const bodyLines: number[] = [];
      let k = openIdx + 1;
      while (k < lines.length && depth > 0) {
        bodyLines.push(k);
        depth += braceBalance(lines[k]);
        k++;
      }
      const blockEnd = k; // exclusive

      let totalRefs = 0;
      let keptRefs = 0;
      for (const li of bodyLines) {
        const refs = findTableRefsOnLine(lines[li]);
        if (refs.length === 0) continue;
        totalRefs += refs.length;
        const deleted = refs.filter((r) => tableIds.has(r.id));
        const kept = refs.filter((r) => !tableIds.has(r.id));
        keptRefs += kept.length;
        if (deleted.length === 0) continue;
        if (kept.length === 0) {
          keep[li] = false;
        } else {
          let newContent = lines[li];
          for (const d of [...deleted].sort((a, b) => b.start - a.start)) {
            newContent =
              newContent.slice(0, d.start) + newContent.slice(d.end);
          }
          lines[li] = newContent;
        }
      }

      // If the group had members and all of them are gone, drop the block.
      if (totalRefs > 0 && keptRefs === 0) {
        for (let z = blockStart; z < blockEnd; z++) keep[z] = false;
      }

      i = blockEnd;
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
  // Strip inline `[ref: > deletedTable.col]` segments from any surviving
  // line; safe on non-bracket lines (the regex doesn't match) and on
  // brackets without a `ref:` segment (the filter is a no-op).
  const stripped = lines.map((line, idx) =>
    keep[idx] ? stripInlineRefsToAny(line, tableIds) : line,
  );
  const result = stripped.filter((_, idx) => keep[idx]);

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

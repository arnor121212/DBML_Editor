/**
 * Duplicate one or more `Table` blocks in raw DBML text. Used by Ctrl+V on
 * the diagram canvas after a Ctrl+C copy of selected tables.
 *
 * The copied block is byte-identical to the source except for the table
 * name token in the declaration. Inline `[ref: > otherTable.col]` annotations
 * are preserved when they point at *other* tables, but stripped when they
 * point at the *original* (otherwise the duplicate would silently FK back
 * into the source).
 */

import { TABLE_RE, stripInlineRefsToAny, unquote } from "./dbmlTokens";

interface CopySpec {
  sourceId: string;   // schema.name of the original
  newName: string;    // bare new table name (no schema)
}

function braceBalance(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === "{") n++;
    else if (ch === "}") n--;
  }
  return n;
}

function parseTableDecl(line: string): { id: string; rest: string } | null {
  const m = line.trimStart().match(TABLE_RE);
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
  return { id: `${schema || "public"}.${name}`, rest: line };
}

/**
 * Find the contiguous line range `[start, end)` of the `Table <id> { … }`
 * block in `lines`. Returns null if not found.
 */
function findTableBlock(
  lines: string[],
  tableId: string,
): { start: number; end: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const decl = parseTableDecl(lines[i]);
    if (!decl || decl.id !== tableId) continue;
    let depth = braceBalance(lines[i]);
    if (depth === 0 && !lines[i].includes("{")) {
      // Opening brace on a later line.
      let j = i + 1;
      while (j < lines.length && !lines[j].includes("{")) j++;
      if (j >= lines.length) return null;
      depth = braceBalance(lines[j]);
      let k = j + 1;
      while (k < lines.length && depth > 0) {
        depth += braceBalance(lines[k]);
        k++;
      }
      return { start: i, end: k };
    }
    let j = i + 1;
    while (j < lines.length && depth > 0) {
      depth += braceBalance(lines[j]);
      j++;
    }
    return { start: i, end: j };
  }
  return null;
}

/**
 * Replace the table-name token on the declaration line with `newName`,
 * preserving the rest of the line (and the optional `schema.` prefix).
 */
function rewriteDeclName(line: string, newName: string): string {
  const head = line.length - line.trimStart().length;
  const lead = line.slice(0, head);
  const trimmed = line.slice(head);
  return (
    lead +
    trimmed.replace(
      /^(Table\s+)("(?:[^"]*)"|\w+)((?:\.("(?:[^"]*)"|\w+))?)/i,
      (_full, kw: string, id1: string, dotPart: string) => {
        if (dotPart) {
          // Schema-qualified — keep the schema, replace the table token.
          return `${kw}${id1}.${newName}`;
        }
        return `${kw}${newName}`;
      },
    )
  );
}

/**
 * Build copies of one or more `Table` blocks and append them to `dbml`.
 * Returns the new DBML and the list of new table ids.
 */
export function duplicateTableBlocks(
  dbml: string,
  specs: CopySpec[],
): { text: string; newTableIds: string[] } {
  if (specs.length === 0) return { text: dbml, newTableIds: [] };

  const lines = dbml.split("\n");
  const blocks: { source: string[]; spec: CopySpec }[] = [];
  for (const spec of specs) {
    const range = findTableBlock(lines, spec.sourceId);
    if (!range) continue;
    blocks.push({ source: lines.slice(range.start, range.end), spec });
  }
  if (blocks.length === 0) return { text: dbml, newTableIds: [] };

  const stripped = dbml.replace(/\s+$/u, "");
  const newTableIds: string[] = [];
  let appended = stripped;
  for (const { source, spec } of blocks) {
    const dot = spec.sourceId.indexOf(".");
    const oldSchema = dot >= 0 ? spec.sourceId.slice(0, dot) : "public";
    const newId = `${oldSchema}.${spec.newName}`;
    newTableIds.push(newId);
    const selfRefSet = new Set([spec.sourceId]);
    const rebuilt = source.map((line, i) => {
      let next = line;
      if (i === 0) next = rewriteDeclName(next, spec.newName);
      // Strip self-targeting inline refs so the duplicate doesn't FK back
      // into the source by accident.
      next = stripInlineRefsToAny(next, selfRefSet);
      return next;
    });
    appended += "\n\n" + rebuilt.join("\n");
  }
  return { text: appended + "\n", newTableIds };
}

/**
 * Generate a fresh table name from `base` that doesn't collide with any
 * id in `existing`. Tries `base_copy`, `base_copy_2`, …
 */
export function nextAvailableName(
  base: string,
  schema: string,
  existing: Set<string>,
): string {
  const prefix = `${schema || "public"}.`;
  let candidate = `${base}_copy`;
  if (!existing.has(prefix + candidate)) return candidate;
  for (let i = 2; i < 1000; i++) {
    candidate = `${base}_copy_${i}`;
    if (!existing.has(prefix + candidate)) return candidate;
  }
  return `${base}_copy_${Date.now()}`;
}

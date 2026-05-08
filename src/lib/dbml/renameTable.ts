/**
 * Rename a table in raw DBML text — pure text surgery, no AST round-trip,
 * so comments and formatting are preserved.
 *
 * Renames:
 *  1. The `Table <oldname>` declaration (handles schema-qualified and
 *     quoted forms).
 *  2. Endpoint references inside `Ref:` / `Ref { … }` lines.
 *  3. Inline `[ref: > tableName.col]` annotations within other tables'
 *     column definitions.
 *
 * The matching is schema-aware: a table id is `schema.name` (default
 * `public`), so renaming `public.users` won't disturb a separate
 * `audit.users` table.
 */

import { unquote } from "./dbmlTokens";

/**
 * Variant of `TABLE_RE` that captures the leading `Table ` keyword (and
 * trailing whitespace) in group 1 so the rewrite can preserve the user's
 * exact spacing when substituting the new name.
 */
const TABLE_DECL_RE =
  /^(Table\s+)("(?:[^"]*)"|\w+)(?:\.("(?:[^"]*)"|\w+))?/i;

function quoteIfNeeded(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

/** Net brace balance of a line. */
function braceBalance(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === "{") n++;
    else if (ch === "}") n--;
  }
  return n;
}

/**
 * Replace any reference to the old table id with the new name within a
 * single ref-context line. The line might contain endpoints like:
 *   - `users.id`
 *   - `public.users.id`
 *   - `users.(id, email)`
 *   - `"users".id`
 *
 * Strategy: find any identifier (optionally preceded by `<schema>.`) that
 * is *followed by* `.` or `(` — that's the syntactic shape of a table-name
 * inside an endpoint. A bare `column` (followed by space, comma, `>`, etc.)
 * doesn't match, so we never confuse columns with tables.
 */
function rewriteRefLine(
  line: string,
  oldSchema: string,
  oldName: string,
  newName: string,
): string {
  const newQuoted = quoteIfNeeded(newName);
  const ID = `(?:"(?:[^"]*)"|\\w+)`;
  const ENDPOINT_RE = new RegExp(
    `(${ID})(?:\\.(${ID}))?(?=\\.|\\s*\\()`,
    "g",
  );
  return line.replace(ENDPOINT_RE, (full, p1: string, p2?: string) => {
    let schema: string;
    let name: string;
    if (p2 !== undefined) {
      schema = unquote(p1);
      name = unquote(p2);
    } else {
      schema = "public";
      name = unquote(p1);
    }
    if (schema === oldSchema && name === oldName) {
      return p2 !== undefined ? `${p1}.${newQuoted}` : newQuoted;
    }
    return full;
  });
}

/**
 * Rewrite `ref: <op> <endpoint>` segments inside column-attribute brackets.
 * In DBML, `ref:` is one of several comma-separated attributes inside
 * `[ ... ]` (e.g. `[not null, ref: > users.id, default: 0]`), so we match
 * the `ref:` segment wherever it appears — not just at the bracket open.
 * Only the endpoint side is rewritten.
 */
function rewriteInlineRefs(
  line: string,
  oldSchema: string,
  oldName: string,
  newName: string,
): string {
  return line.replace(
    /(ref\s*:\s*)(<>|[<>\-])(\s*)([^,\]]+?)(\s*)(?=,|\])/gi,
    (_full, head: string, op: string, ws1: string, endpoint: string, ws2: string) => {
      const rewritten = rewriteRefLine(endpoint, oldSchema, oldName, newName);
      return `${head}${op}${ws1}${rewritten}${ws2}`;
    },
  );
}

/**
 * Rename `oldId` (formatted as `schema.name`, default schema `public`) to
 * `newName` everywhere it appears as a table reference. Returns the
 * rewritten DBML, or the original string if nothing matched.
 */
export function renameTable(
  dbml: string,
  oldId: string,
  newName: string,
): string {
  const dot = oldId.indexOf(".");
  const oldSchema = dot >= 0 ? oldId.slice(0, dot) : "public";
  const oldName = dot >= 0 ? oldId.slice(dot + 1) : oldId;
  if (!oldName || !newName || oldName === newName) return dbml;

  const newToken = quoteIfNeeded(newName);
  const lines = dbml.split("\n");

  // Track which lines are inside a Table block vs a Ref block.
  let inTable = false;
  let inRef = false;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Block exit ────────────────────────────────────────────────
    if ((inTable || inRef) && depth > 0) {
      depth += braceBalance(line);
      // Inline refs may live inside table body.
      if (inTable) {
        lines[i] = rewriteInlineRefs(line, oldSchema, oldName, newName);
      } else if (inRef) {
        lines[i] = rewriteRefLine(line, oldSchema, oldName, newName);
      }
      if (depth <= 0) {
        inTable = false;
        inRef = false;
        depth = 0;
      }
      continue;
    }

    // ── Table declaration line ────────────────────────────────────
    const tblMatch = trimmed.match(TABLE_DECL_RE);
    if (tblMatch) {
      let schema: string;
      let name: string;
      let prefix: string;
      if (tblMatch[3] !== undefined) {
        schema = unquote(tblMatch[2]);
        name = unquote(tblMatch[3]);
        prefix = `${tblMatch[1]}${tblMatch[2]}.`;
      } else {
        schema = "public";
        name = unquote(tblMatch[2]);
        prefix = tblMatch[1];
      }
      if (schema === oldSchema && name === oldName) {
        const headLen = line.length - line.trimStart().length;
        const replacedTrimmed = trimmed.replace(
          TABLE_DECL_RE,
          `${prefix}${newToken}`,
        );
        lines[i] = line.slice(0, headLen) + replacedTrimmed;
      }
      // Enter the table block. Brace is on this line in well-formed DBML;
      // if not, the next iteration will encounter it as a normal line.
      const bal = braceBalance(line);
      if (bal > 0) {
        inTable = true;
        depth = bal;
      }
      continue;
    }

    // ── Single-line Ref ────────────────────────────────────────────
    if (/^Ref\b/i.test(trimmed) && !trimmed.includes("{")) {
      lines[i] = rewriteRefLine(line, oldSchema, oldName, newName);
      continue;
    }

    // ── Ref block start ────────────────────────────────────────────
    if (/^Ref\b/i.test(trimmed) && trimmed.includes("{")) {
      inRef = true;
      depth = braceBalance(line);
      lines[i] = rewriteRefLine(line, oldSchema, oldName, newName);
      if (depth <= 0) {
        inRef = false;
        depth = 0;
      }
      continue;
    }
  }

  return lines.join("\n");
}

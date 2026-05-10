/**
 * Tiny shared lexical helpers for the text-surgery utilities in this folder.
 * Kept minimal — full tokenization lives in `@dbml/core`; we only need just
 * enough to recognize `Table <name>` declarations and unquote identifiers.
 */

/**
 * Matches a `Table` declaration line. Capture group 1 is the first
 * identifier (schema or name when there's no dot); group 2 is the
 * second identifier (name when group 1 was the schema).
 */
export const TABLE_RE =
  /^Table\s+("(?:[^"]*)"|\w+)(?:\.("(?:[^"]*)"|\w+))?/i;

/** Matches the start of a `TableGroup` declaration line. */
export const TABLE_GROUP_RE = /^TableGroup\b/i;

/**
 * Find every table reference on a line (ignoring any trailing `// comment`).
 * Returns each match's resolved `schema.name` id plus the byte range to
 * splice if removing it. Used by TableGroup body cleanup, where members are
 * bare or `schema.name` identifiers separated by whitespace.
 */
export function findTableRefsOnLine(
  line: string,
): { id: string; start: number; end: number }[] {
  const commentIdx = line.indexOf("//");
  const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const re = /("[^"]+"|\w+)(?:\.("[^"]+"|\w+))?/g;
  const out: { id: string; start: number; end: number }[] = [];
  for (const m of code.matchAll(re)) {
    const start = m.index!;
    const end = start + m[0].length;
    let schema: string;
    let name: string;
    if (m[2] !== undefined) {
      schema = unquote(m[1]);
      name = unquote(m[2]);
    } else {
      schema = "public";
      name = unquote(m[1]);
    }
    out.push({ id: `${schema}.${name}`, start, end });
  }
  return out;
}

export function unquote(s: string): string {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"')
    return s.slice(1, -1);
  return s;
}

/**
 * Resolve a ref endpoint (`schema.table.col`, `table.col`, `table.(col1, col2)`,
 * `"weird name".id`) to its `schema.name` table id. Returns null when the
 * shape is not recognized.
 */
export function endpointTableId(endpoint: string): string | null {
  const s = endpoint.trim();
  const paren = s.indexOf("(");
  const before = paren >= 0 ? s.slice(0, paren) : s;
  const parts = before
    .split(".")
    .map((p) => unquote(p.trim()))
    .filter(Boolean);
  if (paren >= 0) {
    if (parts.length >= 2) return `${parts[0] || "public"}.${parts[1]}`;
    if (parts.length === 1) return `public.${parts[0]}`;
  } else {
    if (parts.length >= 3) return `${parts[0] || "public"}.${parts[1]}`;
    if (parts.length === 2) return `public.${parts[0]}`;
  }
  return null;
}

/**
 * Strip every inline `[ ..., ref: <op> <endpoint>, ... ]` segment whose
 * endpoint resolves to one of `targetTableIds`. Empty brackets after the
 * strip are removed entirely. Other lines pass through untouched.
 */
export function stripInlineRefsToAny(
  line: string,
  targetTableIds: Set<string>,
): string {
  return line.replace(/\[([^\]]*)\]/g, (_full, body: string) => {
    const parts = body.split(",").map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((part) => {
      const m = part.match(/^ref\s*:\s*(?:<>|[<>\-])\s*(.+)$/i);
      if (!m) return true;
      const tgt = endpointTableId(m[1]);
      return tgt === null || !targetTableIds.has(tgt);
    });
    if (kept.length === 0) return "";
    return `[${kept.join(", ")}]`;
  });
}

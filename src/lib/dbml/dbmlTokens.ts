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

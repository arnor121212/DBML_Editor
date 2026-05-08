/**
 * Append a `Ref:` line to raw DBML text. Used when the user drags a
 * connection between two columns on the diagram canvas.
 *
 * The cardinality is always `>` (FK → PK / many-to-one); users can edit
 * the line afterwards if they want a different shape.
 */

interface RefEnd {
  /** Table id in `schema.name` form, default schema `public`. */
  tableId: string;
  column: string;
}

/** Format an endpoint, omitting the `public.` prefix to match idiomatic DBML. */
function formatEndpoint(end: RefEnd): string {
  const dot = end.tableId.indexOf(".");
  const schema = dot >= 0 ? end.tableId.slice(0, dot) : "public";
  const name = dot >= 0 ? end.tableId.slice(dot + 1) : end.tableId;
  const tablePart = schema && schema !== "public" ? `${schema}.${name}` : name;
  return `${tablePart}.${end.column}`;
}

/**
 * Normalize a `Ref:` line so spacing variants (`>`, ` > `, `\t>\t`) compare
 * equal. Used for dedup only — we don't rewrite existing lines.
 */
function normalizeRefLine(l: string): string {
  return l.trim().replace(/\s*(<>|[><\-])\s*/g, " $1 ");
}

/**
 * Append `Ref: <src> > <tgt>` to `dbml`. Returns the new DBML and the
 * 1-based line number of the matching ref. If a semantically equivalent
 * ref already exists (whitespace-insensitive, or written with the
 * cardinality reversed as `tgt < src`), the original DBML is returned
 * with the line number of the existing line.
 */
export function appendRef(
  dbml: string,
  source: RefEnd,
  target: RefEnd,
): { text: string; line: number } {
  const src = formatEndpoint(source);
  const tgt = formatEndpoint(target);
  const newLine = `Ref: ${src} > ${tgt}`;
  const reversed = `Ref: ${tgt} < ${src}`;

  const lines = dbml.split("\n");
  const existingIdx = lines.findIndex((l) => {
    const n = normalizeRefLine(l);
    return n === newLine || n === reversed;
  });
  if (existingIdx !== -1) return { text: dbml, line: existingIdx + 1 };

  // Trim trailing whitespace so we control the spacing precisely.
  const stripped = dbml.replace(/\s+$/u, "");
  const sep = stripped.length === 0 ? "" : "\n\n";
  const text = `${stripped}${sep}${newLine}\n`;
  const line = text.split("\n").length - 1;
  return { text, line };
}

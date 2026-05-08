/**
 * Locate the source line of a `Table <id>` declaration in raw DBML text.
 * Returns a 1-based line number, or null if the table can't be found.
 */
import { TABLE_RE, unquote } from "./dbmlTokens";

export function findTableLine(dbml: string, tableId: string): number | null {
  const lines = dbml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(TABLE_RE);
    if (!m) continue;
    let schema: string;
    let name: string;
    if (m[2] !== undefined) {
      schema = unquote(m[1]);
      name = unquote(m[2]);
    } else {
      schema = "public";
      name = unquote(m[1]);
    }
    if (`${schema || "public"}.${name}` === tableId) return i + 1;
  }
  return null;
}

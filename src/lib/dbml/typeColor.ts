/** Map a SQL/DBML type name to a CSS variable used as the badge color. */
export function typeColorVar(rawType: string): string {
  const t = rawType.toLowerCase();
  if (/(int|serial|bigint|smallint|tinyint)/.test(t)) return "var(--color-type-int)";
  if (/^uuid$/.test(t)) return "var(--color-type-uuid)";
  if (/(decimal|numeric|real|double|float|money)/.test(t))
    return "var(--color-type-decimal)";
  if (/(bool)/.test(t)) return "var(--color-type-bool)";
  if (/(date|time|timestamp|year|interval)/.test(t)) return "var(--color-type-time)";
  if (/(json|jsonb)/.test(t)) return "var(--color-type-json)";
  if (/(char|text|string|clob|enum)/.test(t)) return "var(--color-type-string)";
  return "var(--color-type-default)";
}

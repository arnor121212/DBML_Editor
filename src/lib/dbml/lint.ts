import type { SchemaModel, TableModel } from "./types";

export type LintSeverity = "warn" | "info";

export interface LintIssue {
  id: string;
  rule: "no-pk" | "fk-type-mismatch" | "fk-no-index" | "orphan-table";
  severity: LintSeverity;
  message: string;
  tableId: string;
  column?: string;
}

/**
 * Normalize a type string for comparison. Strips whitespace and parentheses
 * arguments so `int` matches `INTEGER` and `varchar(255)` matches `VARCHAR`.
 * Numeric variants (int/integer, bigint, etc.) and serial families are
 * collapsed to a canonical form so PK ↔ FK pairs read as compatible.
 */
function canonType(raw: string | undefined): string {
  if (!raw) return "";
  const stripped = raw.toLowerCase().replace(/\s+/g, "").replace(/\(.*$/, "");
  switch (stripped) {
    case "integer":
    case "int4":
      return "int";
    case "int8":
    case "bigserial":
    case "serial8":
      return "bigint";
    case "int2":
      return "smallint";
    case "serial":
    case "serial4":
      return "int";
    case "bool":
      return "boolean";
    case "character":
    case "char":
      return "char";
    case "character varying":
    case "varchar":
      return "varchar";
    case "timestamp without time zone":
      return "timestamp";
    case "timestamp with time zone":
    case "timestamptz":
      return "timestamptz";
    default:
      return stripped;
  }
}

function tableById(schema: SchemaModel): Map<string, TableModel> {
  const map = new Map<string, TableModel>();
  for (const t of schema.tables) map.set(t.id, t);
  return map;
}

/**
 * Return all lint issues for the current schema. Pure function — caller is
 * responsible for memoizing if the schema reference changes.
 */
export function lintSchema(schema: SchemaModel): LintIssue[] {
  const issues: LintIssue[] = [];
  const tables = tableById(schema);

  // Rule: no-pk
  for (const t of schema.tables) {
    if (!t.columns.some((c) => c.pk)) {
      issues.push({
        id: `no-pk:${t.id}`,
        rule: "no-pk",
        severity: "warn",
        message: `Table "${t.name}" has no primary key`,
        tableId: t.id,
      });
    }
  }

  // Rule: fk-type-mismatch — FK column's type should match the referenced PK.
  for (const r of schema.refs) {
    const srcTable = tables.get(r.source.tableId);
    const tgtTable = tables.get(r.target.tableId);
    if (!srcTable || !tgtTable) continue;
    const srcCols = r.source.columns.map((n) =>
      srcTable.columns.find((c) => c.name === n),
    );
    const tgtCols = r.target.columns.map((n) =>
      tgtTable.columns.find((c) => c.name === n),
    );
    if (srcCols.length !== tgtCols.length) continue;
    for (let i = 0; i < srcCols.length; i++) {
      const sc = srcCols[i];
      const tc = tgtCols[i];
      if (!sc || !tc) continue;
      if (canonType(sc.type) !== canonType(tc.type)) {
        issues.push({
          id: `fk-type:${r.id}:${sc.name}`,
          rule: "fk-type-mismatch",
          severity: "warn",
          message: `FK "${srcTable.name}.${sc.name}" (${sc.type}) doesn't match "${tgtTable.name}.${tc.name}" (${tc.type})`,
          tableId: srcTable.id,
          column: sc.name,
        });
      }
    }
  }

  // Rule: fk-no-index — many-to-one FK columns benefit from an index.
  // We don't currently parse indexes blocks, so this approximates: warn when
  // an FK column has no `unique` flag and isn't itself a PK (PKs are indexed
  // implicitly). Composite FKs and explicit `indexes { … }` blocks aren't
  // handled — keep severity at "info" until we parse indexes properly.
  for (const r of schema.refs) {
    const srcTable = tables.get(r.source.tableId);
    if (!srcTable) continue;
    if (r.kind === "one-to-one") continue;
    for (const colName of r.source.columns) {
      const col = srcTable.columns.find((c) => c.name === colName);
      if (!col) continue;
      if (col.pk || col.unique) continue;
      issues.push({
        id: `fk-idx:${r.id}:${colName}`,
        rule: "fk-no-index",
        severity: "info",
        message: `FK "${srcTable.name}.${colName}" is unindexed — consider adding an index`,
        tableId: srcTable.id,
        column: colName,
      });
    }
  }

  // Rule: orphan-table — no inbound and no outbound refs.
  const referenced = new Set<string>();
  for (const r of schema.refs) {
    referenced.add(r.source.tableId);
    referenced.add(r.target.tableId);
  }
  for (const t of schema.tables) {
    if (!referenced.has(t.id) && schema.tables.length > 1) {
      issues.push({
        id: `orphan:${t.id}`,
        rule: "orphan-table",
        severity: "info",
        message: `Table "${t.name}" has no relationships`,
        tableId: t.id,
      });
    }
  }

  return issues;
}

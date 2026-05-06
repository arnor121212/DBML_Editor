import { Parser } from "@dbml/core";
import type {
  ColumnModel,
  EnumModel,
  ParseError,
  ParseResult,
  RefModel,
  RelationKind,
  SchemaModel,
  TableModel,
} from "./types";

const parser = new Parser();

/**
 * Determine relation kind from two endpoint cardinalities.
 * DBML endpoints carry `relation: '1' | '*'`.
 */
function relationKind(srcRel: unknown, tgtRel: unknown): RelationKind {
  const a = srcRel === "*" ? "many" : "one";
  const b = tgtRel === "*" ? "many" : "one";
  if (a === "one" && b === "one") return "one-to-one";
  if (a === "one" && b === "many") return "one-to-many";
  if (a === "many" && b === "one") return "many-to-one";
  return "many-to-many";
}

function tableId(schema: string, name: string): string {
  return `${schema || "public"}.${name}`;
}

function defaultToString(d: unknown): string | undefined {
  if (!d || typeof d !== "object") return undefined;
  const dd = d as { value?: unknown; type?: string };
  if (dd.value === undefined) return undefined;
  if (dd.type === "expression") return `\`${String(dd.value)}\``;
  if (dd.type === "string") return `'${String(dd.value)}'`;
  return String(dd.value);
}

function normalize(raw: unknown): SchemaModel {
  const tables: TableModel[] = [];
  const refs: RefModel[] = [];
  const enums: EnumModel[] = [];

  const db = raw as {
    schemas?: Array<{
      name?: string;
      tables?: unknown[];
      refs?: unknown[];
      enums?: unknown[];
    }>;
  };

  // First pass: collect tables and stub columns.
  for (const sch of db.schemas ?? []) {
    const schemaName = sch.name || "public";

    for (const t of (sch.tables ?? []) as Array<{
      name: string;
      schemaName?: string;
      note?: string;
      headerColor?: string;
      fields?: Array<{
        name: string;
        type?: { type_name?: string; schemaName?: string };
        pk?: boolean;
        unique?: boolean;
        not_null?: boolean;
        increment?: boolean;
        dbdefault?: unknown;
        note?: string;
      }>;
    }>) {
      const cols: ColumnModel[] = (t.fields ?? []).map((f) => ({
        name: f.name,
        type: f.type?.type_name ?? "any",
        pk: !!f.pk,
        unique: !!f.unique,
        notNull: !!f.not_null,
        increment: !!f.increment,
        isFk: false,
        isInbound: false,
        default: defaultToString(f.dbdefault),
        note: typeof f.note === "string" ? f.note : undefined,
      }));
      tables.push({
        id: tableId(t.schemaName ?? schemaName, t.name),
        schema: t.schemaName ?? schemaName,
        name: t.name,
        note: typeof t.note === "string" ? t.note : undefined,
        headerColor: t.headerColor,
        columns: cols,
      });
    }

    for (const e of (sch.enums ?? []) as Array<{
      name: string;
      schemaName?: string;
      values?: Array<{ name: string; note?: string }>;
    }>) {
      enums.push({
        id: `${e.schemaName ?? schemaName}.${e.name}`,
        schema: e.schemaName ?? schemaName,
        name: e.name,
        values: (e.values ?? []).map((v) => ({
          name: v.name,
          note: typeof v.note === "string" ? v.note : undefined,
        })),
      });
    }
  }

  // Second pass: refs (across all schemas).
  let refSeq = 0;
  for (const sch of db.schemas ?? []) {
    const schemaName = sch.name || "public";
    for (const r of (sch.refs ?? []) as Array<{
      name?: string;
      endpoints?: Array<{
        tableName: string;
        schemaName?: string;
        fieldNames?: string[];
        relation?: string;
      }>;
    }>) {
      const eps = r.endpoints ?? [];
      if (eps.length !== 2) continue;
      const [a, b] = eps;
      // The FK-bearing column is the "many" side; orient the edge so the arrow
      // points from FK column → referenced column. Otherwise preserve order.
      const aMany = a.relation === "*";
      const bMany = b.relation === "*";
      const [src, tgt] =
        aMany && !bMany ? [a, b] : !aMany && bMany ? [b, a] : [a, b];
      const sourceTable = tableId(src.schemaName ?? schemaName, src.tableName);
      const targetTable = tableId(tgt.schemaName ?? schemaName, tgt.tableName);
      refs.push({
        id: `ref_${refSeq++}_${sourceTable}__${targetTable}`,
        name: r.name,
        kind: relationKind(src.relation, tgt.relation),
        source: { tableId: sourceTable, columns: src.fieldNames ?? [] },
        target: { tableId: targetTable, columns: tgt.fieldNames ?? [] },
      });
    }
  }

  // Mark FK and inbound flags.
  const tableMap = new Map(tables.map((t) => [t.id, t]));
  for (const r of refs) {
    const src = tableMap.get(r.source.tableId);
    const tgt = tableMap.get(r.target.tableId);
    if (src) {
      for (const c of src.columns) {
        if (r.source.columns.includes(c.name)) c.isFk = true;
      }
    }
    if (tgt) {
      for (const c of tgt.columns) {
        if (r.target.columns.includes(c.name)) c.isInbound = true;
      }
    }
  }

  return { tables, refs, enums };
}

interface DbmlDiagItem {
  message?: string;
  location?: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  };
}

function extractErrors(err: unknown): ParseError[] {
  const e = err as {
    message?: string;
    diags?: unknown[];
    diagnostics?: unknown[];
    location?: DbmlDiagItem["location"];
  };
  const diags = (e?.diags ?? e?.diagnostics ?? []) as DbmlDiagItem[];
  if (Array.isArray(diags) && diags.length > 0) {
    return diags
      .map((d): ParseError | null => {
        const msg = d.message ?? "Syntax error";
        const start = d.location?.start ?? { line: 1, column: 1 };
        const end = d.location?.end;
        return {
          message: msg,
          line: start.line ?? 1,
          column: start.column ?? 1,
          endLine: end?.line,
          endColumn: end?.column,
        };
      })
      .filter((x): x is ParseError => x !== null);
  }
  if (e?.location?.start) {
    return [
      {
        message: e.message ?? "Syntax error",
        line: e.location.start.line ?? 1,
        column: e.location.start.column ?? 1,
        endLine: e.location.end?.line,
        endColumn: e.location.end?.column,
      },
    ];
  }
  return [
    {
      message: e?.message ?? "Failed to parse DBML.",
      line: 1,
      column: 1,
    },
  ];
}

export function parseDbml(text: string): ParseResult {
  if (!text.trim()) {
    return { ok: true, schema: { tables: [], refs: [], enums: [] } };
  }
  try {
    const db = parser.parse(text, "dbml");
    return { ok: true, schema: normalize(db) };
  } catch (err) {
    return { ok: false, errors: extractErrors(err) };
  }
}

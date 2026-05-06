import type {
  ColumnModel,
  RefModel,
  SchemaModel,
  TableModel,
} from "./types";

export interface ColumnChange {
  name: string;
  before: ColumnSnapshot;
  after: ColumnSnapshot;
}

export interface ColumnSnapshot {
  type: string;
  flags: string[];
}

export interface TableDiff {
  name: string;
  columnsAdded: string[];
  columnsRemoved: string[];
  columnsChanged: ColumnChange[];
}

export interface SchemaDiff {
  tablesAdded: string[];
  tablesRemoved: string[];
  tablesModified: TableDiff[];
  refsAddedCount: number;
  refsRemovedCount: number;
  isEmpty: boolean;
  totalChanges: number;
}

export function diffSchemas(
  before: SchemaModel,
  after: SchemaModel,
): SchemaDiff {
  const beforeTables = new Map(before.tables.map((t) => [t.id, t]));
  const afterTables = new Map(after.tables.map((t) => [t.id, t]));

  const tablesAdded: string[] = [];
  const tablesRemoved: string[] = [];
  const tablesModified: TableDiff[] = [];

  for (const t of after.tables) {
    const old = beforeTables.get(t.id);
    if (!old) {
      tablesAdded.push(t.name);
      continue;
    }
    const tdiff = diffTables(old, t);
    if (tdiff) tablesModified.push(tdiff);
  }
  for (const t of before.tables) {
    if (!afterTables.has(t.id)) tablesRemoved.push(t.name);
  }

  const beforeRefs = new Set(before.refs.map(refKey));
  const afterRefs = new Set(after.refs.map(refKey));
  let refsAddedCount = 0;
  let refsRemovedCount = 0;
  for (const k of afterRefs) if (!beforeRefs.has(k)) refsAddedCount++;
  for (const k of beforeRefs) if (!afterRefs.has(k)) refsRemovedCount++;

  const totalChanges =
    tablesAdded.length +
    tablesRemoved.length +
    tablesModified.length +
    refsAddedCount +
    refsRemovedCount;

  return {
    tablesAdded,
    tablesRemoved,
    tablesModified,
    refsAddedCount,
    refsRemovedCount,
    isEmpty: totalChanges === 0,
    totalChanges,
  };
}

function diffTables(before: TableModel, after: TableModel): TableDiff | null {
  const beforeCols = new Map(before.columns.map((c) => [c.name, c]));
  const afterCols = new Map(after.columns.map((c) => [c.name, c]));

  const columnsAdded: string[] = [];
  const columnsRemoved: string[] = [];
  const columnsChanged: ColumnChange[] = [];

  for (const c of after.columns) {
    const old = beforeCols.get(c.name);
    if (!old) {
      columnsAdded.push(c.name);
      continue;
    }
    if (!sameColumn(old, c)) {
      columnsChanged.push({
        name: c.name,
        before: columnSnapshot(old),
        after: columnSnapshot(c),
      });
    }
  }
  for (const c of before.columns) {
    if (!afterCols.has(c.name)) columnsRemoved.push(c.name);
  }

  if (
    columnsAdded.length === 0 &&
    columnsRemoved.length === 0 &&
    columnsChanged.length === 0
  ) {
    return null;
  }
  return { name: after.name, columnsAdded, columnsRemoved, columnsChanged };
}

function sameColumn(a: ColumnModel, b: ColumnModel): boolean {
  return (
    a.type === b.type &&
    a.pk === b.pk &&
    a.unique === b.unique &&
    a.notNull === b.notNull &&
    a.default === b.default &&
    a.isFk === b.isFk &&
    a.increment === b.increment
  );
}

function columnSnapshot(c: ColumnModel): ColumnSnapshot {
  const flags: string[] = [];
  if (c.pk) flags.push("pk");
  if (c.increment) flags.push("increment");
  if (c.unique) flags.push("unique");
  if (c.notNull) flags.push("not null");
  if (c.isFk) flags.push("fk");
  return { type: c.type, flags };
}

function refKey(r: RefModel): string {
  return JSON.stringify({
    s: { t: r.source.tableId, c: [...r.source.columns].sort() },
    t: { t: r.target.tableId, c: [...r.target.columns].sort() },
  });
}

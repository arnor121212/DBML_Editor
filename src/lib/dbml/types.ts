/**
 * Internal, normalized model derived from @dbml/core's Database object.
 * We don't trust the raw shape because the upstream types are loose;
 * we copy the bits we use into something our UI can rely on.
 */

export type RelationKind = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

export interface ColumnModel {
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  isFk: boolean;
  isInbound: boolean;
  default?: string;
  note?: string;
  increment: boolean;
}

export interface TableModel {
  id: string; // schema.table
  schema: string;
  name: string;
  note?: string;
  headerColor?: string;
  columns: ColumnModel[];
  // Required for React Flow v12's Node<T extends Record<string, unknown>>.
  [key: string]: unknown;
}

export interface RefEndpointModel {
  tableId: string;
  columns: string[];
}

export interface RefModel {
  id: string;
  source: RefEndpointModel;
  target: RefEndpointModel;
  kind: RelationKind;
  name?: string;
}

export interface EnumModel {
  id: string;
  schema: string;
  name: string;
  values: { name: string; note?: string }[];
}

export interface SchemaModel {
  tables: TableModel[];
  refs: RefModel[];
  enums: EnumModel[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export type ParseResult =
  | { ok: true; schema: SchemaModel }
  | { ok: false; errors: ParseError[] };

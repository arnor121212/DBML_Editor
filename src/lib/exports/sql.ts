import { exporter } from "@dbml/core";

export type SqlDialect = "postgres" | "mysql" | "mssql";

export function exportSql(dbml: string, dialect: SqlDialect): string {
  return exporter.export(dbml, dialect);
}

export function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { Parser, exporter } from "@dbml/core";
import fs from "node:fs";

const src = fs.readFileSync("src/lib/dbml/examples.ts", "utf-8");
const m = src.match(/ECOMMERCE_DBML\s*=\s*`([\s\S]+?)`;/);
if (!m) {
  console.error("Could not find ECOMMERCE_DBML template");
  process.exit(1);
}
// Un-escape any escaped backticks the JS file uses.
const dbml = m[1].replace(/\\`/g, "`");

const p = new Parser();
try {
  const db = p.parse(dbml, "dbml");
  const s = db.schemas[0];
  console.log(
    `Tables: ${s.tables.length} | Refs: ${s.refs.length} | Enums: ${s.enums.length} | Groups: ${s.tableGroups?.length ?? 0}`,
  );
  for (const t of s.tables) {
    console.log(`  ${t.name}: ${t.fields.map((f) => f.name).join(", ")}`);
  }
  console.log("\nRefs:");
  for (const r of s.refs) {
    const [a, b] = r.endpoints;
    console.log(
      `  ${a.tableName}.${a.fieldNames.join(",")} (${a.relation})  <->  ${b.tableName}.${b.fieldNames.join(",")} (${b.relation})`,
    );
  }
  console.log("\nMySQL export size:", exporter.export(dbml, "mysql").length);
  console.log("Postgres export size:", exporter.export(dbml, "postgres").length);
  console.log("MSSQL export size:", exporter.export(dbml, "mssql").length);
} catch (e) {
  console.error("PARSE ERROR:");
  console.error(e?.message ?? e);
  if (e?.diags) {
    for (const d of e.diags) {
      console.error("  ·", d.message ?? d, "@", JSON.stringify(d.location?.start));
    }
  }
  process.exit(2);
}

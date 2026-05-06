import { stringToHue } from "@/lib/utils";

/**
 * Curated palette — table headers and minimap dots both pull from here so a
 * given table name is always represented by the same hue.
 */
export const TABLE_HEADER_COLORS = [
  "oklch(0.7 0.16 245)", // blue
  "oklch(0.72 0.18 295)", // purple
  "oklch(0.72 0.18 340)", // pink
  "oklch(0.74 0.16 25)", // coral
  "oklch(0.78 0.15 60)", // orange
  "oklch(0.8 0.15 90)", // yellow
  "oklch(0.74 0.15 145)", // green
  "oklch(0.72 0.13 200)", // teal
] as const;

export function pickHeaderColor(name: string, override?: string): string {
  if (override) return override;
  return TABLE_HEADER_COLORS[stringToHue(name) % TABLE_HEADER_COLORS.length];
}

import { diffArrays } from "diff";

export interface DiffHunk {
  id: string;
  /** 1-indexed line in the BASE document where this hunk starts. */
  baseStart: number;
  /** Number of base lines this hunk replaces (0 = pure addition). */
  baseLength: number;
  /** Original lines being removed (length === baseLength). */
  removedLines: string[];
  /** Lines this hunk inserts. */
  addedLines: string[];
}

/**
 * Splits text into lines for diffing. We don't strip the trailing empty entry
 * from a `\n`-terminated file because preserving it keeps line numbers stable
 * when the model adds a final newline.
 */
function splitLines(text: string): string[] {
  return text.split("\n");
}

/**
 * Computes line-level hunks between two DBML documents. Adjacent
 * removed/added blocks are grouped into a single hunk so the per-hunk
 * accept/reject UI matches the user's mental model of a "change".
 */
export function computeLineHunks(base: string, proposed: string): DiffHunk[] {
  const baseLines = splitLines(base);
  const proposedLines = splitLines(proposed);
  const parts = diffArrays(baseLines, proposedLines);

  const hunks: DiffHunk[] = [];
  let baseLine = 1; // 1-indexed cursor into base

  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (!p.removed && !p.added) {
      baseLine += p.value.length;
      i++;
      continue;
    }

    // Group consecutive add/remove parts into one hunk.
    const removed: string[] = [];
    const added: string[] = [];
    const hunkBaseStart = baseLine;
    while (i < parts.length && (parts[i].removed || parts[i].added)) {
      if (parts[i].removed) {
        removed.push(...parts[i].value);
        baseLine += parts[i].value.length;
      } else {
        added.push(...parts[i].value);
      }
      i++;
    }

    hunks.push({
      id: `h-${hunks.length}-${hunkBaseStart}`,
      baseStart: hunkBaseStart,
      baseLength: removed.length,
      removedLines: removed,
      addedLines: added,
    });
  }

  // Drop hunks that only differ in whitespace/blank lines — the model often
  // re-emits an existing table block with tiny formatting tweaks, which the
  // line differ flags as a remove+add even though the schema is unchanged.
  // Filtering here keeps the inline review focused on real edits.
  return hunks.filter((h) => !isCosmeticHunk(h));
}

function normalizeForCompare(lines: string[]): string[] {
  return lines
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l.length > 0);
}

function isCosmeticHunk(h: DiffHunk): boolean {
  const a = normalizeForCompare(h.removedLines);
  const b = normalizeForCompare(h.addedLines);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type HunkStatus = "pending" | "accepted" | "rejected";

export interface ReviewHunk extends DiffHunk {
  status: HunkStatus;
}

/**
 * Builds text from base + hunk decisions. Two modes:
 *
 *   "preview" — what the editor shows. Pending hunks contribute their
 *               addedLines (visible as the AI's proposal, decorated green
 *               by the inline diff controller). Rejected hunks revert to
 *               the original lines. Accepted contribute addedLines.
 *
 *   "applied" — what gets committed to `store.dbml` (and therefore the
 *               diagram). Pending hunks contribute the original lines
 *               (they aren't part of the schema yet). Rejected hunks
 *               revert to original. Accepted contribute addedLines.
 *
 * Also returns 1-indexed line ranges per hunk in the synthesized text —
 * the controller needs them to position decorations and view zones.
 */
export type SynthesizeMode = "preview" | "applied";

export interface SynthesizedPreview {
  text: string;
  /** id → { startLine, endLine } in the synthesized text (1-indexed, inclusive). */
  hunkRanges: Record<
    string,
    { startLine: number; endLine: number; addedCount: number }
  >;
}

export function synthesizePreview(
  baseDbml: string,
  hunks: ReviewHunk[],
  mode: SynthesizeMode = "preview",
): SynthesizedPreview {
  const baseLines = splitLines(baseDbml);
  const sorted = [...hunks].sort((a, b) => a.baseStart - b.baseStart);

  const out: string[] = [];
  const hunkRanges: SynthesizedPreview["hunkRanges"] = {};
  let baseIdx = 0; // 0-indexed cursor into baseLines

  for (const h of sorted) {
    // Copy unchanged lines up to the hunk's start.
    while (baseIdx < h.baseStart - 1) {
      out.push(baseLines[baseIdx]);
      baseIdx++;
    }

    // Lines contributed by this hunk start at out.length + 1 (1-indexed).
    const startLine = out.length + 1;
    const useAdded =
      h.status === "accepted" ||
      (h.status === "pending" && mode === "preview");

    if (useAdded) {
      // Pending-in-preview, or accepted in either mode → use added lines.
      for (const line of h.addedLines) out.push(line);
      baseIdx += h.baseLength;
      hunkRanges[h.id] = {
        startLine,
        endLine: out.length,
        addedCount: h.addedLines.length,
      };
    } else {
      // Rejected (always), or pending-in-applied → keep original lines.
      for (let j = 0; j < h.baseLength; j++) {
        out.push(baseLines[baseIdx]);
        baseIdx++;
      }
      hunkRanges[h.id] = {
        startLine,
        endLine: out.length,
        addedCount: 0,
      };
    }
  }

  // Tail.
  while (baseIdx < baseLines.length) {
    out.push(baseLines[baseIdx]);
    baseIdx++;
  }

  return { text: out.join("\n"), hunkRanges };
}

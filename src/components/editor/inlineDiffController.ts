import type * as MonacoNs from "monaco-editor";
import type { editor as EditorNs } from "monaco-editor";
import type { ReviewState } from "@/store/schemaStore";
import { useSchemaStore } from "@/store/schemaStore";
import {
  synthesizePreview,
  type ReviewHunk,
} from "@/lib/dbml/lineDiff";

interface ZoneRecord {
  hunkId: string;
  zoneId: string;
  domNode: HTMLDivElement;
}

export interface InlineDiffControllerHooks {
  /**
   * Called immediately before the controller mutates the editor model. Lets
   * DBMLEditor flag the upcoming synchronous onChange as programmatic, so
   * its handleChange can skip the debounced setDbml that would otherwise
   * cancel the review (since setDbml clears review state on user edits).
   */
  beforeProgrammaticEdit: () => void;
}

/**
 * Manages Monaco-side rendering for the AI review state:
 *  - synthesizes the editor content from base + hunk decisions
 *  - decorates pending hunks' added lines (green)
 *  - inserts a view zone above each pending hunk containing the
 *    "Accept / Reject" toolbar and the removed lines (red strikethrough)
 *
 * The controller owns the editor model's content while review is active.
 */
export class InlineDiffController {
  private decorationIds: string[] = [];
  private zones: ZoneRecord[] = [];

  constructor(
    private editor: EditorNs.IStandaloneCodeEditor,
    private monaco: typeof MonacoNs,
    private hooks: InlineDiffControllerHooks,
  ) {}

  update(review: ReviewState): void {
    const model = this.editor.getModel();
    if (!model) return;

    const { text, hunkRanges } = synthesizePreview(
      review.baseDbml,
      review.hunks,
    );

    // 1) Sync model content if needed (preserve selection across the swap).
    //    Monaco fires onDidChangeModelContent synchronously inside setValue,
    //    so flag the next change as programmatic before we trigger it.
    if (model.getValue() !== text) {
      const sel = this.editor.getSelection();
      this.hooks.beforeProgrammaticEdit();
      model.setValue(text);
      if (sel) this.editor.setSelection(sel);
    }

    // 2) Whole-line green decorations on pending hunks' added lines.
    const decorations: EditorNs.IModelDeltaDecoration[] = [];
    for (const h of review.hunks) {
      if (h.status !== "pending") continue;
      const range = hunkRanges[h.id];
      if (!range || range.addedCount === 0) continue;
      decorations.push({
        range: new this.monaco.Range(range.startLine, 1, range.endLine, 1),
        options: {
          isWholeLine: true,
          className: "dbml-diff-line-add",
          marginClassName: "dbml-diff-margin-add",
          minimap: null,
          overviewRuler: {
            color: "rgba(80, 200, 120, 0.6)",
            position: this.monaco.editor.OverviewRulerLane.Left,
          },
        },
      });
    }
    this.decorationIds = this.editor.deltaDecorations(
      this.decorationIds,
      decorations,
    );

    // 3) View zones: per-pending-hunk toolbar + removed lines block.
    this.editor.changeViewZones((accessor) => {
      for (const z of this.zones) accessor.removeZone(z.zoneId);
      this.zones = [];

      for (const h of review.hunks) {
        if (h.status !== "pending") continue;
        const range = hunkRanges[h.id];
        if (!range) continue;

        const dom = this.buildZoneDom(h);
        // Place the zone *above* the hunk's added lines (or above where the
        // pure deletion happened, when addedCount === 0).
        const afterLineNumber = Math.max(0, range.startLine - 1);
        const zoneId = accessor.addZone({
          afterLineNumber,
          heightInLines: 1 + h.removedLines.length, // 1 toolbar row + removed lines
          domNode: dom,
        });
        this.zones.push({ hunkId: h.id, zoneId, domNode: dom });
      }
    });
  }

  private buildZoneDom(h: ReviewHunk): HTMLDivElement {
    const root = document.createElement("div");
    root.className = "dbml-diff-zone";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "dbml-diff-toolbar";

    const label = document.createElement("span");
    label.className = "dbml-diff-toolbar-label";
    label.textContent = describeHunk(h);
    toolbar.appendChild(label);

    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    toolbar.appendChild(spacer);

    const acceptBtn = this.makeButton("accept", "Accept", () => {
      useSchemaStore.getState().setHunkStatus(h.id, "accepted");
    });
    const rejectBtn = this.makeButton("reject", "Reject", () => {
      useSchemaStore.getState().setHunkStatus(h.id, "rejected");
    });
    toolbar.appendChild(acceptBtn);
    toolbar.appendChild(rejectBtn);
    root.appendChild(toolbar);

    // Removed lines block
    if (h.removedLines.length > 0) {
      const block = document.createElement("div");
      block.className = "dbml-diff-removed";
      for (const line of h.removedLines) {
        const row = document.createElement("div");
        row.className = "dbml-diff-removed-line";
        //   keeps empty lines visible (so the strikethrough shows).
        row.textContent = line.length > 0 ? line : " ";
        block.appendChild(row);
      }
      root.appendChild(block);
    }

    return root;
  }

  dispose(): void {
    this.editor.deltaDecorations(this.decorationIds, []);
    this.decorationIds = [];
    this.editor.changeViewZones((accessor) => {
      for (const z of this.zones) accessor.removeZone(z.zoneId);
    });
    this.zones = [];
  }

  private makeButton(
    variant: "accept" | "reject",
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dbml-diff-btn dbml-diff-btn-${variant}`;
    btn.textContent = label;
    // Stop mousedown so Monaco doesn't try to place the caret instead of
    // letting the click reach the button. Stops on the *button only* — the
    // surrounding zone needs to bubble events through for focus management.
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
      // Hand focus back to the editor so the user can keep typing and so
      // Space/Enter aren't captured by the (now-focused) button.
      this.editor.focus();
    });
    return btn;
  }
}

function describeHunk(h: ReviewHunk): string {
  const a = h.addedLines.length;
  const r = h.removedLines.length;
  if (a > 0 && r > 0) return `+${a} −${r}`;
  if (a > 0) return `+${a}`;
  return `−${r}`;
}

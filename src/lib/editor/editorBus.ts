/**
 * Tiny module-scoped registry holding a reference to the active Monaco
 * editor. Used by the diagram (TableNode, DiagramCanvas) to push DBML edits
 * *through* Monaco — so they land on the built-in undo stack and Ctrl+Z
 * works — and to jump the cursor to a table's declaration on click.
 *
 * If no editor is registered (e.g. the editor side-panel is closed and
 * `DBMLEditor` is unmounted), the helpers return false so the caller can
 * fall back to a direct store mutation.
 */
import type { editor as MonacoEditor } from "monaco-editor";
import type * as Monaco from "monaco-editor";

let editorRef: MonacoEditor.IStandaloneCodeEditor | null = null;
let monacoRef: typeof Monaco | null = null;
/** A reveal target queued while no editor was mounted. Replayed once the
 *  editor registers — so click-to-reveal works even when the click also
 *  caused the editor side-panel to open. */
let pendingReveal: number | null = null;

export function registerEditor(
  ed: MonacoEditor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
): void {
  editorRef = ed;
  monacoRef = monaco;
  if (pendingReveal !== null) {
    const line = pendingReveal;
    pendingReveal = null;
    // Defer so Monaco has a chance to lay out before scrolling.
    requestAnimationFrame(() => revealLine(line));
  }
}

export function unregisterEditor(
  ed: MonacoEditor.IStandaloneCodeEditor,
): void {
  if (editorRef === ed) {
    editorRef = null;
    monacoRef = null;
  }
}

/**
 * Replace the entire model contents with `newText` via `executeEdits`.
 * Unlike `setValue`, this records the change on Monaco's undo stack so
 * Ctrl+Z reverses it. Returns false if no editor is currently registered.
 */
export function replaceText(newText: string): boolean {
  if (!editorRef || !monacoRef) return false;
  const model = editorRef.getModel();
  if (!model) return false;
  if (model.getValue() === newText) return true;
  const fullRange = model.getFullModelRange();
  editorRef.executeEdits("schemasync.diagram", [
    { range: fullRange, text: newText, forceMoveMarkers: true },
  ]);
  editorRef.pushUndoStop();
  return true;
}

/**
 * Reveal a 1-based line in the editor and place the cursor at column 1.
 * Does *not* call `editor.focus()` — keeping focus on the canvas means
 * keys like Delete still go to React Flow for node deletion. The user
 * sees where they are in the code; clicking into the editor manually
 * starts typing. If the editor isn't mounted yet, the request is queued
 * and replayed when an editor registers.
 */
export function revealLine(line: number): boolean {
  if (!editorRef || !monacoRef) {
    pendingReveal = line;
    return false;
  }
  const model = editorRef.getModel();
  if (!model) return false;
  const clamped = Math.max(1, Math.min(line, model.getLineCount()));
  editorRef.revealLineInCenterIfOutsideViewport(clamped);
  editorRef.setPosition({ lineNumber: clamped, column: 1 });
  return true;
}

export function hasEditor(): boolean {
  return editorRef !== null;
}

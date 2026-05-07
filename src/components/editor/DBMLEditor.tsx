import { useCallback, useEffect, useMemo, useRef } from "react";
import Editor, { useMonaco, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { MonacoBinding } from "y-monaco";
import {
  DBML_LANGUAGE_ID,
  defineDbmlThemes,
  registerDbmlLanguage,
} from "./dbmlLanguage";
import { InlineDiffController } from "./inlineDiffController";
import { useTheme } from "@/lib/theme";
import { useSchemaStore } from "@/store/schemaStore";
import { debounce } from "@/lib/utils";
import type { CollabSession } from "@/lib/collab/CollabSession";

interface Props {
  /** When provided, Monaco is bound to the session's Y.Text via y-monaco
   *  and we skip the local debounced setDbml path entirely. */
  session?: CollabSession | null;
}

export function DBMLEditor({ session }: Props) {
  const monaco = useMonaco();
  const { resolved } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  /**
   * Tracks the last value the user typed (or that we synced to the model).
   * If the store's `dbml` differs from this, the change came from outside
   * (e.g., "Load example schema") and we update the model imperatively —
   * preserving the cursor when the change came from the user themselves.
   */
  const lastSyncedRef = useRef<string>("");
  const dbml = useSchemaStore((s) => s.dbml);
  const errors = useSchemaStore((s) => s.errors);
  const canEdit = useSchemaStore((s) => s.canEdit);
  const setDbml = useSchemaStore((s) => s.setDbml);
  const review = useSchemaStore((s) => s.review);
  const diffControllerRef = useRef<InlineDiffController | null>(null);
  /**
   * Set to true synchronously *before* a programmatic edit (controller swap,
   * dbml-watch setValue). Monaco fires onChange synchronously inside setValue;
   * handleChange consumes the flag and skips the debounced setDbml call so
   * we don't accidentally cancel the active review.
   */
  const programmaticEditRef = useRef(false);
  const themeName = resolved === "dark" ? "schemasync-dark" : "schemasync-light";

  // Debounced update — keeps the parser off the typing path.
  const debouncedSet = useMemo(() => debounce((t: string) => setDbml(t), 180), [setDbml]);
  useEffect(() => () => debouncedSet.cancel(), [debouncedSet]);

  // Register language + themes once.
  useEffect(() => {
    if (!monaco) return;
    registerDbmlLanguage(monaco);
    defineDbmlThemes(monaco);
  }, [monaco]);

  // Set the active theme reactively.
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.setTheme(themeName);
  }, [monaco, themeName]);

  // Push diagnostic markers on error change.
  useEffect(() => {
    if (!monaco || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "dbml",
      errors.map((e) => ({
        severity: monaco.MarkerSeverity.Error,
        message: e.message,
        startLineNumber: e.line,
        startColumn: e.column,
        endLineNumber: e.endLine ?? e.line,
        endColumn: e.endColumn ?? e.column + 1,
      })),
    );
  }, [monaco, errors]);

  // Sync external dbml changes (e.g. Load example) into the model without
  // resetting the cursor on user-driven edits. Skipped when:
  //   - a collab session is active — y-monaco mediates external updates via Y.Text
  //   - a review is active — the InlineDiffController owns the model content
  useEffect(() => {
    if (session) return;
    if (review) return;
    if (!editorRef.current) return;
    if (dbml === lastSyncedRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    if (model.getValue() === dbml) {
      lastSyncedRef.current = dbml;
      return;
    }
    programmaticEditRef.current = true;
    editorRef.current.setValue(dbml);
    lastSyncedRef.current = dbml;
  }, [dbml, session, review]);

  // y-monaco binding lifecycle. Bind once we have both an editor instance
  // and a collab session; tear down on either change or unmount.
  //
  // MonacoBinding's constructor reconciles the two on first attach (Y.Text
  // wins): it calls `monacoModel.setValue(ytext.toString())`, which wipes the
  // model when Y.Text is empty. Snapshot the model's value BEFORE that so we
  // can push it into Y.Text when we're the very first peer — otherwise a
  // freshly-created schema would sit empty until the seed effect (gated on
  // provider sync, ~1.2s later) finally runs.
  useEffect(() => {
    if (!session || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const initialModelValue = model.getValue();
    const binding = new MonacoBinding(
      session.text,
      model,
      new Set([editorRef.current]),
      session.provider.awareness,
    );
    bindingRef.current = binding;
    if (session.text.length === 0 && initialModelValue.length > 0) {
      session.setText(initialModelValue);
    }
    return () => {
      binding.destroy();
      bindingRef.current = null;
    };
  }, [session]);

  // Mount/update/dispose the inline diff overlay based on review state.
  useEffect(() => {
    if (!monaco || !editorRef.current) return;
    if (review) {
      if (!diffControllerRef.current) {
        diffControllerRef.current = new InlineDiffController(
          editorRef.current,
          monaco,
          {
            beforeProgrammaticEdit: () => {
              programmaticEditRef.current = true;
            },
          },
        );
      }
      diffControllerRef.current.update(review);
    } else if (diffControllerRef.current) {
      diffControllerRef.current.dispose();
      diffControllerRef.current = null;
    }
  }, [monaco, review]);

  useEffect(
    () => () => {
      diffControllerRef.current?.dispose();
      diffControllerRef.current = null;
    },
    [],
  );

  const handleMount = useCallback<OnMount>(
    (ed, m) => {
      editorRef.current = ed;
      registerDbmlLanguage(m);
      defineDbmlThemes(m);
      m.editor.setTheme(themeName);
      lastSyncedRef.current = ed.getValue();
    },
    [themeName],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (typeof value !== "string") return;
      // When y-monaco is in charge, the Y.Text observer in useSchemaCollab
      // is already debouncing the change into the store — don't double-emit.
      if (session) return;
      // Programmatic edits (controller-driven, or our own setValue calls in
      // the dbml-watch effect) shouldn't propagate back through setDbml —
      // doing so would cancel an active review or echo external syncs.
      if (programmaticEditRef.current) {
        programmaticEditRef.current = false;
        lastSyncedRef.current = value;
        return;
      }
      lastSyncedRef.current = value;
      debouncedSet(value);
    },
    [debouncedSet, session],
  );

  return (
    <div className="relative h-full w-full">
      <Editor
        height="100%"
        defaultLanguage={DBML_LANGUAGE_ID}
        language={DBML_LANGUAGE_ID}
        defaultValue={dbml}
        onMount={handleMount}
        onChange={handleChange}
        options={{
          readOnly: !canEdit,
          readOnlyMessage: { value: "You're viewing in read-only mode." },
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontLigatures: true,
          fontSize: 13,
          lineHeight: 22,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 16, bottom: 24 },
          guides: {
            indentation: true,
            highlightActiveIndentation: false,
            bracketPairs: true,
          },
          bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
          stickyScroll: { enabled: false },
          tabSize: 2,
          wordWrap: "on",
          automaticLayout: true,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            useShadows: false,
          },
          renderWhitespace: "selection",
        }}
      />
    </div>
  );
}

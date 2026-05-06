import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Pencil,
  Table as TableIcon,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SplitPane } from "@/components/layout/SplitPane";
import { DBMLEditor } from "@/components/editor/DBMLEditor";
import { ErrorBar } from "@/components/editor/ErrorBar";
import { AiPanel } from "@/components/editor/AiPanel";
import { DiagramCanvas } from "@/components/diagram/DiagramCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSchemaStore } from "@/store/schemaStore";
import { useStorage } from "@/lib/storage";
import { useAuth } from "@/lib/auth/AuthProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn, formatError } from "@/lib/utils";

const STORAGE_EDITOR_OPEN = "schemasync.panel.editor";
const STORAGE_AI_OPEN = "schemasync.panel.ai";

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1";
}

export function SchemaEditor() {
  const { id } = useParams<{ id: string }>();
  const storage = useStorage();
  const loadRecord = useSchemaStore((s) => s.loadRecord);
  const reset = useSchemaStore((s) => s.reset);
  const loaded = useSchemaStore((s) => s.loaded);
  const errors = useSchemaStore((s) => s.errors);
  const tableCount = useSchemaStore((s) => s.schema.tables.length);
  const refCount = useSchemaStore((s) => s.schema.refs.length);
  const name = useSchemaStore((s) => s.name);
  const setName = useSchemaStore((s) => s.setName);

  const [missing, setMissing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(() =>
    readBool(STORAGE_EDITOR_OPEN, true),
  );
  const [aiOpen, setAiOpen] = useState(() => readBool(STORAGE_AI_OPEN, false));
  const { user, configured, isLoading: authLoading } = useAuth();
  const aiAvailable = configured && !authLoading && !!user;
  const aiTooltip = !configured
    ? "AI generation requires Supabase configuration."
    : !user
      ? "Sign in to use AI generation."
      : aiOpen
        ? "Hide AI panel"
        : "Show AI panel";

  function toggleEditor() {
    setEditorOpen((v) => {
      const next = !v;
      window.localStorage.setItem(STORAGE_EDITOR_OPEN, next ? "1" : "0");
      return next;
    });
  }
  function toggleAi() {
    if (!aiAvailable) return;
    setAiOpen((v) => {
      const next = !v;
      window.localStorage.setItem(STORAGE_AI_OPEN, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    async function run() {
      if (!id) return;
      try {
        const rec = await storage.get(id);
        if (cancelled) return;
        if (!rec) {
          setMissing(true);
          return;
        }
        loadRecord(rec);
      } catch (e) {
        if (cancelled) return;
        toast.error("Couldn't load schema", { description: formatError(e) });
        setMissing(true);
      }
    }
    void run();
    return () => {
      cancelled = true;
      reset();
    };
  }, [id, loadRecord, reset, storage]);

  if (missing) {
    return (
      <div className="grid h-full place-items-center bg-radial-fade">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Schema not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted.
          </p>
          <Button asChild className="mt-4">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const editorPane = (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[12px] text-muted-foreground">
        <Code2 className="size-3.5" />
        <span>schema.dbml</span>
      </div>
      <div className="min-h-0 flex-1">
        {loaded ? (
          <DBMLEditor />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
      <ErrorBar />
    </div>
  );

  const diagramPane = (
    <div className="h-full bg-background">
      {loaded && <DiagramCanvas />}
    </div>
  );

  const aiPane = <AiPanel onClose={toggleAi} />;

  let main: React.ReactNode;
  if (editorOpen && aiOpen) {
    main = (
      <SplitPane
        storageKey="schemasync.split.editor"
        initial={32}
        min={20}
        max={55}
        left={editorPane}
        right={
          <SplitPane
            storageKey="schemasync.split.ai"
            initial={62}
            min={42}
            max={82}
            left={diagramPane}
            right={aiPane}
          />
        }
      />
    );
  } else if (editorOpen) {
    main = (
      <SplitPane
        storageKey="schemasync.split.editor"
        initial={35}
        min={22}
        max={65}
        left={editorPane}
        right={diagramPane}
      />
    );
  } else if (aiOpen) {
    main = (
      <SplitPane
        storageKey="schemasync.split.ai"
        initial={68}
        min={45}
        max={82}
        left={diagramPane}
        right={aiPane}
      />
    );
  } else {
    main = diagramPane;
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-h-0 flex-col">
        <AppHeader>
          <Button asChild size="icon-sm" variant="ghost" aria-label="Back to dashboard">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          <NameEditor value={name} onSave={setName} />
          <span className="ml-2 inline-flex items-center gap-3 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TableIcon className="size-3" />
              {tableCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <Code2 className="size-3" />
              {refCount} refs
            </span>
            {errors.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3" /> ok
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
                {errors.length} {errors.length === 1 ? "issue" : "issues"}
              </span>
            )}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={toggleEditor}
                  aria-pressed={editorOpen}
                  aria-label={editorOpen ? "Hide editor" : "Show editor"}
                >
                  {editorOpen ? <PanelLeftClose /> : <PanelLeft />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {editorOpen ? "Hide editor" : "Show editor"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={aiAvailable ? -1 : 0}>
                  <Button
                    size="icon-sm"
                    variant={aiOpen ? "soft" : "ghost"}
                    onClick={toggleAi}
                    disabled={!aiAvailable}
                    aria-pressed={aiOpen}
                    aria-label={aiOpen ? "Hide AI panel" : "Show AI panel"}
                    className={cn(
                      aiOpen && "shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]",
                    )}
                  >
                    {aiOpen ? <PanelRightClose /> : <PanelRight />}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{aiTooltip}</TooltipContent>
            </Tooltip>
          </div>
        </AppHeader>

        <main className="min-h-0 flex-1">{main}</main>
      </div>
    </TooltipProvider>
  );
}

function NameEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim() || "Untitled schema";
    if (next !== value) onSave(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-7 w-56 px-2 text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group/name inline-flex max-w-xs items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-sm font-medium hover:bg-surface-2"
      title="Rename"
    >
      <span className="truncate">{value}</span>
      <Pencil className="size-3 opacity-0 transition-opacity group-hover/name:opacity-60" />
    </button>
  );
}

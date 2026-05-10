import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Code2,
  Download,
  Eye,
  Globe,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Pencil,
  Share2,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SidePanel } from "@/components/layout/SidePanel";
import { DBMLEditor } from "@/components/editor/DBMLEditor";
import { ErrorBar } from "@/components/editor/ErrorBar";
import { AiPanel } from "@/components/editor/AiPanel";
import { StatusPill } from "@/components/editor/StatusPill";
import { ImportSqlDialog } from "@/components/editor/ImportSqlDialog";
import { CommandPalette, usePaletteHotkey } from "@/components/palette/CommandPalette";
import { register as registerCommand } from "@/lib/commands/registry";
import { DiagramCanvas } from "@/components/diagram/DiagramCanvas";
import { ShareDialog } from "@/components/sharing/ShareDialog";
import { HistoryDialog } from "@/components/history/HistoryDialog";
import { PresenceStack } from "@/components/collab/PresenceStack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSchemaStore } from "@/store/schemaStore";
import { loadSchema, type SchemaRecord } from "@/lib/storage";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAutoSnapshot } from "@/lib/snapshots/useAutoSnapshot";
import { useSchemaCollab } from "@/lib/collab/useSchemaCollab";
import { usePresence } from "@/lib/collab/usePresence";
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
  const loadRecord = useSchemaStore((s) => s.loadRecord);
  const reset = useSchemaStore((s) => s.reset);
  const loaded = useSchemaStore((s) => s.loaded);
  const errors = useSchemaStore((s) => s.errors);
  const tableCount = useSchemaStore((s) => s.schema.tables.length);
  const refCount = useSchemaStore((s) => s.schema.refs.length);
  const name = useSchemaStore((s) => s.name);
  const setName = useSchemaStore((s) => s.setName);
  const isOwner = useSchemaStore((s) => s.isOwner);
  const canEdit = useSchemaStore((s) => s.canEdit);
  const myRole = useSchemaStore((s) => s.myRole);

  const [missing, setMissing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [importSqlOpen, setImportSqlOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<SchemaRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(() =>
    readBool(STORAGE_EDITOR_OPEN, true),
  );
  const [aiOpen, setAiOpen] = useState(() => readBool(STORAGE_AI_OPEN, false));

  usePaletteHotkey(setPaletteOpen);

  useAutoSnapshot();
  const session = useSchemaCollab();
  const { peers, setCursor } = usePresence(session);

  const { user, configured, isLoading: authLoading } = useAuth();
  const aiAvailable = configured && !authLoading && !!user;
  const aiTooltip = aiTooltipFor({ configured, user: !!user, aiOpen });

  const requestEditorOpen = useCallback(() => {
    setEditorOpen((v) => {
      if (v) return v;
      window.localStorage.setItem(STORAGE_EDITOR_OPEN, "1");
      return true;
    });
  }, []);

  const toggleEditor = useCallback(() => {
    setEditorOpen((v) => {
      const next = !v;
      window.localStorage.setItem(STORAGE_EDITOR_OPEN, next ? "1" : "0");
      return next;
    });
  }, []);
  const toggleAi = useCallback(() => {
    if (!aiAvailable) return;
    setAiOpen((v) => {
      const next = !v;
      window.localStorage.setItem(STORAGE_AI_OPEN, next ? "1" : "0");
      return next;
    });
  }, [aiAvailable]);

  const openImportSql = useCallback(() => setImportSqlOpen(true), []);

  useEffect(() => {
    return registerCommand(
      {
        id: "editor.togglePanel",
        label: "Toggle editor panel",
        icon: PanelLeft,
        scope: "always",
        group: "View",
        handler: toggleEditor,
      },
      {
        id: "schema.importSql",
        label: "Import SQL DDL…",
        icon: Download,
        scope: "canEdit",
        group: "Schema",
        handler: openImportSql,
      },
      ...(aiAvailable
        ? [
            {
              id: "ai.togglePanel",
              label: "Toggle AI panel",
              icon: Sparkles,
              scope: "always",
              group: "View",
              handler: toggleAi,
            } as const,
          ]
        : []),
    );
  }, [toggleEditor, toggleAi, openImportSql, aiAvailable]);

  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    async function run() {
      if (!id) return;
      try {
        const rec = await loadSchema(id);
        if (cancelled) return;
        if (!rec) {
          setMissing(true);
          return;
        }
        setCurrentRecord(rec);
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
  }, [id, loadRecord, reset]);

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
          <DBMLEditor session={session} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
      <ErrorBar />
    </div>
  );

  const aiPane = <AiPanel onClose={toggleAi} />;

  const main = (
    <div className="flex h-full w-full overflow-hidden">
      <SidePanel
        side="left"
        open={editorOpen}
        storageKey="schemasync.panel.editor.width"
        defaultWidth={420}
        minWidth={300}
        maxWidth={720}
      >
        {editorPane}
      </SidePanel>
      <div className="h-full min-w-0 flex-1 bg-background">
        {loaded && (
          <DiagramCanvas
            peers={session ? peers : undefined}
            onCursorMove={session ? setCursor : undefined}
            onRequestEditorOpen={requestEditorOpen}
          />
        )}
      </div>
      <SidePanel
        side="right"
        open={aiOpen}
        storageKey="schemasync.panel.ai.width"
        defaultWidth={400}
        minWidth={320}
        maxWidth={640}
      >
        {aiPane}
      </SidePanel>
    </div>
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-h-0 flex-col">
        <AppHeader>
          <Button asChild size="icon-sm" variant="ghost" aria-label="Back to dashboard">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          {isOwner ? (
            <NameEditor value={name} onSave={setName} />
          ) : (
            <span className="inline-flex max-w-xs items-center gap-1.5 truncate px-1.5 py-1 text-sm font-medium">
              {name}
            </span>
          )}
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
          {canEdit && <StatusPill />}
          <RoleBadge canEdit={canEdit} myRole={myRole} />

          <div className="ml-auto flex items-center gap-1">
            {session && <PresenceStack peers={peers} />}
            {currentRecord && currentRecord.ownerId !== undefined && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setHistoryOpen(true)}
                    aria-label="Version history"
                  >
                    <Clock />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Version history</TooltipContent>
              </Tooltip>
            )}
            {isOwner && currentRecord && (
              <Button
                size="sm"
                variant="soft"
                className="gap-1.5"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="size-3.5" /> Share
              </Button>
            )}
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
                      aiOpen &&
                        "shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]",
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

        {!canEdit && <ReadOnlyBanner myRole={myRole} />}
        {canEdit && <NoProjectBanner />}

        <main className="min-h-0 flex-1">{main}</main>

        {currentRecord && (
          <ShareDialog
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            schema={currentRecord}
            onSchemaUpdated={(next) => setCurrentRecord(next)}
          />
        )}
        <HistoryDialog
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onRequestEditorOpen={requestEditorOpen}
        />
        <ImportSqlDialog
          open={importSqlOpen}
          onOpenChange={setImportSqlOpen}
        />
      </div>
    </TooltipProvider>
  );
}

function RoleBadge({
  canEdit,
  myRole,
}: {
  canEdit: boolean;
  myRole: ReturnType<typeof useSchemaStore.getState>["myRole"];
}) {
  if (!myRole || myRole === "owner") return null;
  const isPublic = myRole === "public-viewer" || myRole === "public-editor";
  const labels: Record<string, string> = {
    editor: "Editor",
    viewer: "Viewer",
    "public-editor": "Public · editor",
    "public-viewer": "Public · viewer",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]",
        isPublic
          ? "border-collab/30 bg-collab/10 text-collab"
          : "border-border bg-surface-2 text-muted-foreground",
      )}
    >
      {isPublic ? <Globe className="size-3" /> : <Eye className="size-3" />}
      {labels[myRole] ?? "Viewer"}
      {!canEdit && " · read-only"}
    </span>
  );
}

function NoProjectBanner() {
  const saveStatus = useSchemaStore((s) => s.saveStatus);
  if (saveStatus !== "no-project") return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-[12px] text-warning">
      <span>
        Your edits aren&apos;t being saved — this schema is missing its
        project link. Reload the page to recover.
      </span>
    </div>
  );
}

function ReadOnlyBanner({
  myRole,
}: {
  myRole: ReturnType<typeof useSchemaStore.getState>["myRole"];
}) {
  const isPublic = myRole === "public-viewer";
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-surface-2/60 px-4 py-1.5 text-[12px] text-muted-foreground">
      <Eye className="size-3.5" />
      <span>
        You&apos;re viewing in read-only mode.
        {isPublic && " Sign in for full access if invited."}
      </span>
    </div>
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

function aiTooltipFor({
  configured,
  user,
  aiOpen,
}: {
  configured: boolean;
  user: boolean;
  aiOpen: boolean;
}): string {
  if (!configured) return "AI generation requires Supabase configuration.";
  if (!user) return "Sign in to use AI generation.";
  return aiOpen ? "Hide AI panel" : "Show AI panel";
}

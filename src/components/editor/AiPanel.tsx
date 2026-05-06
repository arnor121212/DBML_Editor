import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  CornerDownLeft,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { streamDbmlFromPrompt } from "@/lib/ai/textToDbml";
import { useSchemaStore } from "@/store/schemaStore";
import { parseDbml } from "@/lib/dbml/parse";
import { diffSchemas, type SchemaDiff } from "@/lib/dbml/diff";
import { cn } from "@/lib/utils";

type Turn =
  | {
      id: string;
      prompt: string;
      status: "applying";
      streamingText: string;
    }
  | {
      id: string;
      prompt: string;
      status: "review";
      diff: SchemaDiff;
      truncated?: boolean;
    }
  | {
      id: string;
      prompt: string;
      status: "applied";
      diff: SchemaDiff;
      accepted: number;
      rejected: number;
      truncated?: boolean;
    }
  | {
      id: string;
      prompt: string;
      status: "rejected";
      diff: SchemaDiff;
      truncated?: boolean;
    }
  | {
      id: string;
      prompt: string;
      status: "no-op";
      message: string;
    }
  | {
      id: string;
      prompt: string;
      status: "error";
      errorMsg: string;
      truncated?: boolean;
    };

const FRESH_SUGGESTIONS = [
  "A blogging platform with users, posts, comments, and tags",
  "An e-commerce store: customers, products, orders, line items",
  "A SaaS billing model with workspaces, plans, and invoices",
];

const ITERATE_SUGGESTIONS = [
  "Add soft-delete columns where it makes sense",
  "Add an audit log table that references all entities",
  "Add tags with a many-to-many to the main entity",
];

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AiPanel({ onClose }: { onClose: () => void }) {
  const tableCount = useSchemaStore((s) => s.schema.tables.length);
  const startReview = useSchemaStore((s) => s.startReview);
  const applyReview = useSchemaStore((s) => s.applyReview);
  const discardReview = useSchemaStore((s) => s.discardReview);
  const reviewActive = useSchemaStore((s) => s.review !== null);
  const allHunksDecided = useSchemaStore(
    (s) =>
      s.review !== null && s.review.hunks.every((h) => h.status !== "pending"),
  );
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasReviewActiveRef = useRef(reviewActive);

  const suggestions = useMemo(
    () => (tableCount > 0 ? ITERATE_SUGGESTIONS : FRESH_SUGGESTIONS),
    [tableCount],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, loading]);

  // External review-end (e.g., user typed in the editor while a review was
  // active). Mark the active review turn as rejected so the history reads
  // honestly. Our explicit Apply/Discard and the auto-finalize effect both
  // transition the turn before clearing the store so this branch is a no-op
  // for them.
  useEffect(() => {
    if (wasReviewActiveRef.current && !reviewActive) {
      setTurns((all) =>
        all.map((t) =>
          t.status === "review"
            ? {
                id: t.id,
                prompt: t.prompt,
                status: "rejected",
                diff: t.diff,
                truncated: t.truncated,
              }
            : t,
        ),
      );
    }
    wasReviewActiveRef.current = reviewActive;
  }, [reviewActive]);

  // Auto-finalize when every hunk has been individually decided. The
  // running dbml is already in sync (setHunkStatus updates it on each
  // decision), so applyReview here just clears the review state — the
  // editor controller disposes its decorations and inline buttons.
  useEffect(() => {
    if (!allHunksDecided) return;
    const review = useSchemaStore.getState().review;
    if (!review) return;
    const accepted = review.hunks.filter((h) => h.status === "accepted").length;
    const rejected = review.hunks.filter((h) => h.status === "rejected").length;

    setTurns((all) =>
      all.map((t) =>
        t.status === "review"
          ? {
              id: t.id,
              prompt: t.prompt,
              status: "applied",
              diff: t.diff,
              accepted,
              rejected,
              truncated: t.truncated,
            }
          : t,
      ),
    );
    applyReview();
    if (accepted > 0) toast.success("Applied");
  }, [allHunksDecided, applyReview]);

  function updateTurn(id: string, replace: () => Turn) {
    setTurns((all) => all.map((t) => (t.id === id ? replace() : t)));
  }

  /** A new prompt while a review is pending discards the previous one. */
  function discardPendingReview() {
    setTurns((all) =>
      all.map((t) =>
        t.status === "review"
          ? {
              id: t.id,
              prompt: t.prompt,
              status: "rejected",
              diff: t.diff,
              truncated: t.truncated,
            }
          : t,
      ),
    );
    if (useSchemaStore.getState().review) discardReview();
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    discardPendingReview();

    const id = makeId();
    setTurns((t) => [
      ...t,
      { id, prompt: trimmed, status: "applying", streamingText: "" },
    ]);
    setPrompt("");
    setLoading(true);

    const beforeSchema = useSchemaStore.getState().schema;
    const currentDbml = useSchemaStore.getState().dbml;

    const {
      dbml: proposedDbml,
      error,
      meta,
    } = await streamDbmlFromPrompt({
      prompt: trimmed,
      currentDbml: currentDbml || undefined,
      onChunk: (_chunk, accumulated) => {
        setTurns((all) =>
          all.map((t) =>
            t.id === id && t.status === "applying"
              ? { ...t, streamingText: accumulated }
              : t,
          ),
        );
      },
    });
    setLoading(false);

    const truncated = meta?.truncated === true;

    if (error || !proposedDbml) {
      updateTurn(id, () => ({
        id,
        prompt: trimmed,
        status: "error",
        errorMsg: error ?? "Unknown error.",
        truncated,
      }));
      return;
    }

    const parsed = parseDbml(proposedDbml);
    if (!parsed.ok) {
      // A truncated response is the most common reason the parser chokes —
      // call that out so the user knows raising the limit (or splitting the
      // prompt) is the path forward.
      const baseMsg =
        "The model returned DBML that didn't parse: " +
        (parsed.errors[0]?.message ?? "unknown syntax error");
      updateTurn(id, () => ({
        id,
        prompt: trimmed,
        status: "error",
        errorMsg: truncated
          ? baseMsg + " (Response was cut off by the length limit.)"
          : baseMsg,
        truncated,
      }));
      return;
    }

    const diff = diffSchemas(beforeSchema, parsed.schema);
    if (diff.isEmpty) {
      updateTurn(id, () => ({
        id,
        prompt: trimmed,
        status: "no-op",
        message: "No changes needed — the schema already matches.",
      }));
      return;
    }

    const ok = startReview(proposedDbml);
    if (!ok) {
      updateTurn(id, () => ({
        id,
        prompt: trimmed,
        status: "no-op",
        message: "No line-level changes detected.",
      }));
      return;
    }

    updateTurn(id, () => ({
      id,
      prompt: trimmed,
      status: "review",
      diff,
      truncated,
    }));
  }

  function accept(turnId: string) {
    // Read from the store before the setTurns updater runs — React 18 defers
    // updater execution, so we can't rely on a closure-captured boolean.
    const review = useSchemaStore.getState().review;
    if (!review) return;
    // Pending hunks default to "accepted" on Apply (matches applyReview).
    const accepted = review.hunks.filter(
      (h) => h.status === "accepted" || h.status === "pending",
    ).length;
    const rejected = review.hunks.filter((h) => h.status === "rejected").length;

    setTurns((all) =>
      all.map((t) =>
        t.id === turnId && t.status === "review"
          ? {
              id: t.id,
              prompt: t.prompt,
              status: "applied",
              diff: t.diff,
              accepted,
              rejected,
              truncated: t.truncated,
            }
          : t,
      ),
    );
    applyReview();
    toast.success("Applied");
  }

  function reject(turnId: string) {
    const hadReview = useSchemaStore.getState().review !== null;
    setTurns((all) =>
      all.map((t) =>
        t.id === turnId && t.status === "review"
          ? {
              id: t.id,
              prompt: t.prompt,
              status: "rejected",
              diff: t.diff,
              truncated: t.truncated,
            }
          : t,
      ),
    );
    if (hadReview) discardReview();
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-surface">
      {/* Panel header — gradient hairline marks this as the AI surface */}
      <div className="relative flex h-9 shrink-0 items-center justify-between px-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-primary) 70%, transparent) 30%, color-mix(in oklab, var(--color-collab) 70%, transparent) 70%, transparent)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-primary">
            <SchemaMark />
          </span>
          <span className="font-medium tracking-tight text-foreground">
            assist
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">iterate the schema</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI panel"
          className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* History / empty state */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {turns.length === 0 ? (
          <EmptyState
            tableCount={tableCount}
            suggestions={suggestions}
            disabled={loading}
            onPick={(s) => void submit(s)}
          />
        ) : (
          <div className="flex flex-col gap-3 px-3 py-3">
            {turns.map((t) => (
              <TurnCard
                key={t.id}
                turn={t}
                onAccept={() => accept(t.id)}
                onReject={() => reject(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-surface-2/40 p-2">
        <div className="group/composer relative rounded-lg border border-border bg-surface transition-colors focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_15%,transparent)]">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(prompt);
              }
            }}
            disabled={loading}
            placeholder={
              tableCount > 0
                ? "Describe a change…"
                : "Describe the schema you want…"
            }
            rows={2}
            className="block w-full resize-none rounded-lg bg-transparent px-3 py-2 pr-10 text-[13px] leading-5 text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void submit(prompt)}
            disabled={!prompt.trim() || loading}
            aria-label="Send"
            className={cn(
              "absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-md text-primary-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_20%,transparent)_inset] transition-all",
              !prompt.trim() || loading
                ? "bg-surface-2 text-muted-foreground"
                : "bg-primary hover:opacity-90 active:translate-y-px",
            )}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" /> send
          </span>
          <span>shift+↵ for newline</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  tableCount,
  suggestions,
  disabled,
  onPick,
}: {
  tableCount: number;
  suggestions: string[];
  disabled: boolean;
  onPick: (s: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-between gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <SchemaIllustration />
        <div className="max-w-[20rem]">
          <h3 className="text-[13.5px] font-semibold tracking-tight text-foreground">
            {tableCount > 0 ? "Iterate on your schema" : "Sketch a database"}
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {tableCount > 0
              ? "Describe a change in plain English. You'll review what's proposed before it's applied."
              : "Plain-English description in, valid DBML out. Nothing is applied until you accept."}
          </p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-1.5">
        <span className="px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
          Try
        </span>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="group/sug relative overflow-hidden rounded-md border border-border bg-surface-2/50 px-3 py-2 text-left text-[12px] text-foreground/85 transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="leading-snug">{s}</span>
              <span className="shrink-0 translate-x-[-4px] text-primary opacity-0 transition-all group-hover/sug:translate-x-0 group-hover/sug:opacity-100">
                →
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnCard({
  turn,
  onAccept,
  onReject,
}: {
  turn: Turn;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-lg rounded-tr-sm border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-snug text-foreground shadow-sm">
          {turn.prompt}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-border bg-background/40">
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-0 h-full w-[2px]",
            turn.status === "applying" && "animate-pulse bg-primary/50",
            turn.status === "review" &&
              "bg-gradient-to-b from-primary via-primary to-collab",
            turn.status === "applied" &&
              "bg-gradient-to-b from-success via-success to-success/40",
            turn.status === "rejected" && "bg-muted-foreground/30",
            turn.status === "no-op" && "bg-muted-foreground/30",
            turn.status === "error" && "bg-destructive",
          )}
        />
        <div className="px-3 py-2.5">
          {turn.status === "applying" && (
            <ApplyingBody streamingText={turn.streamingText} />
          )}
          {turn.status === "review" && (
            <ReviewBody
              diff={turn.diff}
              onAccept={onAccept}
              onReject={onReject}
            />
          )}
          {turn.status === "applied" && (
            <div>
              <StatusLabel tone="applied" />
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                <span className="text-success">{turn.accepted}</span> accepted
                {", "}
                <span className="text-destructive">{turn.rejected}</span> rejected
              </p>
              <div className="mt-1.5">
                <DiffSummary diff={turn.diff} />
              </div>
            </div>
          )}
          {turn.status === "rejected" && (
            <div>
              <StatusLabel tone="rejected" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Discarded {turn.diff.totalChanges} proposed{" "}
                {turn.diff.totalChanges === 1 ? "change" : "changes"}.
              </p>
            </div>
          )}
          {turn.status === "no-op" && (
            <div>
              <StatusLabel tone="muted" label="no changes" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {turn.message}
              </p>
            </div>
          )}
          {turn.status === "error" && (
            <div>
              <StatusLabel tone="error" />
              <p className="mt-1 text-[12px] text-muted-foreground">
                {turn.errorMsg}
              </p>
            </div>
          )}
          {turn.status !== "applying" &&
            turn.status !== "no-op" &&
            turn.truncated && <TruncatedBanner />}
        </div>
      </div>
    </div>
  );
}

function ApplyingBody({ streamingText }: { streamingText: string }) {
  // Show only the tail; keep the visual area bounded.
  const TAIL = 700;
  const truncated = streamingText.length > TAIL;
  const tail = truncated ? streamingText.slice(-TAIL) : streamingText;

  return (
    <div>
      <div className="flex items-center gap-2 text-[10.5px]">
        <span className="relative inline-flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
        <span className="font-medium uppercase tracking-[0.1em] text-primary">
          streaming
        </span>
        {streamingText.length > 0 && (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
            {streamingText.length.toLocaleString()} chars
          </span>
        )}
      </div>
      {streamingText.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          waiting for first token…
        </p>
      ) : (
        <div className="mt-2 rounded border border-border/70 bg-background/70 p-2">
          <pre className="max-h-40 overflow-hidden whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.45] text-foreground/80">
            <code>
              {truncated && (
                <span className="text-muted-foreground">…</span>
              )}
              {tail}
              <Caret />
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-[2px] -mb-[2px] bg-primary align-middle"
      style={{ animation: "schemasync-caret 1s steps(2) infinite" }}
    />
  );
}

function ReviewBody({
  diff,
  onAccept,
  onReject,
}: {
  diff: SchemaDiff;
  onAccept: () => void;
  onReject: () => void;
}) {
  const review = useSchemaStore((s) => s.review);

  // Hunk progress — drives the "1 accepted · 0 rejected · 2 pending" line.
  const counts = useMemo(() => {
    const c = { pending: 0, accepted: 0, rejected: 0 };
    if (review) {
      for (const h of review.hunks) c[h.status]++;
    }
    return c;
  }, [review]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <StatusLabel tone="review" />
        <span className="text-[10px] text-muted-foreground">
          {diff.totalChanges}{" "}
          {diff.totalChanges === 1 ? "change" : "changes"}
        </span>
      </div>
      {review && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] text-muted-foreground">
          <span>
            {review.hunks.length}{" "}
            {review.hunks.length === 1 ? "hunk" : "hunks"}
          </span>
          <span className="opacity-50">·</span>
          {counts.accepted > 0 && (
            <span className="text-success">
              {counts.accepted} accepted
            </span>
          )}
          {counts.rejected > 0 && (
            <span className="text-destructive">
              {counts.rejected} rejected
            </span>
          )}
          {counts.pending > 0 && (
            <span className="text-primary">{counts.pending} pending</span>
          )}
        </div>
      )}
      <div className="mt-2">
        <DiffSummary diff={diff} />
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
        Use the inline{" "}
        <span className="font-mono text-foreground/85">Accept</span>/
        <span className="font-mono text-foreground/85">Reject</span> buttons in
        the editor to decide each hunk, or use{" "}
        <span className="text-foreground/85">Apply</span> /{" "}
        <span className="text-foreground/85">Discard</span> below to commit
        everything in one go.
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_20%,transparent)_inset] transition-opacity hover:opacity-90 active:translate-y-px"
        >
          <Check className="size-3.5" /> Apply
        </button>
        <button
          type="button"
          onClick={onReject}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-foreground/85 transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-3.5" /> Discard
        </button>
      </div>
    </div>
  );
}

function DiffSummary({ diff }: { diff: SchemaDiff }) {
  return (
    <div className="flex flex-col gap-1.5">
      {diff.tablesAdded.length > 0 && (
        <DiffRow tone="add" label="new tables" items={diff.tablesAdded} />
      )}
      {diff.tablesRemoved.length > 0 && (
        <DiffRow
          tone="remove"
          label="removed tables"
          items={diff.tablesRemoved}
        />
      )}
      {diff.tablesModified.map((t) => (
        <ModifiedTableRow key={t.name} table={t} />
      ))}
      {(diff.refsAddedCount > 0 || diff.refsRemovedCount > 0) && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.06em]">refs</span>
          {diff.refsAddedCount > 0 && (
            <span className="font-mono text-primary">
              +{diff.refsAddedCount}
            </span>
          )}
          {diff.refsRemovedCount > 0 && (
            <span className="font-mono text-destructive">
              −{diff.refsRemovedCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ModifiedTableRow({
  table,
}: {
  table: import("@/lib/dbml/diff").TableDiff;
}) {
  return (
    <div className="rounded border border-border/70 bg-surface-2/40 px-2 py-1.5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.06em]">modified</span>
        <span className="font-mono text-[11.5px] text-foreground">
          {table.name}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {table.columnsAdded.map((c) => (
          <Pill key={`a-${c}`} tone="add">
            {c}
          </Pill>
        ))}
        {table.columnsRemoved.map((c) => (
          <Pill key={`r-${c}`} tone="remove">
            {c}
          </Pill>
        ))}
        {table.columnsChanged.map((c) => (
          <Pill key={`c-${c.name}`} tone="change" title={changeTitle(c)}>
            {c.name}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function changeTitle(c: import("@/lib/dbml/diff").ColumnChange): string {
  return `${c.before.type} ${c.before.flags.join(" ")} → ${c.after.type} ${c.after.flags.join(" ")}`.trim();
}

function DiffRow({
  tone,
  label,
  items,
}: {
  tone: "add" | "remove";
  label: string;
  items: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      {items.map((name) => (
        <Pill key={name} tone={tone}>
          {name}
        </Pill>
      ))}
    </div>
  );
}

function Pill({
  tone,
  children,
  title,
}: {
  tone: "add" | "remove" | "change";
  children: React.ReactNode;
  title?: string;
}) {
  const styles = {
    add: "border-primary/25 bg-primary/[0.08] text-primary",
    remove: "border-destructive/25 bg-destructive/[0.08] text-destructive",
    change: "border-amber-500/30 bg-amber-500/[0.08] text-amber-300",
  } as const;
  const sigils = { add: "+", remove: "−", change: "~" } as const;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px]",
        styles[tone],
      )}
    >
      <span className="opacity-60">{sigils[tone]}</span>
      {children}
    </span>
  );
}

function StatusLabel({
  tone,
  label,
}: {
  tone: "review" | "applied" | "rejected" | "muted" | "error";
  label?: string;
}) {
  const map = {
    review: { text: label ?? "pending review", cls: "text-primary" },
    applied: { text: label ?? "applied", cls: "text-success" },
    rejected: { text: label ?? "rejected", cls: "text-muted-foreground" },
    muted: { text: label ?? "noted", cls: "text-muted-foreground" },
    error: { text: label ?? "error", cls: "text-destructive" },
  } as const;
  const m = map[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.1em]",
        m.cls,
      )}
    >
      {tone === "applied" && <Check className="size-3" />}
      {m.text}
    </span>
  );
}

function TruncatedBanner() {
  return (
    <div
      role="status"
      className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div>
        <span className="font-medium">Response was truncated.</span>{" "}
        <span className="text-amber-200/80">
          The model hit the length limit (12 000 tokens). Output may be
          incomplete — try a smaller prompt or split the work into iterations.
        </span>
      </div>
    </div>
  );
}

/* ---------- Custom marks (replace the AI-cliché sparkle/orb) ---------- */

function SchemaMark() {
  // Two stacked "table" bars — small, monochrome, on-brand with the AppHeader
  // logo. Color is inherited from the parent's `text-*` class.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.25"
        y="2"
        width="11.5"
        height="3.25"
        rx="0.75"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <rect
        x="1.25"
        y="8.75"
        width="11.5"
        height="3.25"
        rx="0.75"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.55"
      />
    </svg>
  );
}

function SchemaIllustration() {
  // A small diagram: two tables connected by a relationship.
  // No glow, no sparkles — visualizes the actual product.
  return (
    <svg
      width="124"
      height="68"
      viewBox="0 0 124 68"
      fill="none"
      aria-hidden="true"
    >
      {/* Left table */}
      <g className="text-foreground/60">
        <rect
          x="2"
          y="6"
          width="42"
          height="56"
          rx="3"
          stroke="currentColor"
          strokeWidth="1"
          fill="color-mix(in oklab, var(--color-surface-2) 60%, transparent)"
        />
      </g>
      <rect
        x="2"
        y="6"
        width="42"
        height="11"
        rx="3"
        className="fill-primary/85"
      />
      <g className="text-muted-foreground/45">
        <line x1="7" y1="26" x2="39" y2="26" stroke="currentColor" strokeWidth="0.8" />
        <line x1="7" y1="36" x2="33" y2="36" stroke="currentColor" strokeWidth="0.8" />
        <line x1="7" y1="46" x2="37" y2="46" stroke="currentColor" strokeWidth="0.8" />
        <line x1="7" y1="56" x2="29" y2="56" stroke="currentColor" strokeWidth="0.8" />
      </g>

      {/* Right table */}
      <g className="text-foreground/60">
        <rect
          x="80"
          y="14"
          width="42"
          height="48"
          rx="3"
          stroke="currentColor"
          strokeWidth="1"
          fill="color-mix(in oklab, var(--color-surface-2) 60%, transparent)"
        />
      </g>
      <rect
        x="80"
        y="14"
        width="42"
        height="11"
        rx="3"
        className="fill-collab/85"
      />
      <g className="text-muted-foreground/45">
        <line x1="85" y1="34" x2="117" y2="34" stroke="currentColor" strokeWidth="0.8" />
        <line x1="85" y1="44" x2="111" y2="44" stroke="currentColor" strokeWidth="0.8" />
        <line x1="85" y1="54" x2="115" y2="54" stroke="currentColor" strokeWidth="0.8" />
      </g>

      {/* Relationship line */}
      <g className="text-primary/70">
        <path
          d="M44 36 C 54 36, 70 38, 80 38"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2.5 2.5"
          fill="none"
        />
        <circle cx="44" cy="36" r="1.6" fill="currentColor" />
        <circle cx="80" cy="38" r="1.6" fill="currentColor" />
      </g>
    </svg>
  );
}

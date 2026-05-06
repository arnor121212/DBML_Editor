# SchemaSync — Claude context

A collaborative DBML visualizer. You write DBML on the left, get an interactive
diagram on the right. Built as a local-first SPA in Vite + React; the realtime
collaboration layer is planned, not built (see "Next steps" below).

## Run

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm run typecheck    # tsc -b --noEmit
node scripts/smoke-parse.mjs   # parse the e-commerce sample, print SQL exports
```

## Stack

- **Vite 6** + **React 18** + **TypeScript** (strict)
- **Tailwind v4** via `@tailwindcss/vite` plugin (uses `@theme inline` in CSS,
  no `tailwind.config.js`). Tailwind animations come from `tw-animate-css`.
- **shadcn/ui** ("new-york" style) — components live in `src/components/ui/`,
  written by hand against Radix primitives, not via the CLI
- **@xyflow/react v12** for the diagram (formerly React Flow)
- **@monaco-editor/react** + **monaco-editor** — CDN-loaded by default
- **@dbml/core** for DBML parsing and SQL export (Postgres / MySQL / MSSQL)
- **dagre** for auto-layout
- **html-to-image** for PNG/SVG export
- **idb** for IndexedDB
- **zustand** for app state
- **react-router-dom v6**
- **sonner** for toasts

## Architecture

```
src/
├─ main.tsx, App.tsx           # router + ThemeProvider + TooltipProvider + Toaster
├─ routes/
│  ├─ Dashboard.tsx            # /         — schema cards, CRUD
│  └─ SchemaEditor.tsx         # /s/:id    — split editor (lazy-loaded → Monaco isn't pulled into dashboard chunk)
├─ components/
│  ├─ ui/                      # shadcn primitives (Button, Dialog, DropdownMenu, …)
│  ├─ layout/                  # AppHeader, ThemeToggle, SplitPane
│  ├─ editor/                  # DBMLEditor (Monaco), dbmlLanguage (Monarch + themes), ErrorBar
│  ├─ diagram/                 # DiagramCanvas, TableNode, RelationEdge, EdgeMarkers, DiagramToolbar, EmptyDiagram
│  └─ dashboard/               # SchemaCard, NewSchemaDialog, RenameDialog, DeleteConfirmDialog
├─ lib/
│  ├─ dbml/                    # parse, toFlow, layout (dagre), examples, palette, typeColor, types
│  ├─ exports/                 # image (PNG/SVG via html-to-image), sql (via @dbml/core exporter)
│  ├─ storage/schemas.ts       # IndexedDB CRUD
│  ├─ theme.tsx, utils.ts
├─ store/schemaStore.ts        # Zustand: dbml, parsed schema, errors, nodes/edges, positions, hover, createdAt
├─ styles/globals.css          # Tailwind v4 + design tokens (light/dark) + React Flow + Monaco overrides
└─ scripts/smoke-parse.mjs     # Node-side smoke test for the parser
```

### Data flow (editor → diagram)

1. User types in Monaco → `DBMLEditor.onChange` updates `lastSyncedRef` and calls a 180ms-debounced `setDbml(text)`.
2. `schemaStore.setDbml`: parse via `@dbml/core` → on success, normalize via `lib/dbml/parse.ts` → build flow via `toFlow()` → preserve all saved positions, place new tables with `placeNewTables()` → persist to IndexedDB.
3. On parse error, keep the *last good* schema (so the diagram doesn't flicker) and push markers into Monaco via `setModelMarkers`.

### State shape (Zustand)

The store owns parsed-schema state, the React-Flow nodes/edges arrays, the
`positions: Record<tableId, {x, y}>` map (the source of truth for layout), the
hovered column key, and `createdAt` (cached so `persist()` is write-only — no
read-then-write race).

## Conventions and gotchas

These caught bugs during the initial build; they're worth knowing before
touching the corresponding files.

### DBML parser endpoint orientation

`@dbml/core` returns ref endpoints in `[referenced, referencing]` order — i.e.
the "one" side first, the "many" (FK-bearing) side second. `lib/dbml/parse.ts`
swaps them so **`source` = FK column, `target` = referenced column**. Don't
"fix" this without re-checking edge orientation in the diagram.

### Errors from the parser

The parser throws `CompilerError { diags: [{ message, location: { start, end } }] }`
on syntax errors (other shapes possible). `extractErrors()` in `parse.ts` handles
the common shapes; if you encounter a new one in the wild, extend that function.

### React Flow v12 node-data type constraint

`Node<T>` requires `T extends Record<string, unknown>`. `TableModel` and
`RelationEdgeData` both carry `[key: string]: unknown` index signatures so they
satisfy the constraint. Don't remove those signatures.

### Handle positioning inside `TableNode`

Each column row is `position: relative` with two invisible 1×1 `<Handle>`
children. **Do not set an explicit `top` style on the handles.** React Flow's
default `top: 50%` resolves to row-center automatically. An earlier version
computed `top` as an offset from the node root — it broke for any table with
more than two columns.

### `fitView` is imperative, never a prop

`<ReactFlow fitView />` re-runs on every render, including every keystroke,
which resets the user's pan/zoom. `DiagramCanvas` calls `fitView()` once per
schema load (keyed by `schemaId` in a ref-guarded `useEffect`).

### Monaco + controlled value

`@monaco-editor/react`'s `value` prop calls `model.setValue()` on every change,
which **resets the cursor to the top**. We use `defaultValue` + a `lastSyncedRef`
that tracks both user edits (via `onChange`) and external syncs (via the
`useEffect` watching `dbml`). Only external changes (e.g. "Load example
schema") trigger an imperative `setValue`. Don't switch to `value`.

### Positions never get wiped

When the user adds a new table to the DBML, we run `placeNewTables()`, which
parks unplaced tables to the right of the existing cluster but **never moves
already-placed tables**. Auto-layout (`applyAutoLayout`) re-arranges everything
and is opt-in (toolbar button only).

### Color palette

`lib/dbml/palette.ts` is the single source of truth for table-header hues
(deterministic from table name). `TableNode` and the MiniMap dot color both
import from here — don't inline a copy.

### Persistence

`schemaStore.persist()` is fire-and-forget on every debounce tick, drag-end,
and rename. It writes the full record (no merge), so make sure `s.createdAt`
is correct in the store before calling it. `loadRecord` populates it from the
record; `setDbml`/`setName`/`updatePosition` don't touch it.

### Bundle splitting

`SchemaEditor` is lazy-loaded in `App.tsx` so the dashboard chunk is ~380KB
gzipped while the editor chunk (with Monaco) is ~1.8MB gzipped. Keep it that
way — don't import anything from `routes/SchemaEditor` from `Dashboard`.

## Theming

`src/lib/theme.tsx` provides `<ThemeProvider>` (default `"dark"`) and
`useTheme()`. The `<html>` element gets `class="light"` or `class="dark"`,
which the Tailwind `dark` variant (`@custom-variant dark`) hooks into. Theme
preference is stored in `localStorage` under `schemasync.theme`. Monaco theme
syncs via `defineTheme` (`schemasync-dark` / `schemasync-light`).

## Storage

IndexedDB DB `schemasync`, store `schemas`, key `id`. Record shape:

```ts
{ id, name, dbml, positions: Record<tableId, {x,y}>, createdAt, updatedAt }
```

If you change the shape, bump `DB_VERSION` in `lib/storage/schemas.ts` and add
a migration in `upgrade()`. There's no migration framework yet — keep it
simple.

## Next steps

The feature spec called for collaboration and cloud persistence; v1 stops
short of those. Order of operations for the next session:

1. **Supabase auth** (email + Google OAuth)
   - Wrap routes that need auth in a guard that redirects unauthenticated users to a `/login` route
   - User row in Supabase, Google OAuth via Supabase provider
2. **Cloud schema CRUD**
   - Postgres `schemas` table mirroring the local shape, plus `owner_id` and `collaborators` (jsonb or join table)
   - Replace `lib/storage/schemas.ts` callers with a Supabase-backed adapter (keep the same interface so the UI doesn't change)
   - Migration path for existing local schemas: on first sign-in, offer to upload local schemas
3. **Sharing**
   - Shareable link per schema (`/s/:id` already works; add `/s/:id?role=view` style)
   - Invite by email with `view` / `edit` permissions; row-level security on the Postgres table
4. **Realtime collab — Yjs + y-supabase** (user picked this over LWW)
   - Wrap the DBML text in a `Y.Text` ↔ Monaco binding (`y-monaco`)
   - Wrap node positions in a `Y.Map` ↔ React Flow binding
   - Presence: cursor positions in DBML editor, mouse positions on canvas, name+color per user (use `awareness`)
   - The `y-supabase` provider syncs via Realtime channels
5. **Presence UI**
   - Avatar stack in `AppHeader` for users currently viewing the schema (read from `awareness.getStates()`)
   - Live cursors on the canvas — small triangle + name pill, color from `awareness`
6. **Version history**
   - On a 60s interval (or N edits since last snapshot), write a snapshot row
   - Sidebar drawer listing snapshots with relative time + restore button
   - Restore = `loadRecord` from snapshot; current state should optionally be auto-snapshotted before overwrite

### Smaller polish items, deferred

- Manual chunk-split Monaco into its own vendor chunk so the editor route
  hot-reloads faster and Monaco caches across deploys
- Replace the CDN-loaded fonts with self-hosted (`@fontsource/inter`,
  `@fontsource/jetbrains-mono`) for offline use and to avoid the FOUT
- Add `sonner.tsx` keyboard-accessible cancel for delete confirmations
- The `hoveredColumnKey` highlight is per-column, but `RelationEdge` only
  matches edges whose source/target column equals the hovered column — for
  composite refs, all FK columns of the same `Ref` should highlight together
- The auto-layout button doesn't preserve the relative direction users have
  established — consider an "auto-layout new tables only" mode

## Things to avoid

- Don't add a `tailwind.config.js` — Tailwind v4 reads tokens from the CSS via
  `@theme inline` and the `@tailwindcss/vite` plugin
- Don't reach for `tailwindcss-animate` (v3); we use `tw-animate-css` (v4)
- Don't introduce a separate types package; the schema model is small enough
  that `lib/dbml/types.ts` is the right home
- Don't connect to a backend in the dashboard route's chunk — keep the bundle
  split clean
- Don't change the IndexedDB store name without a versioned migration; users
  may have schemas saved locally

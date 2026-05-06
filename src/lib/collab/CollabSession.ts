import * as Y from "yjs";
import { SupabaseProvider, type ProviderStatus } from "./SupabaseProvider";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Positions } from "@/lib/dbml/toFlow";

const LOCAL_ORIGIN = Symbol("collab:local");

/**
 * Per-schema collaboration session. Wraps a Y.Doc (with `dbml: Y.Text` and
 * `positions: Y.Map`), a SupabaseProvider, and helpers for the rest of the
 * app to read/write Y values without knowing they're collaborative.
 *
 * One session per editor mount; destroy on unmount.
 */
export class CollabSession {
  readonly doc = new Y.Doc();
  readonly text: Y.Text;
  readonly positions: Y.Map<{ x: number; y: number }>;
  readonly provider: SupabaseProvider;
  readonly schemaId: string;
  /** True once we believe the doc is in sync (peer or seed). */
  ready = false;
  private readyListeners = new Set<() => void>();

  constructor(schemaId: string) {
    if (!isSupabaseConfigured) {
      throw new Error("CollabSession requires Supabase to be configured.");
    }
    this.schemaId = schemaId;
    this.text = this.doc.getText("dbml");
    this.positions = this.doc.getMap("positions");
    this.provider = new SupabaseProvider(this.doc, schemaId);
    this.provider.onSync(() => {
      this.ready = true;
      for (const fn of this.readyListeners) fn();
    });
  }

  /**
   * Replace the contents of `Y.Text` and `Y.Map` with seed values from the
   * canonical DB record. Safe to call from multiple peers in the rare
   * dual-joiner case: if any client (us or anyone else) has already written
   * to the doc, we skip seeding so we don't duplicate content.
   */
  seed(args: { dbml: string; positions: Positions }) {
    this.doc.transact(() => {
      // `store.clients` lists every client whose ops have been applied to this
      // doc. If non-empty, the doc is no longer a virgin — bail.
      if (this.doc.store.clients.size > 0) return;
      if (args.dbml.length > 0) this.text.insert(0, args.dbml);
      for (const [id, pos] of Object.entries(args.positions)) {
        this.positions.set(id, pos);
      }
    }, LOCAL_ORIGIN);
  }

  /** Replace Y.Text with `text`. Used by external setters (e.g. "Load example"). */
  setText(text: string) {
    this.doc.transact(() => {
      this.text.delete(0, this.text.length);
      if (text) this.text.insert(0, text);
    }, LOCAL_ORIGIN);
  }

  /** Update a single table position in the shared map. */
  setPosition(id: string, pos: { x: number; y: number }) {
    this.doc.transact(() => {
      this.positions.set(id, pos);
    }, LOCAL_ORIGIN);
  }

  /** Bulk-update positions (auto-layout, restore, etc.). */
  setAllPositions(next: Positions) {
    this.doc.transact(() => {
      for (const k of Array.from(this.positions.keys())) {
        if (!(k in next)) this.positions.delete(k);
      }
      for (const [id, pos] of Object.entries(next)) {
        this.positions.set(id, pos);
      }
    }, LOCAL_ORIGIN);
  }

  /** Read positions as a plain object. */
  getPositions(): Positions {
    const out: Positions = {};
    for (const [k, v] of this.positions.entries()) out[k] = v;
    return out;
  }

  /** Subscribe to Y.Text content changes, both local and remote. */
  onTextChange(fn: (text: string) => void): () => void {
    const handler = () => fn(this.text.toString());
    this.text.observe(handler);
    return () => this.text.unobserve(handler);
  }

  /** Subscribe to Y.Map changes — fired for any local or remote position update. */
  onPositionsChange(fn: (positions: Positions) => void): () => void {
    const handler = () => fn(this.getPositions());
    this.positions.observe(handler);
    return () => this.positions.unobserve(handler);
  }

  onReady(fn: () => void): () => void {
    this.readyListeners.add(fn);
    if (this.ready) fn();
    return () => this.readyListeners.delete(fn);
  }

  onStatus(fn: (s: ProviderStatus) => void): () => void {
    return this.provider.onStatus(fn);
  }

  /** True if the local origin matches this session — used by store update guards. */
  isLocalOrigin(origin: unknown): boolean {
    return origin === LOCAL_ORIGIN;
  }

  destroy() {
    this.provider.destroy();
    this.doc.destroy();
  }
}

/**
 * Module-level registry so the same schemaId always returns the same session
 * across components. Sessions are destroyed when the last consumer releases.
 */
const sessions = new Map<string, { session: CollabSession; refCount: number }>();

export function acquireSession(schemaId: string): CollabSession | null {
  if (!supabase) return null;
  const existing = sessions.get(schemaId);
  if (existing) {
    existing.refCount += 1;
    return existing.session;
  }
  const s = new CollabSession(schemaId);
  sessions.set(schemaId, { session: s, refCount: 1 });
  return s;
}

export function releaseSession(schemaId: string) {
  const entry = sessions.get(schemaId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    entry.session.destroy();
    sessions.delete(schemaId);
  }
}

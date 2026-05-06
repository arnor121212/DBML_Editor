import * as Y from "yjs";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

/**
 * Custom Yjs provider over a Supabase Realtime broadcast channel.
 *
 * Wire protocol — events on `schema:<id>`:
 *   "doc-update"          { update: base64 }   — Yjs document delta
 *   "doc-state-request"   {}                   — new peer asking for state
 *   "doc-state-response"  { update: base64 }   — full Y.Doc state in response
 *   "awareness-update"    { update: base64 }   — y-protocols awareness diff
 */

const STATE_WAIT_MS = 1200;

export type ProviderStatus = "connecting" | "connected" | "disconnected";

export class SupabaseProvider {
  doc: Y.Doc;
  awareness: Awareness;
  channel: RealtimeChannel;
  /** True once we believe the doc reflects either a peer's state or our own seed. */
  synced = false;
  status: ProviderStatus = "connecting";
  private statusListeners = new Set<(s: ProviderStatus) => void>();
  private syncListeners = new Set<() => void>();
  private destroyed = false;
  private receivedPeerStateOnce = false;

  constructor(doc: Y.Doc, schemaId: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    this.doc = doc;
    this.awareness = new Awareness(doc);

    this.channel = supabase.channel(`schema:${schemaId}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    // Incoming wire events.
    this.channel.on("broadcast", { event: "doc-update" }, ({ payload }) => {
      this.applyDocPayload(payload);
    });
    this.channel.on("broadcast", { event: "doc-state-response" }, ({ payload }) => {
      this.applyDocPayload(payload);
    });
    this.channel.on("broadcast", { event: "doc-state-request" }, () => {
      // Reply with our full state. Cheap for small docs; SchemaSync DBML
      // is typically a few KB.
      const update = Y.encodeStateAsUpdate(this.doc);
      void this.channel.send({
        type: "broadcast",
        event: "doc-state-response",
        payload: { update: bytesToB64(update) },
      });
    });
    this.channel.on("broadcast", { event: "awareness-update" }, ({ payload }) => {
      try {
        const update = b64ToBytes(payload.update as string);
        applyAwarenessUpdate(this.awareness, update, this);
      } catch {
        /* malformed payload */
      }
    });

    // Outgoing — local doc edits go on the wire.
    this.docUpdateHandler = this.docUpdateHandler.bind(this);
    this.awarenessHandler = this.awarenessHandler.bind(this);
    doc.on("update", this.docUpdateHandler);
    this.awareness.on("update", this.awarenessHandler);

    void this.channel.subscribe(async (status) => {
      if (this.destroyed) return;
      if (status === "SUBSCRIBED") {
        this.setStatus("connected");
        // Ask peers for current state. If anyone responds we'll switch on
        // sync immediately; otherwise we mark synced after the wait window
        // so the caller knows to seed from the DB instead.
        await this.channel.send({
          type: "broadcast",
          event: "doc-state-request",
          payload: {},
        });
        window.setTimeout(() => this.markSyncedIfNotAlready(), STATE_WAIT_MS);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        this.setStatus("disconnected");
      }
    });
  }

  private applyDocPayload(payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    const p = payload as { update?: string };
    if (!p.update) return;
    try {
      const update = b64ToBytes(p.update);
      Y.applyUpdate(this.doc, update, this);
      this.receivedPeerStateOnce = true;
      this.markSyncedIfNotAlready();
    } catch {
      /* malformed update */
    }
  }

  private docUpdateHandler(update: Uint8Array, origin: unknown) {
    if (origin === this) return; // came from a peer; don't echo
    void this.channel.send({
      type: "broadcast",
      event: "doc-update",
      payload: { update: bytesToB64(update) },
    });
  }

  private awarenessHandler(
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) {
    if (origin === this) return;
    const changedClients = added.concat(updated, removed);
    const update = encodeAwarenessUpdate(this.awareness, changedClients);
    void this.channel.send({
      type: "broadcast",
      event: "awareness-update",
      payload: { update: bytesToB64(update) },
    });
  }

  private markSyncedIfNotAlready() {
    if (this.synced) return;
    this.synced = true;
    for (const fn of this.syncListeners) fn();
  }

  /** True if we received state from a peer during init. The caller can use
   *  this signal to skip seeding the doc from the DB. */
  get sawPeer(): boolean {
    return this.receivedPeerStateOnce;
  }

  onStatus(fn: (s: ProviderStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  onSync(fn: () => void): () => void {
    this.syncListeners.add(fn);
    if (this.synced) fn();
    return () => this.syncListeners.delete(fn);
  }

  private setStatus(s: ProviderStatus) {
    this.status = s;
    for (const fn of this.statusListeners) fn(s);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.doc.off("update", this.docUpdateHandler);
    this.awareness.off("update", this.awarenessHandler);
    this.awareness.destroy();
    void supabase?.removeChannel(this.channel);
  }
}

// ---------------------------------------------------------------------------
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

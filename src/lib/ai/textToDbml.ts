import { supabase } from "@/lib/supabase/client";

export interface StreamDbmlOptions {
  prompt: string;
  currentDbml?: string;
  /** Called as the model emits content. `accumulated` is everything seen so far. */
  onChunk?: (chunk: string, accumulated: string) => void;
  signal?: AbortSignal;
}

export interface StreamDbmlMeta {
  /** True when the model's response was cut off by max_tokens. */
  truncated?: boolean;
}

export interface StreamDbmlResult {
  dbml: string | null;
  error: string | null;
  meta?: StreamDbmlMeta;
}

/** Sentinel the Edge Function appends after content when finish_reason is
 *  "length". Must match supabase/functions/text-to-dbml/index.ts. */
const META_MARKER = "\n[[__SCHEMASYNC_META__]]\n";

/**
 * Streams the `text-to-dbml` Edge Function. We bypass the Supabase JS client's
 * `functions.invoke` (which buffers the whole response) and use raw `fetch`
 * with the user's JWT, so we can read the body as a stream.
 *
 * The function rejects anonymous calls (verify_jwt=true), so this requires a
 * signed-in user.
 */
export async function streamDbmlFromPrompt({
  prompt,
  currentDbml,
  onChunk,
  signal,
}: StreamDbmlOptions): Promise<StreamDbmlResult> {
  if (!supabase) {
    return { dbml: null, error: "Sign-in is not configured for this build." };
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { dbml: null, error: "Supabase URL or anon key is missing." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { dbml: null, error: "Sign in required." };
  }

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/text-to-dbml`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ prompt, currentDbml }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { dbml: null, error: "Cancelled." };
    }
    return { dbml: null, error: `Network error: ${(err as Error).message}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) msg = parsed.error;
    } catch {
      if (text) msg = text.slice(0, 500);
    }
    return { dbml: null, error: msg };
  }

  if (!res.body) {
    return { dbml: null, error: "No response body." };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // `accumulated` always reflects content visible to the user (pre-marker).
  // Once the marker appears, we stop appending visible content and start
  // collecting metadata JSON.
  let accumulated = "";
  let metaJson = "";
  let inMeta = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.length === 0) continue;

      if (inMeta) {
        metaJson += chunk;
        continue;
      }

      // Marker may straddle chunk boundaries — search the combined buffer.
      const combined = accumulated + chunk;
      const idx = combined.indexOf(META_MARKER);
      if (idx === -1) {
        accumulated = combined;
        onChunk?.(chunk, accumulated);
        continue;
      }

      // Found the sentinel: split content from meta and switch modes.
      accumulated = combined.slice(0, idx);
      metaJson = combined.slice(idx + META_MARKER.length);
      inMeta = true;
      // Push the corrected accumulated to the consumer so any partial
      // marker text already shown gets cleaned up visually.
      onChunk?.("", accumulated);
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { dbml: null, error: "Cancelled." };
    }
    return { dbml: null, error: `Stream interrupted: ${(err as Error).message}` };
  }

  let meta: StreamDbmlMeta | undefined;
  if (metaJson.trim()) {
    try {
      meta = JSON.parse(metaJson.trim()) as StreamDbmlMeta;
    } catch {
      // ignore malformed metadata; the content is still usable
    }
  }

  const final = stripFences(accumulated);
  if (!final) {
    return {
      dbml: null,
      error: meta?.truncated
        ? "Response was truncated before any content arrived."
        : "Empty response.",
      meta,
    };
  }
  return { dbml: final, error: null, meta };
}

// Even with explicit "no fences" instructions, models occasionally wrap output
// in ```dbml ... ```. Strip a single leading + trailing fence if present.
function stripFences(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^```(?:dbml|sql)?\n?([\s\S]*?)\n?```$/);
  return (m ? m[1] : trimmed).trim();
}

// Supabase Edge Function: text-to-dbml
//
// Streams OpenAI's content deltas back to the browser as plain text chunks.
// Errors before streaming begins are returned as JSON with a non-2xx status,
// so the frontend can branch on `response.ok` cleanly.
//
// JWT verification is on by default — supabase.functions.invoke() (and our
// raw-fetch streaming caller) attach the signed-in user's JWT automatically;
// anonymous traffic is rejected before this handler runs.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a database schema designer. The user describes a system or a change in plain language; you reply with complete, valid DBML (Database Markup Language).

Output format — hard rules:
- Return ONLY valid DBML. No markdown fences, no commentary, no surrounding prose.
- Use snake_case for table and column names.

Off-topic handling:
- If the user's message is NOT a database-schema request (e.g. "what can you do?", "hello", general chat), reply with one or two short sentences in plain English explaining you can only help with database schemas. Do NOT return any DBML in that case. Do NOT echo back the existing schema.

Modeling rules:
- Every table has a primary key. Default to \`id integer [pk, increment]\` unless the user asks otherwise.
- Foreign keys use the inline syntax: \`user_id integer [ref: > users.id, not null]\` (the \`>\` means many-to-one).
- Mark non-nullable columns with [not null], unique columns with [unique].
- Use \`timestamp [default: \\\`now()\\\`]\` for created_at / updated_at columns where appropriate.
- Prefer \`decimal\` for money, \`text\` for long strings, \`varchar\` for short strings.
- Only include tables, columns, and refs the user asked for or that are clearly implied. Do not invent extra entities.

Iterative editing — when the user message contains a "Current DBML:" block:
- Default behavior is additive: preserve every existing top-level construct (Tables, Refs, Enums, Project blocks, TableGroups, Notes, comments, blank lines) byte-for-byte, and apply the user's change by ADDING new constructs at the appropriate location.
- Honor explicit destructive requests. If the user says "delete X", "remove X", "drop X", "rewrite X", or otherwise unambiguously asks you to remove or replace a specific construct, do so — but ONLY touch what they named. Every other existing construct, comment, and blank line must remain byte-identical.
- If the change requires modifying an existing column or attribute (e.g. adding a constraint), change only that one attribute and leave every other line byte-identical.
- Return the COMPLETE updated DBML: every preserved line verbatim, plus any additions, minus only what the user explicitly asked to remove.`;

interface RequestBody {
  prompt?: string;
  currentDbml?: string;
}

/** Cap on the model's output. Generous for any reasonable DBML schema while
 *  bounding worst-case cost — gpt-5.4-mini is cheap, but uncapped output
 *  + prompt-injection style abuse could still rack up a bill. */
const MAX_OUTPUT_TOKENS = 36_000;

/** Sentinel emitted at the very end of the response stream when OpenAI's
 *  finish_reason is "length" (i.e. we hit MAX_OUTPUT_TOKENS). The frontend
 *  strips this and shows a "response was truncated" banner in the turn
 *  card. Picked to be improbable in real DBML so we don't accidentally
 *  cut off legitimate content. */
const META_MARKER = "\n[[__SCHEMASYNC_META__]]\n";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError("Method not allowed.", 405);
  }

  const apiKey = Deno.env.get("OPENAI_KEY");
  if (!apiKey) {
    return jsonError(
      "Server is missing OPENAI_KEY. Set it via `supabase secrets set`.",
      500,
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return jsonError("Missing `prompt`.", 400);
  if (prompt.length > 24000) {
    return jsonError("Prompt too long (max 24000 characters).", 400);
  }

  const currentDbml = body.currentDbml?.trim();
  if (currentDbml && currentDbml.length > 48000) {
    return jsonError("Current schema too large (max 48k characters).", 400);
  }

  const userMessage = currentDbml
    ? `Current DBML:\n\`\`\`dbml\n${currentDbml}\n\`\`\`\n\nUser request:\n${prompt}`
    : prompt;

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        temperature: 0.2,
        stream: true,
        // gpt-5.x uses max_completion_tokens; the older max_tokens is rejected
        // ("Unsupported parameter") on these models.
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
  } catch (err) {
    return jsonError(`Network error reaching OpenAI: ${String(err)}`, 502);
  }

  if (!openaiRes.ok || !openaiRes.body) {
    const text = await openaiRes.text().catch(() => "");
    return jsonError(
      `OpenAI ${openaiRes.status}: ${text.slice(0, 500) || "no body"}`,
      502,
    );
  }

  // Transform OpenAI's SSE stream into a plain-text stream of just the
  // content deltas. The browser side reads this with a TextDecoder and
  // appends to its accumulator.
  const upstream = openaiRes.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      // Tracked across SSE events; emitted as a sentinel after the stream
      // ends if the model was cut off by max_tokens.
      let finishReason: string | null = null;

      const finalize = () => {
        if (finishReason === "length") {
          controller.enqueue(
            encoder.encode(
              META_MARKER + JSON.stringify({ truncated: true }) + "\n",
            ),
          );
        }
        controller.close();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // SSE events are separated by blank lines; each event has one or
          // more `data: <json>` lines. We split on \n and process complete
          // lines, keeping any tail after the last \n in `buf`.
          let nl;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              finalize();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              const finish = parsed?.choices?.[0]?.finish_reason;
              if (typeof finish === "string") finishReason = finish;
              if (typeof delta === "string" && delta.length > 0) {
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // ignore malformed line
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      finalize();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

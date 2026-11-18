import "server-only";
import { env } from "../env";
import { AppError } from "../errors";

/**
 * Minimal LLM adapter with tool calling. Supports Anthropic (default) and
 * OpenAI-compatible APIs. All AI features degrade gracefully when no key is set.
 */

export interface Tool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export type ToolRunner = (name: string, input: Record<string, unknown>) => Promise<unknown>;

export function aiConfigured(): boolean {
  const e = env();
  return e.AI_PROVIDER !== "none" && Boolean(e.AI_API_KEY);
}

/** Single-shot completion. */
export async function complete(system: string, user: string, maxTokens = 1200): Promise<string> {
  return runWithTools({ system, user, tools: [], runTool: async () => null, maxTokens });
}

/** Tool loop: the model can only state numbers that came back from tools. */
export async function runWithTools(opts: { system: string; user: string; tools: Tool[]; runTool: ToolRunner; maxTokens?: number; maxSteps?: number }): Promise<string> {
  const e = env();
  if (!aiConfigured()) throw new AppError("AI_NOT_CONFIGURED", "AI is not configured. Set AI_API_KEY in .env.", 503);
  return e.AI_PROVIDER === "openai" ? openaiLoop(opts) : anthropicLoop(opts);
}

async function anthropicLoop(opts: { system: string; user: string; tools: Tool[]; runTool: ToolRunner; maxTokens?: number; maxSteps?: number }) {
  const e = env();
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: opts.user }];
  for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": e.AI_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: e.AI_MODEL, max_tokens: opts.maxTokens ?? 1200, system: opts.system, messages, ...(opts.tools.length ? { tools: opts.tools } : {}) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new AppError("AI_ERROR", `AI request failed (${res.status}).`, 502);
    const data = (await res.json()) as { stop_reason: string; content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[] };
    if (data.stop_reason !== "tool_use") return data.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    messages.push({ role: "assistant", content: data.content });
    const results = [];
    for (const block of data.content.filter((c) => c.type === "tool_use")) {
      let output: unknown;
      try {
        output = await opts.runTool(block.name!, block.input ?? {});
      } catch (err) {
        output = { error: err instanceof Error ? err.message : "Tool failed" };
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
    }
    messages.push({ role: "user", content: results });
  }
  throw new AppError("AI_LOOP", "The assistant could not finish this request.", 502);
}

async function openaiLoop(opts: { system: string; user: string; tools: Tool[]; runTool: ToolRunner; maxTokens?: number; maxSteps?: number }) {
  const e = env();
  const messages: Record<string, unknown>[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const tools = opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.AI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: e.AI_MODEL, max_tokens: opts.maxTokens ?? 1200, messages, ...(tools.length ? { tools } : {}) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new AppError("AI_ERROR", `AI request failed (${res.status}).`, 502);
    const data = (await res.json()) as { choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
    const msg = data.choices[0]!.message;
    if (!msg.tool_calls?.length) return (msg.content ?? "").trim();
    messages.push(msg as unknown as Record<string, unknown>);
    for (const call of msg.tool_calls) {
      let output: unknown;
      try {
        output = await opts.runTool(call.function.name, JSON.parse(call.function.arguments || "{}"));
      } catch (err) {
        output = { error: err instanceof Error ? err.message : "Tool failed" };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }
  throw new AppError("AI_LOOP", "The assistant could not finish this request.", 502);
}

/** Extract the first JSON object from model output. */
export function parseJsonBlock<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new AppError("AI_FORMAT", "AI returned an unexpected format. Try again.", 502);
  return JSON.parse(match[0]) as T;
}

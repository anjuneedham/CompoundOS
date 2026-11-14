import Anthropic from "@anthropic-ai/sdk";
import type { LlmTransport } from "./orchestrator";

/** Server-only Claude transport. Never import from client components. */
export function createAnthropicTransport(): LlmTransport | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const effort = (process.env.ANTHROPIC_EFFORT || "medium") as "low" | "medium" | "high";
  return {
    async complete({ system, user, jsonSchema, maxTokens }) {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { effort, format: { type: "json_schema", schema: jsonSchema } },
      });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model: res.model, stopReason: res.stop_reason };
    },
  };
}

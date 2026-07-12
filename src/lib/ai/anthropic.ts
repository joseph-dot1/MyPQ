// Server-side Anthropic client. Never import from client components.

import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type AiResult = {
  text: string;
  tokensIn: number;
  tokensOut: number;
};

export async function groundedCompletion(
  system: string,
  prompt: string,
  maxTokens = 2048
): Promise<AiResult> {
  const response = await anthropic().messages.create({
    model: config.aiModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

// Pull a JSON value out of a model response that may wrap it in prose/fences.
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  for (let end = candidate.length; end > start; end--) {
    try {
      return JSON.parse(candidate.slice(start, end)) as T;
    } catch {
      // keep shrinking
    }
  }
  return null;
}

import { config } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  if (!config.llm.apiKey) {
    throw new Error(
      'OPENCODE_GO_API_KEY is not set. Add it to .env (see .env.example).',
    );
  }

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: opts.temperature ?? config.llm.temperature,
      max_tokens: opts.maxTokens ?? config.llm.maxTokens,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('LLM returned empty content');
  return content;
}

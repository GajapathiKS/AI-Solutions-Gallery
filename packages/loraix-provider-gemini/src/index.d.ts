export type GeminiProviderRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type GeminiProviderResult = {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export declare class GeminiProvider {
  name: string;
  constructor(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch });
  generate(request: GeminiProviderRequest, ctx?: { timeoutMs?: number; attempt?: number; signal?: AbortSignal }): Promise<GeminiProviderResult>;
  stream(request: GeminiProviderRequest, ctx?: { timeoutMs?: number; attempt?: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

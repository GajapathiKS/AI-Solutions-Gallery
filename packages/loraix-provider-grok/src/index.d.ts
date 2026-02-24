export type GrokProviderRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type GrokProviderResult = {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export declare class GrokProvider {
  name: string;
  constructor(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch });
  generate(request: GrokProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<GrokProviderResult>;
  stream(request: GrokProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

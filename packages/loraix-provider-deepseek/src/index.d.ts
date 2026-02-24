export type DeepSeekProviderRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type DeepSeekProviderResult = {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export declare class DeepSeekProvider {
  name: string;
  constructor(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch });
  generate(request: DeepSeekProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<DeepSeekProviderResult>;
  stream(request: DeepSeekProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

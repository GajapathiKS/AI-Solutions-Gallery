export type OpenAIProviderRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type OpenAIProviderResult = {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export declare class OpenAIProvider {
  name: string;
  constructor(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch });
  generate(request: OpenAIProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<OpenAIProviderResult>;
  stream(request: OpenAIProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

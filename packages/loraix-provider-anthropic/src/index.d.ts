export type AnthropicProviderRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type AnthropicProviderResult = {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export declare class AnthropicProvider {
  name: string;
  constructor(opts: { apiKey: string; baseUrl?: string; anthropicVersion?: string; fetchImpl?: typeof fetch });
  generate(request: AnthropicProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<AnthropicProviderResult>;
  stream(request: AnthropicProviderRequest, ctx?: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

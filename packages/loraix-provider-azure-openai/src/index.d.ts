export type AzureOpenAIProviderRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type AzureOpenAIProviderResult = {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export declare class AzureOpenAIProvider {
  name: string;
  constructor(opts: {
    apiKey: string;
    resourceName?: string;
    deployment: string;
    apiVersion?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  });
  generate(request: AzureOpenAIProviderRequest, ctx?: { timeoutMs?: number; attempt?: number; signal?: AbortSignal }): Promise<AzureOpenAIProviderResult>;
  stream(request: AzureOpenAIProviderRequest, ctx?: { timeoutMs?: number; attempt?: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

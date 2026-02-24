import type { BedrockRuntimeClient, BedrockRuntimeClientConfig } from '@aws-sdk/client-bedrock-runtime';

export type BedrockProviderRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type BedrockProviderResult = {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export declare class BedrockProvider {
  name: string;
  constructor(opts?: {
    apiKey?: never;
    region?: BedrockRuntimeClientConfig['region'];
    credentials?: BedrockRuntimeClientConfig['credentials'];
    endpoint?: BedrockRuntimeClientConfig['endpoint'];
    bedrockClient?: Pick<BedrockRuntimeClient, 'send'>;
  });
  generate(request: BedrockProviderRequest, ctx?: { timeoutMs?: number; attempt?: number; signal?: AbortSignal }): Promise<BedrockProviderResult>;
  stream(request: BedrockProviderRequest, ctx?: { timeoutMs?: number; attempt?: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

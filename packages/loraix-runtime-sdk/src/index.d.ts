export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SimpleSchema = Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;

export type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LoraixResponse<T = unknown> = {
  text: string;
  json?: T;
  provider: string;
  model: string;
  usage?: Usage;
  latencyMs: number;
  attempts: number;
  fallbackUsed?: boolean;
  raw: unknown;
};

export type GenerateOptions = {
  provider?: ProviderAdapter;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fallbackProviders?: ProviderAdapter[];
};

export type RetryStrategy = {
  baseDelayMs?: number;
  computeDelay?: (attempt: number, error: unknown, config: LoraixRuntimeConfig) => number | null;
};

export type Interceptors = {
  request?: Array<(request: ProviderRequest) => unknown | Promise<unknown>>;
  attempt?: Array<(meta: { provider: string; attempt: number; request: ProviderRequest }) => unknown | Promise<unknown>>;
  response?: Array<(response: LoraixResponse) => unknown | Promise<unknown>>;
};

export type LoraixRuntimeConfig = {
  provider: ProviderAdapter;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryStrategy?: RetryStrategy;
  maxRetries?: number;
  fallbackProviders?: ProviderAdapter[];
  interceptors?: Interceptors;
};

export type ProviderRequest = {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type ProviderResult = {
  text: string;
  usage?: Usage;
  raw?: unknown;
};

export interface ProviderAdapter {
  name: string;
  generate(request: ProviderRequest, ctx: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<ProviderResult>;
  stream?(request: ProviderRequest, ctx: { timeoutMs?: number; attempt: number; signal?: AbortSignal }): Promise<AsyncIterable<string>>;
}

export declare class LoraixRuntimeError extends Error {
  [key: string]: unknown;
}

export declare class LoraixJsonValidationError extends LoraixRuntimeError {}

export declare class LoraixRuntime {
  constructor(config: LoraixRuntimeConfig);
  generate(input: string | ({ messages: ChatMessage[] } & GenerateOptions), options?: GenerateOptions): Promise<LoraixResponse>;
  json<T = unknown>(input: {
    prompt?: string;
    messages?: ChatMessage[];
    schema: SimpleSchema;
  } & GenerateOptions): Promise<LoraixResponse<T>>;
  stream(input: string | ({ messages: ChatMessage[] } & GenerateOptions), options?: GenerateOptions): AsyncIterable<string>;
}

export declare function createRuntime(config: LoraixRuntimeConfig): LoraixRuntime;
export declare function generate(input: string | ({ messages: ChatMessage[] } & GenerateOptions), options: GenerateOptions | undefined, config: LoraixRuntimeConfig): Promise<LoraixResponse>;

export declare class OpenAIProvider implements ProviderAdapter {
  name: string;
  constructor(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch });
  generate(request: ProviderRequest): Promise<ProviderResult>;
  stream(request: ProviderRequest): Promise<AsyncIterable<string>>;
}

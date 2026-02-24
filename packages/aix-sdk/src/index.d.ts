export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'grok'
  | 'bedrock'
  | 'gemini'
  | 'azure-openai';

export declare class AixSDKError extends Error {}

export declare function loadRuntimeCtor(deps?: { LoraixRuntime?: new (...args: any[]) => any }): Promise<new (...args: any[]) => any>;

export declare function loadProviderCtor(
  provider: ProviderName,
  deps?: { providerCtor?: new (...args: any[]) => any }
): Promise<new (...args: any[]) => any>;

export declare function createAixRuntime(config: Record<string, unknown>, deps?: { LoraixRuntime?: new (...args: any[]) => any }): Promise<any>;

export declare function createProvider(
  provider: ProviderName,
  options?: Record<string, unknown>,
  deps?: { providerCtor?: new (...args: any[]) => any }
): Promise<any>;

export declare function createAixClient(
  config: {
    provider: ProviderName;
    providerOptions?: Record<string, unknown>;
    model: string;
    runtimeOptions?: Record<string, unknown>;
  },
  deps?: { LoraixRuntime?: new (...args: any[]) => any; providerCtor?: new (...args: any[]) => any }
): Promise<any>;

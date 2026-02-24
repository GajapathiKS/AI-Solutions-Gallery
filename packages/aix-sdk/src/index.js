const PROVIDER_LOADERS = {
  openai: () => import('loraix-provider-openai').then((m) => m.OpenAIProvider),
  anthropic: () => import('loraix-provider-anthropic').then((m) => m.AnthropicProvider),
  deepseek: () => import('loraix-provider-deepseek').then((m) => m.DeepSeekProvider),
  grok: () => import('loraix-provider-grok').then((m) => m.GrokProvider),
  bedrock: () => import('loraix-provider-bedrock').then((m) => m.BedrockProvider),
  gemini: () => import('loraix-provider-gemini').then((m) => m.GeminiProvider),
  'azure-openai': () => import('loraix-provider-azure-openai').then((m) => m.AzureOpenAIProvider)
};

class AixSDKError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AixSDKError';
    Object.assign(this, options);
  }
}

export async function loadRuntimeCtor(deps = {}) {
  if (deps.LoraixRuntime) return deps.LoraixRuntime;
  const runtimeModule = await import('loraix-runtime-core');
  return runtimeModule.LoraixRuntime;
}

export async function loadProviderCtor(provider, deps = {}) {
  if (deps.providerCtor) return deps.providerCtor;
  const loader = PROVIDER_LOADERS[provider];
  if (!loader) {
    throw new AixSDKError(`Unknown provider: ${provider}`);
  }
  return loader();
}

export async function createAixRuntime(config, deps = {}) {
  const RuntimeCtor = await loadRuntimeCtor(deps);
  return new RuntimeCtor(config);
}

export async function createProvider(provider, options = {}, deps = {}) {
  const ProviderCtor = await loadProviderCtor(provider, deps);
  return new ProviderCtor(options);
}

export async function createAixClient({ provider, providerOptions = {}, model, runtimeOptions = {} }, deps = {}) {
  const providerInstance = await createProvider(provider, providerOptions, deps);
  return createAixRuntime(
    {
      provider: providerInstance,
      model,
      ...runtimeOptions
    },
    deps
  );
}

export { AixSDKError };

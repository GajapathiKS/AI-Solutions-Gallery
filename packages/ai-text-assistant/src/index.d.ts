export type VoiceAssistPrompt = {
  id: string;
  label: string;
  instruction: string;
};

export type VoiceAssistProviderPreset = {
  id: string;
  label: string;
  description?: string;
  config?: Partial<VoiceAssistAiConfig>;
};

export type VoiceAssistAiConfig = {
  provider?: string;
  providerPreset?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  headers?: Record<string, string>;
  systemPrompt?: string;
  buildPayload?: (ctx: {
    instruction: string;
    text: string;
    config: VoiceAssistAiConfig;
    prompt: VoiceAssistPrompt;
  }) => unknown;
  transformResponse?: (data: unknown) => string;
};

export type VoiceAssistAdminConfig = {
  allowRuntimeConfig?: boolean;
  persistRuntimeConfig?: boolean;
  storageKey?: string;
  exposeApiKeyField?: boolean;
  editableRuntimeFields?: Array<'providerPreset' | 'endpoint' | 'apiKey' | 'model' | 'systemPrompt'>;
  providerPresets?: VoiceAssistProviderPreset[];
  allowedEndpoints?: string[];
  modelOptions?: string[];
};

export type VoiceAssistBranding = {
  title?: string;
  configButtonLabel?: string;
};

export type VoiceAssistUiConfig = {
  theme?: 'default' | 'slate' | 'high-contrast';
  density?: 'comfortable' | 'compact';
};

export type VoiceAssistSpeechConfig = {
  locale?: string;
  interimResults?: boolean;
  insertionMode?: 'append' | 'replace-selection' | 'replace-all';
};

export type VoiceAssistAiRequest = (ctx: {
  text: string;
  instruction: string;
  config: VoiceAssistAiConfig;
  signal?: AbortSignal;
  prompt: VoiceAssistPrompt;
}) => Promise<string>;

export interface VoiceAssistOptions {
  root?: Document | HTMLElement | ShadowRoot;
  autoAttach?: boolean;
  prompts?: VoiceAssistPrompt[];
  aiConfig?: Partial<VoiceAssistAiConfig>;
  adminConfig?: VoiceAssistAdminConfig;
  branding?: VoiceAssistBranding;
  uiConfig?: VoiceAssistUiConfig;
  aiInsertionMode?: 'append' | 'replace-selection' | 'replace-all';
  speechConfig?: VoiceAssistSpeechConfig;
  aiRequest?: VoiceAssistAiRequest;
}

export declare class VoiceAssistPlugin {
  constructor(options?: VoiceAssistOptions);

  prompts: VoiceAssistPrompt[];
  activeElement: HTMLElement | null;
  speechConfig: VoiceAssistSpeechConfig;

  attach(): void;
  detach(): void;
  destroy(): void;

  startSpeechCapture(): void;
  stopSpeechCapture(): void;

  runAiAction(prompt: VoiceAssistPrompt): Promise<void>;
  readSelectionAloud(): void;
  stopReadAloud(): void;
  summarizeSelection(): void;
  readWindowSelectionAloud(): void;
  grammarCheckWindowSelection(): void;
  summarizeWindowSelection(): void;

  getAIConfig(): VoiceAssistAiConfig;
  setAIConfig(config: Partial<VoiceAssistAiConfig>): void;
  setRuntimeAIConfig(config: Partial<VoiceAssistAiConfig>): void;

  getSpeechConfig(): VoiceAssistSpeechConfig;
  setSpeechConfig(config: Partial<VoiceAssistSpeechConfig>): void;

  getAiInsertionMode(): 'append' | 'replace-selection' | 'replace-all';
  setAiInsertionMode(mode: 'append' | 'replace-selection' | 'replace-all'): void;

  setPrompts(prompts: VoiceAssistPrompt[]): void;
}

export declare const DEFAULT_PROMPTS: VoiceAssistPrompt[];
export declare const DEFAULT_AI_CONFIG: VoiceAssistAiConfig;
export declare const DEFAULT_ADMIN_CONFIG: VoiceAssistAdminConfig;
export declare const DEFAULT_PROVIDER_PRESETS: VoiceAssistProviderPreset[];
export declare const DEFAULT_BRANDING: VoiceAssistBranding;
export declare const DEFAULT_UI_CONFIG: VoiceAssistUiConfig;
export declare function isEndpointAllowed(endpoint: string, allowedEndpoints?: string[]): boolean;
export declare const defaultAiRequest: VoiceAssistAiRequest;

export default VoiceAssistPlugin;

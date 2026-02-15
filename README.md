# AI Text Assistant Plugin

A framework-agnostic plugin for adding AI-assisted writing and voice features to any web app.

## What it does

When a user focuses a text input, textarea, or `contenteditable` element, the assistant overlay appears with:

- Speech-to-text input
- AI prompt actions (fix grammar, summarize, expand, etc.)
- Selection tools:
  - Read highlighted text aloud
  - Summarize only highlighted text
- Admin-controlled runtime AI settings (safe for marketplace/tenant scenarios)

## Installation

```bash
npm install ai-text-assistant-plugin
# or
pnpm add ai-text-assistant-plugin
```

## Quick start

```js
import VoiceAssistPlugin from 'ai-text-assistant-plugin';

const plugin = new VoiceAssistPlugin({
  aiConfig: {
    endpoint: '/api/ai/chat',
    model: 'gpt-4o-mini'
  },
  adminConfig: {
    allowRuntimeConfig: true,
    editableRuntimeFields: ['providerPreset', 'endpoint', 'model', 'systemPrompt'],
    allowedEndpoints: ['/api/ai/', 'https://api.groq.com/openai/']
  },
  branding: {
    title: 'AI Text Assistant',
    configButtonLabel: '⚙️ Settings'
  },
  uiConfig: {
    theme: 'default',
    density: 'comfortable'
  }
});
```

## Screenshots

A current UI screenshot is included in this PR/response (selection tools + clean layout).

## Works with which frameworks?

This plugin is **framework-agnostic** and works in any browser-based UI stack:

- React / Next.js (client-side)
- Angular
- Vue / Nuxt (client-side)
- Svelte / SvelteKit (client-side)
- Vanilla JavaScript / Web Components

## Key configuration

### `aiConfig`

| Option | Description |
| --- | --- |
| `endpoint` | AI chat/completions endpoint. |
| `apiKey` | Optional bearer key for default requests. |
| `model` | Model name for request payload. |
| `systemPrompt` | System instruction for default prompt builder. |
| `buildPayload` | Custom payload builder function. |
| `transformResponse` | Custom response extraction function. |

### `adminConfig`

| Option | Description |
| --- | --- |
| `allowRuntimeConfig` | Show/hide runtime settings UI. |
| `editableRuntimeFields` | Whitelist which fields users can edit. |
| `providerPresets` | Preset catalog (OpenAI-compatible / Ollama / etc.). |
| `allowedEndpoints` | Endpoint prefix allowlist for safety. |
| `persistRuntimeConfig` | Persist approved runtime settings in localStorage. |

### `uiConfig`

| Option | Values |
| --- | --- |
| `theme` | `default` \| `slate` \| `high-contrast` |
| `density` | `comfortable` \| `compact` |

## Runtime APIs

- `plugin.runAiAction(prompt)`
- `plugin.startSpeechCapture()` / `plugin.stopSpeechCapture()`
- `plugin.readSelectionAloud()` / `plugin.stopReadAloud()`
- `plugin.summarizeSelection()`
- `plugin.setAIConfig(partial)`
- `plugin.setRuntimeAIConfig(partial)`
- `plugin.setPrompts(prompts)`

## Browser support

- Web Speech API required for speech-to-text.
- Speech Synthesis API required for read-aloud.
- Fetch API required for default AI network calls.

## Development

```bash
npm test
```

## License

MIT

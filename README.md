# AI-Solutions-Gallery

This repository contains multiple solutions and experiments.  
Current publishable packages:


## Documentation portal

- Recommended: publish `/docs` via GitHub Pages for discoverability and onboarding.
- Suggested URL shape: `https://<org-or-user>.github.io/<repo>/`.

## GitHub Pages deployment

Docs deployment is automated by `.github/workflows/deploy-docs-pages.yml`.

1. In GitHub repo settings, set **Pages** source to **GitHub Actions** (admin action; required once).
2. Keep docs in `docs/` and push changes to `main` (or run workflow manually with `workflow_dispatch`).
3. Workflow first checks Pages API availability; if unavailable, it exits cleanly with setup guidance instead of failing CI.
4. Site will publish to `https://<org-or-user>.github.io/<repo>/`.

## npm publish secret

Publish workflows use `NPM_TOKEN` for npm authentication.
Set one repository secret with an npm publish-capable token (granular token with package write + 2FA bypass when required).

## 1.0.0 launch readiness checklist

Before tagging `1.0.0` across packages:
- [ ] Bump each package version from `0.1.0` to `1.0.0`.
- [ ] Create release notes/changelog entries per package.
- [ ] Verify npm ownership + `NPM_TOKEN` secret in GitHub Actions.
- [ ] Dry-run tests in each package (`npm test`).
- [ ] Push semver tags matching each workflow trigger (for example `loraix-provider-openai-v1.0.0`).

- `packages/ai-text-assistant/`
- `packages/aix-sdk/`
- `packages/loraix-runtime-core/`
- `packages/loraix-provider-openai/`
- `packages/loraix-provider-anthropic/`
- `packages/loraix-provider-deepseek/`
- `packages/loraix-provider-grok/`
- `packages/loraix-provider-bedrock/`
- `packages/loraix-provider-gemini/`
- `packages/loraix-provider-azure-openai/`

## AI Text Assistant package

Path: `packages/ai-text-assistant`

What it includes:
- publish-ready `package.json`
- source in `src/`
- tests in `tests/`
- runnable demo in `examples/basic.html`
- package docs in `README.md`
- demo voiceover script in `docs/demo-video-voiceover-script.md`

## Run the plugin package locally

```bash
cd packages/ai-text-assistant
npm install
npm test
```

## LoraixRuntime Core package

Path: `packages/loraix-runtime-core`

Package name: `loraix-runtime-core`

What it includes:
- provider-agnostic runtime core
- unified execution pipeline, retries, fallbacks, JSON mode, streaming abstractions

## Loraix OpenAI Provider package

Path: `packages/loraix-provider-openai`

Package name: `loraix-provider-openai`

What it includes:
- OpenAI provider adapter for `loraix-runtime-core`
- chat completions + streaming implementation

## Preferred install/import style

```bash
npm install loraix-runtime-core loraix-provider-openai
```

```js
import { LoraixRuntime } from 'loraix-runtime-core';
import { OpenAIProvider } from 'loraix-provider-openai';
// or: import { AnthropicProvider } from 'loraix-provider-anthropic';
// or: import { DeepSeekProvider } from 'loraix-provider-deepseek';
// or: import { GrokProvider } from 'loraix-provider-grok';
// or: import { BedrockProvider } from 'loraix-provider-bedrock';
// or: import { GeminiProvider } from 'loraix-provider-gemini';
// or: import { AzureOpenAIProvider } from 'loraix-provider-azure-openai';

const ai = new LoraixRuntime({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  model: 'gpt-4o-mini'
});
```


## Loraix Anthropic Provider package

Path: `packages/loraix-provider-anthropic`

Package name: `loraix-provider-anthropic`

What it includes:
- Anthropic Claude provider adapter for `loraix-runtime-core`
- messages API + streaming text delta implementation


## Loraix DeepSeek Provider package

Path: `packages/loraix-provider-deepseek`

Package name: `loraix-provider-deepseek`

What it includes:
- DeepSeek provider adapter for `loraix-runtime-core`
- OpenAI-compatible chat completions + streaming text delta implementation


## Loraix Grok Provider package

Path: `packages/loraix-provider-grok`

Package name: `loraix-provider-grok`

What it includes:
- Grok (xAI) provider adapter for `loraix-runtime-core`
- OpenAI-compatible chat completions + streaming text delta implementation


## Loraix Bedrock Provider package

Path: `packages/loraix-provider-bedrock`

Package name: `loraix-provider-bedrock`

What it includes:
- Amazon Bedrock provider adapter for `loraix-runtime-core`
- AWS Bedrock Runtime SDK adapter (Converse + ConverseStream) with SigV4 auth for model IDs and inference profiles


## Loraix Gemini Provider package

Path: `packages/loraix-provider-gemini`

Package name: `loraix-provider-gemini`

What it includes:
- Google Gemini provider adapter for `loraix-runtime-core`
- generateContent + streamGenerateContent SSE text implementation


## Loraix Azure OpenAI Provider package

Path: `packages/loraix-provider-azure-openai`

Package name: `loraix-provider-azure-openai`

What it includes:
- Azure OpenAI deployment-based provider adapter for `loraix-runtime-core`
- chat completions + streaming text delta implementation


## Aix SDK package

Path: `packages/aix-sdk`

Package name: `aix-sdk`

What it includes:
- Unified SDK facade over `loraix-runtime-core` + provider packages
- Helper APIs to create provider instances and runtime clients

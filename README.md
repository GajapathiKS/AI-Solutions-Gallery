# AI-Solutions-Gallery

This repository contains multiple solutions and experiments.  
The reusable text plugin now lives in a dedicated standalone package folder:

- `packages/ai-text-assistant/`
- `packages/loraix-runtime-sdk/`

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


## LoraixRuntime SDK package

Path: `packages/loraix-runtime-sdk`

Package name: `loraix-runtime-sdk`

What it includes:
- provider-agnostic runtime core (LoraixRuntime)
- OpenAI provider adapter
- retry/fallback/json/stream abstractions
- tests in `tests/`
